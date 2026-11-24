import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AdminConversionFunnelDto, AdminStatsOverviewDto } from '@revime/shared';
import { StatsKpiCards } from '../app/statistiques/StatsKpiCards';
import { ConversionFunnelView } from '../app/statistiques/ConversionFunnelView';
import { GeoDistributionView } from '../app/statistiques/GeoDistributionView';

describe('F11: Statistiques Métier — Frontend Business KPIs, 5-Stage Funnel & Geo-Distribution', () => {
  const mockKpis: AdminStatsOverviewDto['kpis'] = {
    totalGmvCents: { value: 12500000, changePct: 15.2 }, // 125 000,00 €
    averageBasketCents: { value: 8500, changePct: 4.8 }, // 85,00 €
    totalCommissionsCents: { value: 1875000, changePct: 12.1 }, // 18 750,00 €
    actualCommissionRate: { value: 15.0, changePct: -0.5 }, // 15,0 %
    totalDemandes: { value: 420, changePct: 8.5 }, // 420
    acceptanceRate: { value: 68.4, changePct: 2.3 }, // 68,4 %
    disputeRate: { value: 1.8, changePct: -0.4 }, // 1,8 % (inverted: negative change is positive sentiment)
    refundRate: { value: 2.1, changePct: 0.2 }, // 2,1 % (inverted: positive change is negative sentiment)
    averageResponseTimeMinutes: { value: 45, changePct: -10 },
    totalRegistrations: { value: 150, changePct: 5 },
  };

  const mockFunnel: AdminConversionFunnelDto = {
    stages: [
      {
        id: 'demandes',
        label: 'Demandes publiées',
        count: 500,
        percentageOfTotal: 100,
        stepConversionRate: 100,
        dropOffRate: 0,
      },
      {
        id: 'with_offer',
        label: 'Avec offre reçue',
        count: 425,
        percentageOfTotal: 85.0,
        stepConversionRate: 85.0,
        dropOffRate: 15.0,
      },
      {
        id: 'accepted',
        label: 'Offre acceptée',
        count: 340,
        percentageOfTotal: 68.0,
        stepConversionRate: 80.0,
        dropOffRate: 20.0,
      },
      {
        id: 'paid',
        label: 'Commande payée',
        count: 306,
        percentageOfTotal: 61.2,
        stepConversionRate: 90.0,
        dropOffRate: 10.0,
      },
      {
        id: 'completed',
        label: 'Réparation confirmée',
        count: 275,
        percentageOfTotal: 55.0,
        stepConversionRate: 89.9,
        dropOffRate: 10.1,
      },
    ],
    overallConversionRate: 55.0,
  };

  const mockGeoDistribution: AdminStatsOverviewDto['geoDistribution'] = [
    {
      departmentCode: '75',
      departmentName: 'Paris',
      demandesCount: 150,
      activeRepairersCount: 28,
      percentage: 30.0,
    },
    {
      departmentCode: '69',
      departmentName: 'Rhône',
      demandesCount: 95,
      activeRepairersCount: 16,
      percentage: 19.0,
    },
    {
      departmentCode: '13',
      departmentName: 'Bouches-du-Rhône',
      demandesCount: 75,
      activeRepairersCount: 12,
      percentage: 15.0,
    },
  ];

  describe('1. 2-Row Thematic KPI Cards (StatsKpiCards.tsx)', () => {
    it('renders all 8 KPI cards across the two distinct thematic sections', () => {
      const html = renderToString(<StatsKpiCards kpis={mockKpis} period="30d" />);

      // Section titles
      expect(html).toContain('Performance Financière &amp; Volume');
      expect(html).toContain('Qualité Opérationnelle &amp; Conversion');

      // Row 1: Performance Financière & Volume
      // 1. Chiffre d'affaires (GMV)
      expect(html).toContain("Chiffre d&#x27;affaires (GMV)");
      expect(html).toMatch(/125[\s\u00a0\u202f]000,00[\s\u00a0\u202f]€/);

      // 2. Panier moyen
      expect(html).toContain('Panier moyen');
      expect(html).toMatch(/85,00[\s\u00a0\u202f]€/);
      expect(html).toContain('Montant moyen par réparation payée');

      // 3. Commissions plateforme
      expect(html).toContain('Commissions plateforme');
      expect(html).toMatch(/18[\s\u00a0\u202f]750,00[\s\u00a0\u202f]€/);

      // 4. Taux de commission effectif
      expect(html).toContain('Taux de commission effectif');
      expect(html).toContain('15,0 %');
      expect(html).toContain('Frais de protection perçus / montant encaissé');

      // Row 2: Qualité Opérationnelle & Conversion
      // 1. Demandes créées
      expect(html).toContain('Demandes créées');
      expect(html).toContain('420');
      expect(html).toContain('Demandes publiées sur la période');

      // 2. Taux d'acceptation offres
      expect(html).toContain("Taux d&#x27;acceptation offres");
      expect(html).toContain('68,4 %');
      expect(html).toContain('Offres converties en commandes');

      // 3. Taux de litiges
      expect(html).toContain('Taux de litiges');
      expect(html).toContain('1,8 %');
      expect(html).toContain('Commandes signalées en litige');

      // 4. Taux de remboursements
      expect(html).toContain('Taux de remboursements');
      expect(html).toContain('2,1 %');
      expect(html).toContain('Commandes ayant fait l&#x27;objet d&#x27;un remboursement');
    });

    it('inverts sentiment colors for litiges and remboursements', () => {
      const html = renderToString(<StatsKpiCards kpis={mockKpis} period="30d" />);

      // Dispute rate changePct is -0.4, invertSentiment=true => sentiment should be positive (green)
      expect(html).toContain('data-testid="kpi-card-disputeRate"');
      expect(html).toContain('data-testid="kpi-card-refundRate"');

      // Verify trend sentiment attribute or green badge for negative dispute change
      expect(html).toMatch(/data-sentiment="positive"[^>]*><span>↓<\/span><span>-0,4\s*%/);

      // Refund rate changePct is +0.2, invertSentiment=true => sentiment should be negative (red)
      expect(html).toMatch(/data-sentiment="negative"[^>]*><span>↑<\/span><span>\+0,2\s*%/);
    });

    it('renders historical global badges without comparison when period is all', () => {
      const html = renderToString(<StatsKpiCards kpis={mockKpis} period="all" />);
      const historicalBadges = html.match(/Historique global/g);
      expect(historicalBadges).toHaveLength(8);
    });
  });

  describe('2. 5-Stage Conversion Funnel Card (ConversionFunnelView.tsx)', () => {
    it('renders header with title, subtitle and overall conversion rate badge', () => {
      const html = renderToString(<ConversionFunnelView funnel={mockFunnel} />);

      expect(html).toContain('Entonnoir de conversion des demandes');
      expect(html).toContain(
        'Progression des demandes clients depuis la publication jusqu&#x27;à la confirmation de réparation',
      );
      expect(html).toContain('Taux de conversion global : 55,0 %');
    });

    it('renders all 5 conversion funnel stages with counts and % of total', () => {
      const html = renderToString(<ConversionFunnelView funnel={mockFunnel} />);

      // Stage 1
      expect(html).toContain('Demandes publiées');
      expect(html).toContain('500');
      expect(html).toMatch(/100(,0)?\s*%\s*du total/);

      // Stage 2
      expect(html).toContain('Avec offre reçue');
      expect(html).toContain('425');
      expect(html).toContain('85,0 % du total');

      // Stage 3
      expect(html).toContain('Offre acceptée');
      expect(html).toContain('340');
      expect(html).toContain('68,0 % du total');

      // Stage 4
      expect(html).toContain('Commande payée');
      expect(html).toContain('306');
      expect(html).toContain('61,2 % du total');

      // Stage 5
      expect(html).toContain('Réparation confirmée');
      expect(html).toContain('275');
      expect(html).toContain('55,0 % du total');
    });

    it('renders step conversion rates and drop-off rates on stages 2 to 5', () => {
      const html = renderToString(<ConversionFunnelView funnel={mockFunnel} />);

      // Stage 2 step metrics
      expect(html).toContain('85,0 %');
      expect(html).toContain('15,0 % déperdition');

      // Stage 3 step metrics
      expect(html).toContain('80,0 %');
      expect(html).toContain('20,0 % déperdition');

      // Stage 4 step metrics
      expect(html).toContain('90,0 %');
      expect(html).toContain('10,0 % déperdition');

      // Stage 5 step metrics
      expect(html).toContain('89,9 %');
      expect(html).toContain('10,1 % déperdition');
    });

    it('renders empty state gracefully when stages are empty', () => {
      const emptyFunnel: AdminConversionFunnelDto = {
        stages: [],
        overallConversionRate: 0,
      };
      const html = renderToString(<ConversionFunnelView funnel={emptyFunnel} />);
      expect(html).toContain('Aucune donnée d&#x27;entonnoir disponible sur cette période.');
    });
  });

  describe('3. Enhanced Geo-Distribution with Active Repairers (GeoDistributionView.tsx)', () => {
    it('renders both demandesCount and activeRepairersCount for each department', () => {
      const html = renderToString(<GeoDistributionView geoDistribution={mockGeoDistribution} />);

      // Paris 75
      expect(html).toContain('75');
      expect(html).toContain('Paris');
      expect(html).toContain('150 demandes');
      expect(html).toContain('28 réparateurs actifs');

      // Rhône 69
      expect(html).toContain('69');
      expect(html).toContain('Rhône');
      expect(html).toContain('95 demandes');
      expect(html).toContain('16 réparateurs actifs');

      // Bouches-du-Rhône 13
      expect(html).toContain('13');
      expect(html).toContain('Bouches-du-Rhône');
      expect(html).toContain('75 demandes');
      expect(html).toContain('12 réparateurs actifs');
    });

    it('renders singular text when repairer count is 1', () => {
      const singleRepairerGeo: AdminStatsOverviewDto['geoDistribution'] = [
        {
          departmentCode: '33',
          departmentName: 'Gironde',
          demandesCount: 1,
          activeRepairersCount: 1,
          percentage: 100,
        },
      ];
      const html = renderToString(<GeoDistributionView geoDistribution={singleRepairerGeo} />);
      expect(html).toContain('1 demande');
      expect(html).toContain('1 réparateur actif');
    });
  });

  describe('4. Automated Brand Compliance & Zero Black Buttons DOM Scanner', () => {
    it('scans all rendered HTML across components to guarantee ZERO black styles (#000000, black, rgb(0,0,0))', () => {
      const views = [
        renderToString(<StatsKpiCards kpis={mockKpis} period="30d" />),
        renderToString(<StatsKpiCards kpis={mockKpis} period="all" />),
        renderToString(<ConversionFunnelView funnel={mockFunnel} />),
        renderToString(<GeoDistributionView geoDistribution={mockGeoDistribution} />),
      ];

      for (const html of views) {
        // 1. Scan button elements
        const buttonRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
        let match: RegExpExecArray | null;
        while ((match = buttonRegex.exec(html)) !== null) {
          const buttonAttrs = match[1];

          // Check style attribute
          const styleMatch = buttonAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/,
            );
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/,
            );
          }

          // Check class attribute
          const classMatch = buttonAttrs.match(/class="([^"]*)"/i);
          if (classMatch) {
            const className = classMatch[1].toLowerCase();
            expect(className).not.toContain('black');
          }
        }

        // 2. Scan span / pill / badge elements
        const spanRegex = /<span\s+([^>]*?)>([\s\S]*?)<\/span>/gi;
        while ((match = spanRegex.exec(html)) !== null) {
          const spanAttrs = match[1];
          const styleMatch = spanAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/,
            );
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/,
            );
          }
        }
      }
    });
  });
});
