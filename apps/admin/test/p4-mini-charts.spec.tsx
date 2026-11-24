import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  DashboardMiniCharts,
  formatChartTooltipDate,
  formatChartTooltipValue,
} from '../components/DashboardMiniCharts';
import type { AdminOverviewTrends } from '@revime/shared';

function generateSampleDates(days = 30): string[] {
  const dates: string[] = [];
  const start = new Date(Date.UTC(2026, 8, 15)); // 2026-09-15
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

describe('P4: DashboardMiniCharts (30-Day Analytics Mini-Charts)', () => {
  const sampleDates = generateSampleDates(30);

  const sampleTrends: AdminOverviewTrends = {
    revenue: sampleDates.map((date, idx) => ({
      date,
      value: (idx + 1) * 1000, // 10,00 € to 300,00 €
    })),
    demandes: sampleDates.map((date, idx) => ({
      date,
      value: idx % 4, // 0, 1, 2, 3
    })),
  };

  it('renders section container with .charts-grid class', () => {
    const html = renderToString(<DashboardMiniCharts trends={sampleTrends} />);
    expect(html).toContain('charts-grid');
    expect(html).toContain('chart-card');
  });

  it('renders both required chart titles and subtitles', () => {
    const html = renderToString(<DashboardMiniCharts trends={sampleTrends} />);
    expect(html).toMatch(/Chiffre d(?:'|&#x27;)affaires/);
    expect(html).toContain('Demandes publiées');
    expect(html).toContain('30 derniers jours');
  });

  it('renders correctly formatted 30-day totals using formatEuros and formatCount', () => {
    // Total revenue sum: (1 + 2 + ... + 30) * 1000 cents = 465 * 1000 = 465 000 cents = 4 650,00 €
    // Total demandes sum: sum of (idx % 4) for idx 0..29 = 7 * 6 + 0 + 1 = 43
    const html = renderToString(<DashboardMiniCharts trends={sampleTrends} />);

    // Total revenue formatted in euros (matches standard French currency with thin or non-breaking spaces)
    expect(html).toMatch(/4[\s\u00a0\u202f]650,00[\s\u00a0\u202f]€/);
    // Total demandes formatted as count
    expect(html).toContain('43');
  });

  it('renders two responsive SVGs with proper viewBox and styling attributes', () => {
    const html = renderToString(<DashboardMiniCharts trends={sampleTrends} />);
    // Check for SVGs
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 500 160"');

    // Revenue chart color (#25324F - Bleu Ink)
    expect(html).toContain('var(--navy)');
    // Demandes chart color (#1D4ED8 - Info Blue)
    expect(html).toContain('var(--badge-info-text)');

    // Gradients for area fills
    expect(html).toContain('linearGradient');
    expect(html).toContain('revenue-gradient');
    expect(html).toContain('demandes-gradient');
  });

  it('renders exactly 30 interactive hover points per chart', () => {
    const html = renderToString(<DashboardMiniCharts trends={sampleTrends} />);
    // 30 points for revenue + 30 points for demandes = 60 interactive hit areas
    const hitAreaMatches = html.match(/class="chart-hit-area"/g);
    expect(hitAreaMatches).toHaveLength(60);

    // Should include data-date and data-index
    expect(html).toContain('data-date="2026-09-15"');
    expect(html).toContain('data-date="2026-10-14"');
  });

  it('handles zero values cleanly without rendering empty or NaN attributes', () => {
    const zeroTrends: AdminOverviewTrends = {
      revenue: sampleDates.map((date) => ({ date, value: 0 })),
      demandes: sampleDates.map((date) => ({ date, value: 0 })),
    };
    const html = renderToString(<DashboardMiniCharts trends={zeroTrends} />);

    expect(html).not.toContain('NaN');
    expect(html).toMatch(/0,00[\s\u00a0\u202f]€/);
  });

  describe('Tooltip formatting helpers', () => {
    it('formats UTC ISO date into French locale date string (e.g. 12 oct. 2026)', () => {
      const formatted = formatChartTooltipDate('2026-10-12');
      expect(formatted).toMatch(/12\s+oct\.\s+2026/);
    });

    it('formats revenue tooltip value in Euros with formatEuros', () => {
      expect(formatChartTooltipValue(12550, 'revenue')).toMatch(/125,50\s+€/);
      expect(formatChartTooltipValue(0, 'revenue')).toMatch(/0,00\s+€/);
    });

    it('formats demandes tooltip value with proper pluralization', () => {
      expect(formatChartTooltipValue(0, 'demandes')).toBe('0 demande');
      expect(formatChartTooltipValue(1, 'demandes')).toBe('1 demande');
      expect(formatChartTooltipValue(5, 'demandes')).toBe('5 demandes');
    });
  });
});
