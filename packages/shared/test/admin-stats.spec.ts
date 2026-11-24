import { describe, expect, it } from 'vitest';
import {
  adminStatsPeriodSchema,
  adminStatsQuerySchema,
  type AdminStatsPeriod,
  type AdminStatsQuery,
  type AdminStatsOverviewDto,
  type ConversionFunnelStage,
  type AdminConversionFunnelDto,
} from '../src/index.js';

describe('Admin Stats Schemas', () => {
  it('validates supported periods and defaults to 30d', () => {
    expect(adminStatsPeriodSchema.parse('7d')).toBe('7d');
    expect(adminStatsPeriodSchema.parse('30d')).toBe('30d');
    expect(adminStatsPeriodSchema.parse('90d')).toBe('90d');
    expect(adminStatsPeriodSchema.parse('12m')).toBe('12m');
    expect(adminStatsPeriodSchema.parse('all')).toBe('all');
    expect(adminStatsPeriodSchema.parse('custom')).toBe('custom');
    expect(() => adminStatsPeriodSchema.parse('invalid')).toThrow();

    const parsed = adminStatsQuerySchema.parse({});
    expect(parsed.period).toBe('30d');
  });

  it('accepts custom period with from and to dates', () => {
    const parsed = adminStatsQuerySchema.parse({
      period: 'custom',
      from: '2026-05-01',
      to: '2026-05-15',
    });
    expect(parsed.period).toBe('custom');
    expect(parsed.from).toBe('2026-05-01');
    expect(parsed.to).toBe('2026-05-15');
  });

  it('accepts optional categoryId and department filters', () => {
    const parsed = adminStatsQuerySchema.parse({
      period: '7d',
      categoryId: 'cat-1',
      department: '75',
    });
    expect(parsed.period).toBe('7d');
    expect(parsed.categoryId).toBe('cat-1');
    expect(parsed.department).toBe('75');
  });

  it('validates AdminStatsOverviewDto shape compatibility with business KPIs, funnel, and geo repairers', () => {
    const mockFunnel: AdminConversionFunnelDto = {
      stages: [
        { id: 'demandes', label: 'Demandes publiées', count: 100, percentageOfTotal: 100, stepConversionRate: 100, dropOffRate: 0 },
        { id: 'with_offer', label: 'Avec offre', count: 80, percentageOfTotal: 80, stepConversionRate: 80, dropOffRate: 20 },
        { id: 'accepted', label: 'Offre acceptée', count: 60, percentageOfTotal: 60, stepConversionRate: 75, dropOffRate: 25 },
        { id: 'paid', label: 'Paiement effectué', count: 55, percentageOfTotal: 55, stepConversionRate: 91.7, dropOffRate: 8.3 },
        { id: 'completed', label: 'Réparation finalisée', count: 50, percentageOfTotal: 50, stepConversionRate: 90.9, dropOffRate: 9.1 },
      ],
      overallConversionRate: 50.0,
    };

    const mockOverview: AdminStatsOverviewDto = {
      period: '30d',
      startDate: '2026-08-23T00:00:00.000Z',
      endDate: '2026-09-22T00:00:00.000Z',
      comparisonPeriod: {
        startDate: '2026-07-24T00:00:00.000Z',
        endDate: '2026-08-23T00:00:00.000Z',
      },
      kpis: {
        totalDemandes: { value: 120, changePct: 15.2 },
        acceptanceRate: { value: 68.5, changePct: -2.1 },
        averageResponseTimeMinutes: { value: 45, changePct: null },
        totalGmvCents: { value: 1540000, changePct: 8.5 },
        totalCommissionsCents: { value: 154000, changePct: 8.5 },
        totalRegistrations: { value: 85, changePct: 12.0 },
        averageBasketCents: { value: 7500, changePct: 4.2 },
        actualCommissionRate: { value: 10.0, changePct: 0.0 },
        disputeRate: { value: 1.8, changePct: -0.3 },
        refundRate: { value: 2.5, changePct: 0.2 },
      },
      conversionFunnel: mockFunnel,
      repairsByCategory: [
        {
          categoryId: 'cat-1',
          categoryName: 'Smartphones',
          count: 50,
          percentage: 41.7,
          volumeCents: 650000,
        },
      ],
      popularCategories: [
        {
          categoryId: 'cat-1',
          categoryName: 'Smartphones',
          demandesCount: 50,
          offersCount: 80,
          conversionRate: 62.5,
        },
      ],
      geoDistribution: [
        {
          departmentCode: '75',
          departmentName: 'Paris',
          demandesCount: 35,
          percentage: 29.2,
          activeRepairersCount: 14,
        },
      ],
      responseTime: {
        averageMinutes: 45,
        medianMinutes: 30,
        within1HourCount: 40,
        within24HoursCount: 70,
        over24HoursCount: 10,
        noOfferCount: 5,
      },
      offerAcceptance: {
        totalOffers: 120,
        acceptedOffers: 82,
        rejectedOffers: 18,
        pendingOffers: 20,
        acceptanceRate: 68.3,
      },
      topRepairers: [
        {
          repairerId: 'rep-1',
          name: 'Jean Dupont',
          businessName: 'Atelier Express',
          avatarUrl: null,
          city: 'Paris',
          offersSent: 35,
          offersAccepted: 28,
          acceptanceRate: 80.0,
          totalRevenueCents: 450000,
          rating: 4.9,
          reviewsCount: 42,
        },
      ],
      timeseries: {
        registrations: [
          { date: '2026-09-01', label: '1 Sep', clients: 5, repairers: 2, total: 7 },
        ],
        financials: [
          { date: '2026-09-01', label: '1 Sep', gmvCents: 50000, commissionCents: 5000, ordersCount: 2 },
        ],
        activity: [
          { date: '2026-09-01', label: '1 Sep', demandes: 4, offers: 6 },
        ],
      },
    };

    expect(mockOverview.period).toBe('30d');
    expect(mockOverview.kpis.totalDemandes.value).toBe(120);
    expect(mockOverview.kpis.averageBasketCents.value).toBe(7500);
    expect(mockOverview.kpis.actualCommissionRate.value).toBe(10.0);
    expect(mockOverview.kpis.disputeRate.value).toBe(1.8);
    expect(mockOverview.kpis.refundRate.value).toBe(2.5);

    expect(mockOverview.conversionFunnel.stages).toHaveLength(5);
    expect(mockOverview.conversionFunnel.stages[0].id).toBe('demandes');
    expect(mockOverview.conversionFunnel.stages[1].id).toBe('with_offer');
    expect(mockOverview.conversionFunnel.stages[2].id).toBe('accepted');
    expect(mockOverview.conversionFunnel.stages[3].id).toBe('paid');
    expect(mockOverview.conversionFunnel.stages[4].id).toBe('completed');
    expect(mockOverview.conversionFunnel.overallConversionRate).toBe(50.0);

    expect(mockOverview.geoDistribution[0].activeRepairersCount).toBe(14);
  });
});
