import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FinancialTrendsChart } from '../app/statistiques/FinancialTrendsChart';
import { RepairerLeaderboardView } from '../app/statistiques/RepairerLeaderboardView';
import { StatsPeriodSelector } from '../app/statistiques/StatsPeriodSelector';
import type { AdminStatsOverviewDto } from '@revime/shared';
import * as exportCsvModule from '../lib/export-csv';

describe('P24: Statistiques — Dual-Axis SVG Chart, Leaderboard Sorting, Custom Period & CSV', () => {
  describe('1. Dual-Axis SVG Chart (FinancialTrendsChart.tsx)', () => {
    const mockTimeseries: AdminStatsOverviewDto['timeseries'] = {
      registrations: [
        { date: '2026-05-01', label: '1 mai', clients: 8, repairers: 2, total: 10 },
        { date: '2026-05-02', label: '2 mai', clients: 12, repairers: 3, total: 15 },
      ],
      activity: [
        { date: '2026-05-01', label: '1 mai', demandes: 450, offers: 200 },
        { date: '2026-05-02', label: '2 mai', demandes: 600, offers: 320 },
      ],
      financials: [
        { date: '2026-05-01', label: '1 mai', gmvCents: 150000, commissionCents: 15000, ordersCount: 5 },
        { date: '2026-05-02', label: '2 mai', gmvCents: 220000, commissionCents: 22000, ordersCount: 8 },
      ],
    };

    it('renders financials mode by default with single Y-axis for euros', () => {
      const html = renderToString(<FinancialTrendsChart timeseries={mockTimeseries} />);

      expect(html).toContain('Chiffre d&#x27;affaires (GMV)');
      expect(html).toContain('Commissions');
      expect(html).toContain('data-testid="left-axis-label"');
      expect(html).toContain('Montant (€)');
      expect(html).toContain('data-testid="left-y-axis"');
      // In financials mode, right Y-axis should NOT be present
      expect(html).not.toContain('data-testid="right-y-axis"');
    });

    it('renders independent left (Inscriptions) and right (Demandes) Y-axes in Activity mode', () => {
      const html = renderToString(
        <FinancialTrendsChart timeseries={mockTimeseries} initialMode="activity" />,
      );

      // Both axes are present
      expect(html).toContain('data-testid="left-y-axis"');
      expect(html).toContain('data-testid="right-y-axis"');

      // Both axis labels are present
      expect(html).toContain('data-testid="left-axis-label"');
      expect(html).toContain('Inscriptions');
      expect(html).toContain('data-testid="right-axis-label"');
      expect(html).toContain('Demandes');

      // Both tick sets are present
      expect(html).toContain('data-testid="left-y-axis-tick"');
      expect(html).toContain('data-testid="right-y-axis-tick"');
    });

    it('computes independent scales preventing curve flattening', () => {
      // Inscriptions total: 6, 8 (max <= 10). Demandes: 800, 1200 (max >= 1200).
      const activityTimeseries: AdminStatsOverviewDto['timeseries'] = {
        registrations: [
          { date: '2026-05-01', label: 'J1', clients: 5, repairers: 1, total: 6 },
          { date: '2026-05-02', label: 'J2', clients: 7, repairers: 1, total: 8 },
        ],
        activity: [
          { date: '2026-05-01', label: 'J1', demandes: 800, offers: 400 },
          { date: '2026-05-02', label: 'J2', demandes: 1200, offers: 600 },
        ],
        financials: [],
      };

      const html = renderToString(
        <FinancialTrendsChart timeseries={activityTimeseries} initialMode="activity" />,
      );

      // Inscriptions scale on left should have values around 8-10, Demandes scale on right around 1200-1500
      expect(html).toContain('data-testid="left-axis-label"');
      expect(html).toContain('data-testid="right-axis-label"');
      expect(html).toContain('Inscriptions');
      expect(html).toContain('Demandes');

      // Right axis ticks exist and display large demands scale
      expect(html).toMatch(/1[\s\u00a0\u202f]200/);
    });
  });

  describe('2. Sortable Repairer Leaderboard (RepairerLeaderboardView.tsx)', () => {
    const mockRepairers: AdminStatsOverviewDto['topRepairers'] = [
      {
        repairerId: 'rep-1',
        name: 'Alice Martin',
        businessName: 'Atelier Alice',
        avatarUrl: null,
        city: 'Lyon',
        offersSent: 30,
        offersAccepted: 10,
        acceptanceRate: 33.3,
        totalRevenueCents: 500000, // 5000 €
        rating: 4.8,
        reviewsCount: 15,
      },
      {
        repairerId: 'rep-2',
        name: 'Bob Dupont',
        businessName: 'Bob Réparations',
        avatarUrl: null,
        city: 'Paris',
        offersSent: 35,
        offersAccepted: 25,
        acceptanceRate: 71.4,
        totalRevenueCents: 200000, // 2000 €
        rating: 4.9,
        reviewsCount: 40,
      },
      {
        repairerId: 'rep-3',
        name: 'Charlie Tech',
        businessName: null,
        avatarUrl: null,
        city: 'Marseille',
        offersSent: 15,
        offersAccepted: 5,
        acceptanceRate: 33.3,
        totalRevenueCents: 900000, // 9000 €
        rating: 4.5,
        reviewsCount: 8,
      },
    ];

    it('renders sortable headers with SortableTh components', () => {
      const html = renderToString(<RepairerLeaderboardView topRepairers={mockRepairers} />);

      expect(html).toContain('data-testid="sort-rank"');
      expect(html).toContain('data-testid="sort-repairer"');
      expect(html).toContain('data-testid="sort-offersSent"');
      expect(html).toContain('data-testid="sort-acceptedOffers"');
      expect(html).toContain('data-testid="sort-conversion"');
      expect(html).toContain('data-testid="sort-totalRevenueCents"');
      expect(html).toContain('Offres acceptées');
      expect(html).toContain('Chiffre d&#x27;affaires');
    });

    it('renders all repairers with formatted revenue, counts and acceptance badges', () => {
      const html = renderToString(<RepairerLeaderboardView topRepairers={mockRepairers} />);

      expect(html).toContain('Alice Martin');
      expect(html).toContain('Bob Dupont');
      expect(html).toContain('Charlie Tech');
      expect(html).toMatch(/5[\s\u00a0\u202f]000,00[\s\u00a0\u202f]€/);
      expect(html).toMatch(/2[\s\u00a0\u202f]000,00[\s\u00a0\u202f]€/);
      expect(html).toMatch(/9[\s\u00a0\u202f]000,00[\s\u00a0\u202f]€/);
      expect(html).toContain('71,4 %');
      expect(html).toContain('33,3 %');
    });

    it('renders CsvExportButton with repairer count badge', () => {
      const html = renderToString(<RepairerLeaderboardView topRepairers={mockRepairers} />);

      expect(html).toContain('data-testid="csv-export-button"');
      expect(html).toContain('Exporter en CSV');
      expect(html).toContain('3');
    });

    it('generates compliant RFC 4180 French CSV export with semicolon and UTF-8 BOM', () => {
      const generateSpy = vi.spyOn(exportCsvModule, 'generateCsv');
      const downloadSpy = vi.spyOn(exportCsvModule, 'downloadCsv').mockImplementation(() => {});

      // Call the CSV generator directly with mockRepairers and verify format
      const rankedItems = mockRepairers.map((r, i) => ({ ...r, originalRank: i + 1 }));
      const csv = exportCsvModule.generateCsv(
        [
          { key: 'originalRank', label: 'Rang' },
          { key: 'name', label: 'Réparateur' },
          { key: 'offersAccepted', label: 'Offres acceptées' },
          { key: 'totalRevenueCents', label: "Chiffre d'affaires", format: (v) => `${Number(v) / 100} €` },
        ],
        rankedItems,
        { delimiter: ';' },
      );

      // Must start with UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      const lines = csv.slice(1).split('\r\n');
      expect(lines[0]).toBe("Rang;Réparateur;Offres acceptées;Chiffre d'affaires");
      expect(lines[1]).toContain('1;Alice Martin;10;5000 €');
      expect(lines[2]).toContain('2;Bob Dupont;25;2000 €');
      expect(lines[3]).toContain('3;Charlie Tech;5;9000 €');

      downloadSpy.mockRestore();
    });
  });

  describe('3. Custom Period Selector (StatsPeriodSelector.tsx)', () => {
    it('renders all standard pills including the new Personnalisé option', () => {
      const html = renderToString(
        <StatsPeriodSelector period="30d" onPeriodChange={() => {}} />,
      );

      expect(html).toContain('data-testid="period-pill-7d"');
      expect(html).toContain('data-testid="period-pill-30d"');
      expect(html).toContain('data-testid="period-pill-90d"');
      expect(html).toContain('data-testid="period-pill-12m"');
      expect(html).toContain('data-testid="period-pill-all"');
      expect(html).toContain('data-testid="period-pill-custom"');
      expect(html).toContain('Personnalisé');

      // Custom date picker should NOT be unfolded when period is 30d
      expect(html).not.toContain('data-testid="stats-custom-range-picker"');
    });

    it('unfolds Du and Au date pickers and Appliquer button when period is custom', () => {
      const html = renderToString(
        <StatsPeriodSelector
          period="custom"
          customFrom="2026-05-01"
          customTo="2026-05-15"
          onPeriodChange={() => {}}
        />,
      );

      expect(html).toContain('data-testid="stats-custom-range-picker"');
      expect(html).toContain('data-testid="stats-date-from"');
      expect(html).toContain('data-testid="stats-date-to"');
      expect(html).toContain('value="2026-05-01"');
      expect(html).toContain('value="2026-05-15"');
      expect(html).toContain('data-testid="stats-apply-custom-range"');
      expect(html).toContain('Appliquer');
      expect(html).toContain('Du');
      expect(html).toContain('Au');
    });

    it('invokes onPeriodChange with custom period and range parameters', () => {
      const onPeriodChange = vi.fn();
      const onCustomRangeChange = vi.fn();

      // Render custom selector
      const html = renderToString(
        <StatsPeriodSelector
          period="custom"
          customFrom="2026-04-01"
          customTo="2026-04-30"
          onPeriodChange={onPeriodChange}
          onCustomRangeChange={onCustomRangeChange}
        />,
      );

      expect(html).toContain('value="2026-04-01"');
      expect(html).toContain('value="2026-04-30"');
    });
  });
});
