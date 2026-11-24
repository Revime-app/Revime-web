import { describe, it, expect } from 'vitest';
import {
  adminPendingActionsSchema,
  adminDailyPointSchema,
  adminOverviewTrendsSchema,
  adminOverviewSchema,
} from '../src/admin.schemas.js';

describe('adminPendingActionsSchema', () => {
  it('validates a complete pending actions payload', () => {
    const valid = {
      litiges: 3,
      verifications: 2,
      signalements: 1,
      annulations: 4,
      attention: 5,
      stalePayments: 2,
    };
    expect(adminPendingActionsSchema.parse(valid)).toEqual(valid);
  });

  it('rejects negative numbers', () => {
    expect(() => adminPendingActionsSchema.parse({ litiges: -1 })).toThrow();
  });
});

describe('adminDailyPointSchema', () => {
  it('validates a single daily point with ISO date and non-negative value', () => {
    const validPoint = { date: '2026-10-14', value: 15000 };
    expect(adminDailyPointSchema.parse(validPoint)).toEqual(validPoint);
  });

  it('rejects negative values', () => {
    expect(() => adminDailyPointSchema.parse({ date: '2026-10-14', value: -10 })).toThrow();
  });
});

describe('adminOverviewTrendsSchema', () => {
  const points30 = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    value: i * 100,
  }));

  it('validates trends with exactly 30 points for revenue and 30 points for demandes', () => {
    const validTrends = {
      revenue: points30,
      demandes: points30,
    };
    expect(adminOverviewTrendsSchema.parse(validTrends)).toEqual(validTrends);
  });

  it('rejects trends if revenue or demandes has fewer or more than 30 points', () => {
    expect(() =>
      adminOverviewTrendsSchema.parse({
        revenue: points30.slice(0, 29),
        demandes: points30,
      }),
    ).toThrow();

    expect(() =>
      adminOverviewTrendsSchema.parse({
        revenue: points30,
        demandes: [...points30, { date: '2026-10-15', value: 0 }],
      }),
    ).toThrow();
  });
});

describe('adminOverviewSchema', () => {
  const points30 = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    value: i * 100,
  }));

  it('validates an overview with pending actions and trends30d', () => {
    const payload = {
      pendingActions: {
        litiges: 1,
        verifications: 2,
        signalements: 0,
        annulations: 0,
        attention: 3,
        stalePayments: 4,
      },
      users: {
        total: { kind: 'value', value: 100 },
        recent: { kind: 'value', value: 10 },
        active: { kind: 'value', value: 50 },
        suspended: { kind: 'value', value: 2 },
      },
      repairers: {
        total: { kind: 'value', value: 20 },
        verified: { kind: 'value', value: 15 },
        pendingVerification: { kind: 'value', value: 5 },
        suspended: { kind: 'value', value: 1 },
      },
      demandes: {
        published: { kind: 'value', value: 80, mom: 12.5 },
        inProgress: { kind: 'value', value: 30, mom: -4.2 },
        done: { kind: 'value', value: 40, mom: null },
      },
      offers: {
        sent: { kind: 'value', value: 200, mom: 5.0 },
        accepted: { kind: 'value', value: 80, mom: 10.0 },
        rejected: { kind: 'value', value: 20, mom: -1.5 },
        withdrawn: { kind: 'value', value: 5, mom: null },
      },
      payments: {
        volumeCents: { kind: 'value', value: 500000 },
        commissionCents: { kind: 'value', value: 50000 },
        pending: { kind: 'value', value: 5 },
        refunded: { kind: 'value', value: 2 },
      },
      disputes: {
        open: { kind: 'value', value: 1 },
        inReview: { kind: 'value', value: 2 },
        closed: { kind: 'value', value: 10 },
      },
      trends30d: {
        revenue: points30,
        demandes: points30,
      },
      context: {
        demoAccounts: 0,
        testFixtureAccounts: 0,
        stripeTestMode: true,
        recentWindowDays: 30,
      },
    };
    expect(adminOverviewSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an overview missing trends30d', () => {
    const payload = {
      pendingActions: {
        litiges: 1,
        verifications: 2,
        signalements: 0,
        annulations: 0,
        attention: 3,
        stalePayments: 4,
      },
      users: {
        total: { kind: 'value', value: 100 },
        recent: { kind: 'value', value: 10 },
        active: { kind: 'value', value: 50 },
        suspended: { kind: 'value', value: 2 },
      },
      repairers: {
        total: { kind: 'value', value: 20 },
        verified: { kind: 'value', value: 15 },
        pendingVerification: { kind: 'value', value: 5 },
        suspended: { kind: 'value', value: 1 },
      },
      demandes: {
        published: { kind: 'value', value: 80, mom: 12.5 },
        inProgress: { kind: 'value', value: 30, mom: -4.2 },
        done: { kind: 'value', value: 40, mom: null },
      },
      offers: {
        sent: { kind: 'value', value: 200, mom: 5.0 },
        accepted: { kind: 'value', value: 80, mom: 10.0 },
        rejected: { kind: 'value', value: 20, mom: -1.5 },
        withdrawn: { kind: 'value', value: 5, mom: null },
      },
      payments: {
        volumeCents: { kind: 'value', value: 500000 },
        commissionCents: { kind: 'value', value: 50000 },
        pending: { kind: 'value', value: 5 },
        refunded: { kind: 'value', value: 2 },
      },
      disputes: {
        open: { kind: 'value', value: 1 },
        inReview: { kind: 'value', value: 2 },
        closed: { kind: 'value', value: 10 },
      },
      context: {
        demoAccounts: 0,
        testFixtureAccounts: 0,
        stripeTestMode: true,
        recentWindowDays: 30,
      },
    };
    expect(() => adminOverviewSchema.parse(payload)).toThrow();
  });
});

