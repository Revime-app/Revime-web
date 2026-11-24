import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import {
  AdminOverviewService,
  RECENT_WINDOW_DAYS,
  calcMom,
  generatePast30DaysUtc,
  paidWithin,
} from '../src/admin/admin-overview.service.js';
import { isStripeTestMode } from '../src/payments/config.js';

/**
 * $transaction receives an ARRAY of promises here, so the stub resolves them in order.
 * Each model returns values in its own numeric range, so swapping two entries in the
 * array yields numbers in the wrong range and fails the assertions below. That converts
 * a recurring manual alignment audit into a gate.
 */
const makePrisma = (over: Record<string, unknown> = {}) => {
  const seqs = {
    profile: 100,
    repairerProfile: 200,
    demande: 300,
    offer: 400,
    commande: 500,
    user: 600,
    identityVerification: 700,
    businessVerification: 800,
  };
  return {
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    user: { count: vi.fn(() => Promise.resolve(seqs.user++)) },
    session: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]),
    },
    profile: { count: vi.fn(() => Promise.resolve(seqs.profile++)) },
    repairerProfile: {
      count: vi.fn(() => Promise.resolve(seqs.repairerProfile++)),
      // V8 E1: the journeys behind « Configuration terminée / en cours ». None by default.
      findMany: vi.fn().mockResolvedValue([]),
    },
    identityVerification: {
      count: vi.fn(() => Promise.resolve(seqs.identityVerification++)),
    },
    businessVerification: {
      count: vi.fn(() => Promise.resolve(seqs.businessVerification++)),
    },
    cancellationRequest: { count: vi.fn().mockResolvedValue(0) },
    conversationReport: { count: vi.fn().mockResolvedValue(0) },
    staffInvitation: { count: vi.fn().mockResolvedValue(0) },
    demande: {
      count: vi.fn(() => Promise.resolve(seqs.demande++)),
      findMany: vi.fn().mockResolvedValue([]),
    },
    offer: { count: vi.fn(() => Promise.resolve(seqs.offer++)) },
    commande: {
      count: vi.fn(() => Promise.resolve(seqs.commande++)),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { totalCents: 389020, protectionCents: 24320 },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    dispute: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...over,
  };
};

describe('AdminOverviewService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminOverviewService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminOverviewService(prisma as never, NO_ATTENTION as never);
  });

  it('excludes expired notion from demandes per P2', async () => {
    const o = await service.overview();
    expect((o.demandes as Record<string, unknown>).expired).toBeUndefined();
  });

  it('never marks an available indicator unavailable', async () => {
    const o = await service.overview();
    expect(o.users.total.kind).toBe('value');
    expect(o.payments.volumeCents.kind).toBe('value');
    expect(o.disputes.open.kind).toBe('value');
    expect(o.disputes.inReview.kind).toBe('value');
    expect(o.disputes.closed.kind).toBe('value');
  });

  it('counts suspended accounts EXCLUDING soft-deleted ones', async () => {
    await service.overview();

    const suspendedCall = prisma.user.count.mock.calls.find((c) =>
      JSON.stringify((c as unknown[])[0]).includes('banned'),
    );
    expect(
      suspendedCall,
      'no suspended-accounts query was issued',
    ).toBeDefined();
    // CF-47's scrub sets banned:true + banReason:'account_deleted'. Without this NOT,
    // every deleted account is reported as suspended.
    expect(JSON.stringify((suspendedCall as unknown[])[0])).toContain(
      'account_deleted',
    );
  });

  it('filters soft deletes on Profile, RepairerProfile, Demande and Offer', async () => {
    await service.overview();

    for (const [name, mock] of [
      ['profile', prisma.profile.count],
      ['repairerProfile', prisma.repairerProfile.count],
      ['demande', prisma.demande.count],
      ['offer', prisma.offer.count],
    ] as const) {
      expect(
        mock.mock.calls.length,
        `${name} was never counted`,
      ).toBeGreaterThan(0);
      for (const call of mock.mock.calls) {
        expect(
          JSON.stringify((call as unknown[])[0]),
          `${name} query missing deletedAt filter`,
        ).toContain('deletedAt');
      }
    }
  });

  it('counts offres envoyées as every offer, not only those still at SENT', async () => {
    await service.overview();

    const queries = prisma.offer.count.mock.calls.map((c) =>
      JSON.stringify((c as unknown[])[0]),
    );
    // One query constrains no status at all: that is the total.
    expect(queries.some((q) => !q.includes('status'))).toBe(true);
  });

  it('de-duplicates active accounts by user', async () => {
    const o = await service.overview();
    // The stub returns sessions for a, b, a.
    expect(o.users.active).toEqual({ kind: 'value', value: 2 });
  });

  it('reads money as cents from an aggregate, coalescing null to 0', async () => {
    prisma.commande.aggregate = vi
      .fn()
      .mockResolvedValue({ _sum: { totalCents: null, protectionCents: null } });
    const o = await new AdminOverviewService(prisma as never, NO_ATTENTION as never).overview();

    expect(o.payments.volumeCents).toEqual({
      kind: 'value',
      value: 0,
      mom: null,
    });
    expect(o.payments.commissionCents).toEqual({
      kind: 'value',
      value: 0,
      mom: null,
    });
  });

  it('reports the demo-account count and Stripe mode as measured context', async () => {
    const o = await service.overview();

    expect(typeof o.context.demoAccounts).toBe('number');
    expect(typeof o.context.testFixtureAccounts).toBe('number');
    expect(typeof o.context.stripeTestMode).toBe('boolean');
    expect(o.context.recentWindowDays).toBe(RECENT_WINDOW_DAYS);
  });

  it('counts test fixture accounts separately from demo accounts', async () => {
    await service.overview();

    const fixtureCall = prisma.user.count.mock.calls.find((c) =>
      JSON.stringify((c as unknown[])[0]).includes('@repareme.test'),
    );
    expect(
      fixtureCall,
      'no test-fixture-accounts query was issued',
    ).toBeDefined();
    expect(JSON.stringify((fixtureCall as unknown[])[0])).toContain(
      '@repareme.test',
    );
  });

  // PRE-4: the banner must say what the mobile notice and the checkout response say. Both read
  // `isStripeTestMode()`; the admin used to re-derive it with `startsWith('sk_test')` and
  // disagreed on a restricted key, on the fake driver and on `sk_testfoo`.
  it.each([
    ['stripe', 'sk_live_abc', false],
    ['stripe', 'rk_live_abc', false],
    ['stripe', 'sk_test_abc', true],
    ['stripe', 'rk_test_abc', true],
    ['stripe', 'sk_testfoo', false],
    ['stripe', undefined, false],
    ['fake', undefined, true],
    ['fake', 'sk_live_abc', true],
  ] as const)(
    'banner with driver %s and key %s -> stripeTestMode %s, the same answer as isStripeTestMode()',
    async (driver, key, expected) => {
      const saved = {
        driver: process.env.STRIPE_DRIVER,
        key: process.env.STRIPE_SECRET_KEY,
      };
      try {
        process.env.STRIPE_DRIVER = driver;
        if (key === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = key;
        const context = (
          await new AdminOverviewService(makePrisma() as never, NO_ATTENTION as never).overview()
        ).context;
        expect(context.stripeTestMode).toBe(expected);
        expect(context.stripeTestMode).toBe(isStripeTestMode());
      } finally {
        for (const [name, value] of [
          ['STRIPE_DRIVER', saved.driver],
          ['STRIPE_SECRET_KEY', saved.key],
        ] as const) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    },
  );

  it('counts verified réparateurs, not verified people - a verified client is not a verified réparateur', async () => {
    await service.overview();

    const verifiedCall = prisma.profile.count.mock.calls.find((c) =>
      JSON.stringify((c as unknown[])[0]).includes('verificationLevel'),
    );
    expect(
      verifiedCall,
      'no verified-réparateurs query was issued',
    ).toBeDefined();
    // Without the repairerProfile condition, a client who verifies and then abandons
    // the become-réparateur flow counts as a verified réparateur.
    expect(JSON.stringify((verifiedCall as unknown[])[0])).toContain(
      'repairerProfile',
    );
  });

  it('counts an account banned with no reason as suspended', async () => {
    await service.overview();

    const suspendedCall = prisma.user.count.mock.calls.find((c) =>
      JSON.stringify((c as unknown[])[0]).includes('banned'),
    );
    expect(
      suspendedCall,
      'no suspended-accounts query was issued',
    ).toBeDefined();
    // Prisma's NOT on a nullable column excludes NULL, so `NOT: { banReason: 'account_deleted' }`
    // would miss an account banned with no reason set. The OR form includes it.
    expect(JSON.stringify((suspendedCall as unknown[])[0])).toContain(
      '"banReason":null',
    );
  });

  it('pins the $transaction array alignment - swapping entries yields numbers in the wrong range', async () => {
    const o = await service.overview();

    // users.total is the first query, so it gets 100 (profile range)
    expect(o.users.total).toEqual(
      expect.objectContaining({ kind: 'value', value: 100 }),
    );
    // demandes.published is profile + profile + user + repairerProfile + profile + identityVerification + repairerProfile = 7th, so 300
    expect(o.demandes.published).toEqual(
      expect.objectContaining({ kind: 'value', value: 300 }),
    );
    // offers.sent is the 11th query, so 400
    expect(o.offers.sent).toEqual(
      expect.objectContaining({ kind: 'value', value: 400 }),
    );
    // repairers.total is the 4th query (profile, profile, user, profile), so 102
    expect(o.repairers.total).toEqual(
      expect.objectContaining({ kind: 'value', value: 102 }),
    );
    // repairers.suspended is the 7th query (repairerProfile), so 200
    expect(o.repairers.suspended).toEqual(
      expect.objectContaining({ kind: 'value', value: 200 }),
    );
  });

  it('calcMom computes month-over-month percentage with division by zero protection', () => {
    // Division by zero protection
    expect(calcMom(100, 0)).toBeNull();
    expect(calcMom(0, 0)).toBeNull();

    // Positive variations
    expect(calcMom(1125, 1000)).toBe(12.5);
    expect(calcMom(120, 100)).toBe(20.0);

    // Negative variations
    expect(calcMom(958, 1000)).toBe(-4.2);
    expect(calcMom(0, 10)).toBe(-100.0);

    // Zero variation
    expect(calcMom(100, 100)).toBe(0.0);
  });

  it('returns the four offer states, each with its variation, and no second tile for the same REJECTED rows', async () => {
    const o = await service.overview();
    expect(Object.keys(o.offers).sort()).toEqual(['accepted', 'rejected', 'sent', 'withdrawn']);
    for (const tile of Object.values(o.offers)) {
      expect(tile.kind).toBe('value');
      expect('mom' in tile).toBe(true);
    }
  });

  it('reads « À traiter » attention and stale payments off the same list the /attention page shows', async () => {
    const cronMock = {
      attentionItems: vi.fn().mockResolvedValue([
        { commandeId: 'c1', reasons: ['DISPUTED', 'PAYMENT_PENDING_STALE'] },
        { commandeId: 'c2', reasons: ['PAYMENT_PENDING_STALE'] },
        { commandeId: 'c3', reasons: ['STALLED'] },
      ]),
    };
    const o = await new AdminOverviewService(prisma as never, cronMock as never).overview();

    expect(o.pendingActions.attention).toBe(3);
    // One per order carrying the reason, whatever its other reasons: not a second query with its own rule.
    expect(o.pendingActions.stalePayments).toBe(2);
    expect(cronMock.attentionItems).toHaveBeenCalledTimes(1);
    const staleQuery = prisma.commande.count.mock.calls.find((c) => {
      const createdAt = (c as unknown as [{ where: { createdAt?: Record<string, unknown> } }])[0].where.createdAt;
      return createdAt !== undefined && 'lte' in createdAt && !('gte' in createdAt);
    });
    expect(staleQuery, 'a second stale-payments query is back').toBeUndefined();
  });

  it('shows litiges, signalements and annulations as the sidebar badges count them', async () => {
    const badgePrisma = makePrisma({
      dispute: { count: vi.fn().mockResolvedValue(7) },
      conversationReport: { count: vi.fn().mockResolvedValue(5) },
      cancellationRequest: { count: vi.fn().mockResolvedValue(4) },
    });
    const o = await new AdminOverviewService(badgePrisma as never, NO_ATTENTION as never).overview();
    expect(o.pendingActions).toMatchObject({ litiges: 7, signalements: 5, annulations: 4 });
  });

  it('cuts revenue into days by paidAt, the day the money was collected, not by creation', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const created = new Date(Date.UTC(2020, 0, 1, 10));
    const customPrisma = makePrisma({
      commande: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 0, protectionCents: 0 } }),
        findMany: vi.fn().mockResolvedValue([
          { paidAt: new Date(`${todayIso}T09:00:00Z`), createdAt: created, totalCents: 700 },
          { paidAt: null, createdAt: new Date(`${todayIso}T12:00:00Z`), totalCents: 300 },
        ]),
      },
    });
    const o = await new AdminOverviewService(customPrisma as never, NO_ATTENTION as never).overview();
    expect(o.trends30d.revenue.find((p) => p.date === todayIso)?.value).toBe(1000);
    expect(o.trends30d.revenue.reduce((acc, p) => acc + p.value, 0)).toBe(1000);
    const where = (customPrisma.commande.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.OR).toEqual([
      { paidAt: { gte: expect.any(Date) } },
      { paidAt: null, createdAt: { gte: expect.any(Date) } },
    ]);
  });

  it('compares the two 30-day windows of revenue by paidAt, as the chart cuts its days', async () => {
    await service.overview();
    const windowed = prisma.commande.aggregate.mock.calls
      .map((c) => (c as unknown as [{ where: Record<string, unknown> }])[0].where)
      .filter((where) => 'OR' in where);
    expect(windowed).toHaveLength(2);
    for (const where of windowed) {
      expect(where.OR).toEqual([
        { paidAt: expect.objectContaining({ gte: expect.any(Date) }) },
        { paidAt: null, createdAt: expect.objectContaining({ gte: expect.any(Date) }) },
      ]);
      expect(where).not.toHaveProperty('createdAt');
    }
  });

  it('windows the revenue variation by paidAt too', () => {
    const range = { gte: new Date(0), lt: new Date(1) };
    expect(paidWithin(range)).toEqual({ OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] });
  });

  it('counts active repairers matching profile.repairerEnabled: true and deletedAt: null per P3', async () => {
    await service.overview();

    const repairerTotalCall = prisma.profile.count.mock.calls.find((c) => {
      const str = JSON.stringify((c as unknown[])[0]);
      return str.includes('repairerEnabled') && !str.includes('createdAt');
    });
    expect(
      repairerTotalCall,
      'no repairer total query on profile was issued',
    ).toBeDefined();
    const query = (
      repairerTotalCall as unknown as [{ where: Record<string, unknown> }]
    )[0];
    expect(query.where).toMatchObject({
      deletedAt: null,
      repairerEnabled: true,
    });
  });

  it('counts published demandes with hiddenAt: null and deletedAt: null per P3', async () => {
    await service.overview();

    const publishedCall = prisma.demande.count.mock.calls.find((c) => {
      const str = JSON.stringify((c as unknown[])[0]);
      return (
        str.includes('hiddenAt') &&
        !str.includes('createdAt') &&
        !str.includes('status')
      );
    });
    expect(
      publishedCall,
      'no published demandes query with hiddenAt: null was issued',
    ).toBeDefined();
    const query = (
      publishedCall as unknown as [{ where: Record<string, unknown> }]
    )[0];
    expect(query.where).toMatchObject({
      deletedAt: null,
      hiddenAt: null,
    });
  });

  it('counts rolling window repairers on profile table with repairerEnabled: true per P3', async () => {
    await service.overview();

    const windowCalls = prisma.profile.count.mock.calls.filter((c) => {
      const str = JSON.stringify((c as unknown[])[0]);
      return str.includes('repairerEnabled') && str.includes('createdAt');
    });
    expect(
      windowCalls.length,
      'expected two rolling 30-day window queries on profile for repairers',
    ).toBe(2);
    for (const call of windowCalls) {
      const query = (
        call as unknown as [{ where: Record<string, unknown> }]
      )[0];
      expect(query.where).toMatchObject({
        deletedAt: null,
        repairerEnabled: true,
      });
      expect(query.where.createdAt).toBeDefined();
    }
  });

  describe('P4: 30-Day Analytics Mini-Charts (trends30d)', () => {
    it('generatePast30DaysUtc returns exactly 30 contiguous ISO date strings ending on target date', () => {
      const targetDate = new Date('2026-10-14T12:00:00Z');
      const dates = generatePast30DaysUtc(targetDate);
      expect(dates).toHaveLength(30);
      expect(dates[0]).toBe('2026-09-15');
      expect(dates[29]).toBe('2026-10-14');

      // Verify all 30 dates are contiguous
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + 'T00:00:00Z').getTime();
        const curr = new Date(dates[i] + 'T00:00:00Z').getTime();
        expect(curr - prev).toBe(24 * 60 * 60 * 1000);
      }
    });

    it('overview returns trends30d with exactly 30 points each for revenue and demandes', async () => {
      const o = await service.overview();
      expect(o.trends30d).toBeDefined();
      expect(o.trends30d.revenue).toHaveLength(30);
      expect(o.trends30d.demandes).toHaveLength(30);
    });

    it('aggregates daily revenue (cents) and visible demandes counts into correct date buckets with zero-fill', async () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const customPrisma = makePrisma({
        commande: {
          count: vi.fn().mockResolvedValue(10),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { totalCents: 50000, protectionCents: 2000 },
          }),
          findMany: vi.fn().mockResolvedValue([
            { createdAt: new Date(`${todayIso}T10:00:00Z`), totalCents: 12500 },
            { createdAt: new Date(`${todayIso}T15:30:00Z`), totalCents: 8000 },
          ]),
        },
        demande: {
          count: vi.fn().mockResolvedValue(20),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { createdAt: new Date(`${todayIso}T08:00:00Z`) },
              { createdAt: new Date(`${todayIso}T11:00:00Z`) },
              { createdAt: new Date(`${todayIso}T19:00:00Z`) },
            ]),
        },
      });

      const customService = new AdminOverviewService(customPrisma as never, NO_ATTENTION as never);
      const o = await customService.overview();

      // Today should have aggregated sum of 12500 + 8000 = 20500 cents
      const todayRevenuePoint = o.trends30d.revenue.find(
        (p) => p.date === todayIso,
      );
      expect(todayRevenuePoint).toEqual({ date: todayIso, value: 20500 });

      // Today should have aggregated count of 3 demandes
      const todayDemandesPoint = o.trends30d.demandes.find(
        (p) => p.date === todayIso,
      );
      expect(todayDemandesPoint).toEqual({ date: todayIso, value: 3 });

      // Days with no activity must have value 0
      const zeroRevenuePoints = o.trends30d.revenue.filter(
        (p) => p.date !== todayIso,
      );
      expect(zeroRevenuePoints.every((p) => p.value === 0)).toBe(true);
      expect(zeroRevenuePoints).toHaveLength(29);
    });

    it('queries commandes with status: PAID and demandes with LIVE and hiddenAt: null', async () => {
      await service.overview();

      const cmdCall = prisma.commande.findMany.mock.calls[0] as unknown as [
        {
          where: { status: string; OR: { paidAt: unknown }[] };
          select: Record<string, boolean>;
        },
      ];
      expect(cmdCall).toBeDefined();
      expect(cmdCall[0].where.status).toBe('PAID');
      expect(cmdCall[0].where.OR[0]).toEqual({ paidAt: { gte: expect.any(Date) } });
      expect(cmdCall[0].select).toEqual({ paidAt: true, createdAt: true, totalCents: true });

      const demCall = prisma.demande.findMany.mock.calls[0] as unknown as [
        {
          where: { deletedAt: null; hiddenAt: null; createdAt: { gte: Date } };
          select: Record<string, boolean>;
        },
      ];
      expect(demCall).toBeDefined();
      expect(demCall[0].where.deletedAt).toBeNull();
      expect(demCall[0].where.hiddenAt).toBeNull();
      expect(demCall[0].where.createdAt.gte).toBeInstanceOf(Date);
      expect(demCall[0].select).toEqual({ createdAt: true });
    });
  });

  describe('V8 E1: repairers who finished setup', () => {
    const journeyRow = (id: string, done: boolean) => ({
      id,
      userId: `u-${id}`,
      kind: 'INDIVIDUAL',
      createdAt: new Date('2026-11-01T10:00:00Z'),
      lat: null,
      lng: null,
      bannerPath: done ? 'b.jpg' : null,
      bio: done ? 'Bio' : null,
      postalCode: done ? '75012' : null,
      fiscalCompletedAt: done ? new Date('2026-11-02T10:00:00Z') : null,
      setupReminder3dAt: null,
      setupReminder8dAt: null,
      user: {
        image: null,
        profile: { verificationLevel: done ? 'IDENTITY' : 'BASIC', avatarPath: done ? 'a.jpg' : null },
        identityVerification: done ? { status: 'VERIFIED', lastErrorCode: null, decision: null } : null,
        connectAccount: done ? { status: 'VERIFIED' } : null,
        repairerCategories: done ? [{ categoryId: 'c1' }] : [],
        repairerAvailability: done ? [{ dayOfWeek: 1 }] : [],
      },
    });

    it('counts complete journeys, and the rest of « Inscrits » as in progress', async () => {
      prisma.repairerProfile.findMany.mockResolvedValue([
        journeyRow('a', true),
        journeyRow('b', false),
        journeyRow('c', false),
      ]);
      const o = await service.overview();
      expect(o.repairers.setupComplete).toEqual({ kind: 'value', value: 1 });
      const total = o.repairers.total.kind === 'value' ? o.repairers.total.value : NaN;
      expect(o.repairers.setupIncomplete).toEqual({ kind: 'value', value: total - 1 });
    });

    it('reads the same repairers as « Inscrits »: live, genuine, repairer mode on', async () => {
      await service.overview();
      const where = prisma.repairerProfile.findMany.mock.calls[0]![0].where;
      expect(where).toMatchObject({ deletedAt: null, user: { profile: { repairerEnabled: true, deletedAt: null } } });
      expect(JSON.stringify(where)).toContain('@demo.revime.fr');
    });
  });
});
