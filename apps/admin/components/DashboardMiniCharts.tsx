'use client';

import React, { useState } from 'react';
import type { AdminDailyPoint, AdminOverviewTrends } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';

export interface DashboardMiniChartsProps {
  trends: AdminOverviewTrends;
}

/**
 * Formats a UTC ISO date string (YYYY-MM-DD) into French locale display date.
 * Example: "2026-10-12" -> "12 oct. 2026"
 */
export function formatChartTooltipDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * Formats a tooltip data point value depending on chart type.
 */
export function formatChartTooltipValue(value: number, type: 'revenue' | 'demandes'): string {
  if (type === 'revenue') {
    return formatEuros(value);
  }
  const safeCount = Number.isFinite(value) ? value : 0;
  return `${formatCount(safeCount)} ${safeCount > 1 ? 'demandes' : 'demande'}`;
}

interface MiniChartProps {
  title: string;
  subtitle: string;
  totalFormatted: string;
  points: AdminDailyPoint[];
  strokeColor: string;
  gradientId: string;
  type: 'revenue' | 'demandes';
}

function MiniChart({
  title,
  subtitle,
  totalFormatted,
  points,
  strokeColor,
  gradientId,
  type,
}: MiniChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 500;
  const height = 160;
  const paddingTop = 16;
  const paddingBottom = 24;
  const paddingLeft = 16;
  const paddingRight = 16;

  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;

  const coords = points.map((p, i) => {
    const x = paddingLeft + (n > 1 ? (i / (n - 1)) * innerWidth : innerWidth / 2);
    const y = paddingTop + innerHeight - (p.value / maxVal) * innerHeight;
    return { x, y, point: p };
  });

  const linePath = coords.reduce((acc, c, i) => {
    return i === 0 ? `M ${c.x.toFixed(1)} ${c.y.toFixed(1)}` : `${acc} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }, '');

  const firstX = coords[0]?.x.toFixed(1) ?? String(paddingLeft);
  const lastX = coords[coords.length - 1]?.x.toFixed(1) ?? String(paddingLeft + innerWidth);
  const baselineY = (paddingTop + innerHeight).toFixed(1);
  const areaPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

  const hoveredCoord = hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < coords.length ? coords[hoveredIdx] : null;

  const step = n > 1 ? innerWidth / (n - 1) : innerWidth;

  return (
    <article className="chart-card">
      <div className="chart-card__header">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          <p className="chart-card__subtitle">{subtitle}</p>
        </div>
        <span className="chart-card__total">{totalFormatted}</span>
      </div>

      <div className="chart-card__svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="chart-card__svg"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} - ${subtitle}`}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Baseline */}
          <line
            x1={paddingLeft}
            y1={paddingTop + innerHeight}
            x2={paddingLeft + innerWidth}
            y2={paddingTop + innerHeight}
            stroke="var(--line, #dfe2e2)"
            strokeWidth="1"
          />

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Trend line */}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Active hover crosshair and circle */}
          {hoveredCoord && (
            <>
              <line
                x1={hoveredCoord.x}
                y1={paddingTop}
                x2={hoveredCoord.x}
                y2={paddingTop + innerHeight}
                stroke="var(--line, #dfe2e2)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={hoveredCoord.x}
                cy={hoveredCoord.y}
                r={5}
                fill={strokeColor}
                stroke="var(--paper)"
                strokeWidth="2"
              />
            </>
          )}

          {/* Transparent hit boxes for each daily point */}
          {coords.map((c, i) => {
            const hitX = Math.max(0, c.x - step / 2);
            return (
              <rect
                key={c.point.date}
                x={hitX}
                y={paddingTop}
                width={step}
                height={innerHeight + paddingBottom}
                fill="transparent"
                className="chart-hit-area"
                data-date={c.point.date}
                data-value={c.point.value}
                data-index={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseMove={() => setHoveredIdx(i)}
              />
            );
          })}
        </svg>

        {hoveredCoord && (
          <div
            className="chart-tooltip"
            style={{
              left: `${((hoveredCoord.x / width) * 100).toFixed(1)}%`,
              top: `${Math.max(10, ((hoveredCoord.y / height) * 100) - 15).toFixed(1)}%`,
            }}
          >
            <span className="chart-tooltip__date">{formatChartTooltipDate(hoveredCoord.point.date)}</span>
            <span className="chart-tooltip__value">
              {formatChartTooltipValue(hoveredCoord.point.value, type)}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export function DashboardMiniCharts({ trends }: DashboardMiniChartsProps) {
  const totalRevenue = trends.revenue.reduce((acc, p) => acc + p.value, 0);
  const totalDemandes = trends.demandes.reduce((acc, p) => acc + p.value, 0);

  return (
    <section className="charts-grid" aria-label="Tendances des 30 derniers jours">
      <MiniChart
        title="Chiffre d'affaires"
        subtitle="30 derniers jours"
        totalFormatted={formatEuros(totalRevenue)}
        points={trends.revenue}
        strokeColor="var(--navy)"
        gradientId="revenue-gradient"
        type="revenue"
      />
      <MiniChart
        title="Demandes publiées"
        subtitle="30 derniers jours"
        totalFormatted={formatCount(totalDemandes)}
        points={trends.demandes}
        strokeColor="var(--badge-info-text)"
        gradientId="demandes-gradient"
        type="demandes"
      />
    </section>
  );
}
