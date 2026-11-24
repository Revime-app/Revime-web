'use client';

import { useState } from 'react';
import type { AdminStatsOverviewDto } from '@revime/shared';
import { formatEuros, formatCount } from './StatsKpiCards';

export interface FinancialTrendsChartProps {
  timeseries: AdminStatsOverviewDto['timeseries'];
  initialMode?: 'financials' | 'activity';
}

type ChartMode = 'financials' | 'activity';

function computeScaleCeil(values: number[]): number {
  const rawMax = Math.max(...values, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  let tickFactor = 10;
  if (normalized <= 1) tickFactor = 1;
  else if (normalized <= 2) tickFactor = 2;
  else if (normalized <= 5) tickFactor = 5;
  return Math.ceil(rawMax / (tickFactor * (magnitude / 10 || 1))) * (tickFactor * (magnitude / 10 || 1)) || rawMax;
}

export function FinancialTrendsChart({ timeseries, initialMode = 'financials' }: FinancialTrendsChartProps) {
  const [mode, setMode] = useState<ChartMode>(initialMode);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const financials = timeseries?.financials ?? [];
  const registrations = timeseries?.registrations ?? [];
  const activity = timeseries?.activity ?? [];

  const pointsCount =
    mode === 'financials'
      ? financials.length
      : Math.max(registrations.length, activity.length);

  // SVG layout dimensions
  const svgWidth = 760;
  const svgHeight = 260;
  const paddingLeft = 65;
  const paddingRight = mode === 'activity' ? 65 : 35;
  const paddingTop = 28;
  const paddingBottom = 42;
  const innerWidth = svgWidth - paddingLeft - paddingRight;
  const innerHeight = svgHeight - paddingTop - paddingBottom;

  if (pointsCount === 0) {
    return (
      <div className="card" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Évolution temporelle</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
              Chiffre d&apos;affaires, commissions et dynamique d&apos;activité
            </p>
          </div>
        </div>
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--canvas)',
            borderRadius: 'var(--r-field, 6px)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px' }}>Aucune donnée temporelle disponible pour cette période.</p>
        </div>
      </div>
    );
  }

  // Determine series data according to mode
  let series1Label = '';
  let series2Label = '';
  let series1Color = 'var(--badge-info-text)'; // Navy
  let series2Color = 'var(--badge-success-text)'; // Emerald
  let series1Values: number[] = [];
  let series2Values: number[] = [];
  let labels: string[] = [];

  let totalSeries1 = 0;
  let totalSeries2 = 0;
  let totalSeries1Display = '';
  let totalSeries2Display = '';

  if (mode === 'financials') {
    series1Label = "Chiffre d'affaires (GMV)";
    series2Label = 'Commissions';
    series1Color = 'var(--badge-info-text)'; // Deep Navy
    series2Color = 'var(--badge-success-text)'; // Emerald Green

    labels = financials.map((f) => f.label);
    series1Values = financials.map((f) => f.gmvCents / 100);
    series2Values = financials.map((f) => f.commissionCents / 100);

    const sumGmvCents = financials.reduce((acc, f) => acc + f.gmvCents, 0);
    const sumCommissionCents = financials.reduce((acc, f) => acc + f.commissionCents, 0);
    totalSeries1Display = formatEuros(sumGmvCents);
    totalSeries2Display = formatEuros(sumCommissionCents);
  } else {
    series1Label = 'Inscriptions utilisateurs';
    series2Label = 'Demandes créées';
    series1Color = 'var(--badge-info-text)'; // Blue
    series2Color = 'var(--badge-warning-text)'; // Amber: a second hue, the dual axis needs two distinguishable lines

    labels = registrations.map((r, i) => r.label || activity[i]?.label || `T${i + 1}`);
    series1Values = registrations.map((r) => r.total);
    series2Values = activity.map((a) => a.demandes);

    totalSeries1 = registrations.reduce((acc, r) => acc + r.total, 0);
    totalSeries2 = activity.reduce((acc, a) => acc + a.demandes, 0);
    totalSeries1Display = `${formatCount(totalSeries1)} inscrits`;
    totalSeries2Display = `${formatCount(totalSeries2)} demandes`;
  }

  // Independent dual-axis scale calculation
  const maxScaleLeft =
    mode === 'activity'
      ? computeScaleCeil(series1Values)
      : computeScaleCeil([...series1Values, ...series2Values]);
  const maxScaleRight =
    mode === 'activity'
      ? computeScaleCeil(series2Values)
      : maxScaleLeft;

  // Coordinate functions
  const getX = (index: number) => {
    if (pointsCount <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (pointsCount - 1)) * innerWidth;
  };

  const getYLeft = (val: number) => {
    const clamped = Math.max(0, val);
    return paddingTop + innerHeight - (clamped / maxScaleLeft) * innerHeight;
  };

  const getYRight = (val: number) => {
    const clamped = Math.max(0, val);
    return paddingTop + innerHeight - (clamped / maxScaleRight) * innerHeight;
  };

  // Build SVG paths
  const pts1 = series1Values.map((val, idx) => ({ x: getX(idx), y: getYLeft(val) }));
  const pts2 = series2Values.map((val, idx) => ({ x: getX(idx), y: getYRight(val) }));

  const pathD1 = pts1.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    '',
  );
  const pathD2 = pts2.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    '',
  );

  const areaD1 =
    pts1.length > 0
      ? `${pathD1} L ${pts1[pts1.length - 1].x} ${paddingTop + innerHeight} L ${pts1[0].x} ${paddingTop + innerHeight} Z`
      : '';

  // Y-axis ticks for Left and Right axes
  const yTicksLeft = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    val: maxScaleLeft * pct,
    y: paddingTop + innerHeight - pct * innerHeight,
  }));

  const yTicksRight = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    val: maxScaleRight * pct,
    y: paddingTop + innerHeight - pct * innerHeight,
  }));

  // X-axis ticks thinning if many points
  const step = pointsCount > 14 ? Math.ceil(pointsCount / 7) : 1;
  const xTicksIndices = pointsCount > 0
    ? pointsCount <= 1
      ? [0]
      : Array.from({ length: pointsCount })
          .map((_, i) => i)
          .filter((i) => i === 0 || i === pointsCount - 1 || i % step === 0)
    : [];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * svgWidth;
    if (svgX < paddingLeft - 10 || svgX > svgWidth - paddingRight + 10) {
      setHoveredIndex(null);
      return;
    }
    const relX = svgX - paddingLeft;
    const rawIdx = Math.round((relX / innerWidth) * (pointsCount - 1));
    const clampedIdx = Math.max(0, Math.min(pointsCount - 1, rawIdx));
    setHoveredIndex(clampedIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  // Tooltip position & content
  const activeIdx = hoveredIndex !== null && hoveredIndex < pointsCount ? hoveredIndex : null;
  let tooltipX = 0;
  const tooltipY = paddingTop + 10;
  if (activeIdx !== null) {
    const xPos = getX(activeIdx);
    tooltipX = xPos > svgWidth - 160 ? xPos - 165 : xPos < paddingLeft + 160 ? xPos + 15 : xPos - 80;
  }

  return (
    <div className="card" style={{ marginBottom: '28px', padding: '20px' }}>
      {/* Header with Title & Mode Tabs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
            Évolution temporelle
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            {mode === 'financials'
              ? "Chiffre d'affaires brut et commissions générées sur la période"
              : "Dynamique d'acquisition d'utilisateurs et nouvelles demandes créées"}
          </p>
        </div>

        {/* Tab Toggle */}
        <div
          role="tablist"
          aria-label="Mode de visualisation temporelle"
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--canvas)',
            padding: '3px',
            borderRadius: 'var(--r-pill, 999px)',
            border: '1px solid var(--line, #e5e7eb)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'financials'}
            onClick={() => setMode('financials')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--r-pill, 999px)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: mode === 'financials' ? 'var(--paper, #ffffff)' : 'transparent',
              color: mode === 'financials' ? 'var(--ink, #111827)' : 'var(--muted, #6b7280)',
              boxShadow: mode === 'financials' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Chiffre d&apos;affaires &amp; Commissions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'activity'}
            onClick={() => setMode('activity')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--r-pill, 999px)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: mode === 'activity' ? 'var(--paper, #ffffff)' : 'transparent',
              color: mode === 'activity' ? 'var(--ink, #111827)' : 'var(--muted, #6b7280)',
              boxShadow: mode === 'activity' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Inscriptions & Demandes
          </button>
        </div>
      </div>

      {/* Legend & Total summaries */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--line, #f0f1f5)',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: series1Color,
              display: 'inline-block',
            }}
          />
          <span style={{ fontWeight: 600, color: 'var(--ink, #111827)' }}>{series1Label}:</span>
          <span style={{ color: 'var(--muted, #4b5563)', fontWeight: 500 }}>{totalSeries1Display}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: series2Color,
              display: 'inline-block',
            }}
          />
          <span style={{ fontWeight: 600, color: 'var(--ink, #111827)' }}>{series2Label}:</span>
          <span style={{ color: 'var(--muted, #4b5563)', fontWeight: 500 }}>{totalSeries2Display}</span>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            width: '100%',
            height: 'auto',
            minWidth: '580px',
            display: 'block',
            overflow: 'visible',
            userSelect: 'none',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label={`Graphique d'évolution: ${series1Label} et ${series2Label}`}
          role="img"
        >
          <defs>
            <linearGradient id="areaGradient1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series1Color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={series1Color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Axis Labels */}
          {mode === 'activity' ? (
            <g data-testid="axis-labels">
              <text
                data-testid="left-axis-label"
                x={paddingLeft - 8}
                y={paddingTop - 10}
                textAnchor="end"
                fontSize="11"
                fontWeight="700"
                fill={series1Color}
                fontFamily="inherit"
              >
                Inscriptions
              </text>
              <text
                data-testid="right-axis-label"
                x={paddingLeft + innerWidth + 8}
                y={paddingTop - 10}
                textAnchor="start"
                fontSize="11"
                fontWeight="700"
                fill={series2Color}
                fontFamily="inherit"
              >
                Demandes
              </text>
            </g>
          ) : (
            <text
              data-testid="left-axis-label"
              x={paddingLeft - 8}
              y={paddingTop - 10}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill="var(--muted, #6b7280)"
              fontFamily="inherit"
            >
              Montant (€)
            </text>
          )}

          {/* Grid lines and Left Y-axis tick labels */}
          <g data-testid="left-y-axis">
            {yTicksLeft.map((t, idx) => (
              <g key={`l-${idx}`} data-testid="left-y-axis-tick">
                <line
                  x1={paddingLeft}
                  y1={t.y}
                  x2={paddingLeft + innerWidth}
                  y2={t.y}
                  stroke="var(--line, #e5e7eb)"
                  strokeDasharray={idx === 0 ? 'none' : '3 3'}
                  strokeWidth={idx === 0 ? '1.5' : '1'}
                />
                <text
                  x={paddingLeft - 10}
                  y={t.y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill={mode === 'activity' ? series1Color : 'var(--muted, #9ca3af)'}
                  fontFamily="inherit"
                  fontWeight={mode === 'activity' ? '600' : 'normal'}
                >
                  {mode === 'financials'
                    ? `${Math.round(t.val).toLocaleString('fr-FR')} €`
                    : Math.round(t.val).toLocaleString('fr-FR')}
                </text>
              </g>
            ))}
          </g>

          {/* Right Y-axis in Activity mode */}
          {mode === 'activity' && (
            <g data-testid="right-y-axis">
              <line
                x1={paddingLeft + innerWidth}
                y1={paddingTop}
                x2={paddingLeft + innerWidth}
                y2={paddingTop + innerHeight}
                stroke="var(--line, #e5e7eb)"
                strokeWidth="1"
              />
              {yTicksRight.map((t, idx) => (
                <g key={`r-${idx}`} data-testid="right-y-axis-tick">
                  <line
                    x1={paddingLeft + innerWidth}
                    y1={t.y}
                    x2={paddingLeft + innerWidth + 4}
                    y2={t.y}
                    stroke="var(--line, #e5e7eb)"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft + innerWidth + 10}
                    y={t.y + 4}
                    textAnchor="start"
                    fontSize="11"
                    fill={series2Color}
                    fontFamily="inherit"
                    fontWeight="600"
                  >
                    {Math.round(t.val).toLocaleString('fr-FR')}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* X-axis tick labels */}
          {xTicksIndices.map((i) => (
            <text
              key={i}
              x={getX(i)}
              y={paddingTop + innerHeight + 20}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted, #6b7280)"
              fontFamily="inherit"
            >
              {labels[i] ?? ''}
            </text>
          ))}

          {/* Area fill for series 1 */}
          {areaD1 && <path d={areaD1} fill="url(#areaGradient1)" pointerEvents="none" />}

          {/* Polyline series 1 */}
          {pathD1 && (
            <path
              d={pathD1}
              fill="none"
              stroke={series1Color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {/* Polyline series 2 */}
          {pathD2 && (
            <path
              d={pathD2}
              fill="none"
              stroke={series2Color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {/* Hover guideline */}
          {activeIdx !== null && (
            <line
              x1={getX(activeIdx)}
              y1={paddingTop}
              x2={getX(activeIdx)}
              y2={paddingTop + innerHeight}
              stroke="var(--muted, #9ca3af)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}

          {/* Data point dots (rendered when hovered or if few points) */}
          {pts1.map((pt, idx) => {
            const isHovered = idx === activeIdx;
            const showDot = isHovered || pointsCount <= 12;
            if (!showDot) return null;
            return (
              <circle
                key={`dot1-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 3}
                fill={series1Color}
                stroke="var(--paper)"
                strokeWidth={isHovered ? 2.5 : 1.5}
                pointerEvents="none"
              />
            );
          })}

          {pts2.map((pt, idx) => {
            const isHovered = idx === activeIdx;
            const showDot = isHovered || pointsCount <= 12;
            if (!showDot) return null;
            return (
              <circle
                key={`dot2-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 3}
                fill={series2Color}
                stroke="var(--paper)"
                strokeWidth={isHovered ? 2.5 : 1.5}
                pointerEvents="none"
              />
            );
          })}

          {/* SVG Tooltip Box on hover */}
          {activeIdx !== null && (
            <g
              transform={`translate(${tooltipX}, ${tooltipY})`}
              pointerEvents="none"
              style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.12))' }}
            >
              <rect
                width="160"
                height={mode === 'financials' ? 76 : 76}
                rx="6"
                fill="var(--paper, #ffffff)"
                stroke="var(--line, #e5e7eb)"
                strokeWidth="1"
              />
              <text x="10" y="18" fontSize="11" fontWeight="bold" fill="var(--ink, #111827)">
                {labels[activeIdx]}
              </text>

              {/* Series 1 value */}
              <circle cx="14" cy="34" r="3.5" fill={series1Color} />
              <text x="24" y="37" fontSize="11" fill="var(--muted, #4b5563)">
                {mode === 'financials'
                  ? `GMV: ${formatEuros(financials[activeIdx]?.gmvCents ?? 0)}`
                  : `Inscriptions: ${formatCount(registrations[activeIdx]?.total ?? 0)}`}
              </text>

              {/* Series 2 value */}
              <circle cx="14" cy="52" r="3.5" fill={series2Color} />
              <text x="24" y="55" fontSize="11" fill="var(--muted, #4b5563)">
                {mode === 'financials'
                  ? `Comm.: ${formatEuros(financials[activeIdx]?.commissionCents ?? 0)}`
                  : `Demandes: ${formatCount(activity[activeIdx]?.demandes ?? 0)}`}
              </text>

              {/* Optional sub-count */}
              <text x="10" y="69" fontSize="10" fill="var(--muted, #9ca3af)">
                {mode === 'financials'
                  ? `${financials[activeIdx]?.ordersCount ?? 0} commande(s)`
                  : `${registrations[activeIdx]?.repairers ?? 0} rép. / ${registrations[activeIdx]?.clients ?? 0} clients`}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
