import { describe, expect, it, vi } from 'vitest';
import { repairerDashboardSchema } from '@revime/shared';
import { RepairerDashboardService } from '../src/repairers/repairer-dashboard.service.js';

/**
 * CF4-22/23/26 (sub-project G, spec §4.3). Prisma is mocked: `*.int.spec.ts` write the
 * production database and are never run, so this is the gate.
 */

type Row = {
  id: string;
  status: 'PAID' | 'REFUNDED' | 'PENDING_PAYMENT';
  step: string | null;
  delivery: 'HOME' | 'WORKSHOP' | 'PARCEL';
  createdAt?: Date;
  stepEvents?: { at: Date; step: string }[];
  dispute: { status: string; createdAt?: Date; messages?: { author: 'PARTY' | 'REVIME'; createdAt?: Date }[] } | null;
};

function commande(over: Partial<Row> & { id: string }): Row {
  return { status: 'PAID', step: 'PAID', delivery: 'WORKSHOP', dispute: null, ...over };
}

const demande = { demande: { title: 'Écran cassé' } };

type Fixture = {
  profile?: {
    repairerEnabled: boolean;
    repairerSuspendedAt?: Date | null;
    dashboardTodoSeenAt?: Date | null;
  } | null;
  commandes?: Row[];
  declared?: { categoryId: string }[];
  tree?: { id: string; parentId: string | null }[];
  matchingCount?: number;
  unseenMatchingCount?: number;
  quoteRequestsCount?: number;
  unseenQuoteRequestsCount?: number;
  stepEvents?: unknown[];
  releases?: unknown[];
  reviews?: unknown[];
  disputes?: unknown[];
};

function harness(f: Fixture = {}) {
  const prisma = {
    profile: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          f.profile === undefined
            ? { repairerEnabled: true, dashboardTodoSeenAt: null }
            : f.profile,
        ),
      update: vi.fn().mockResolvedValue({}),
    },
    commande: {
      // First call: « À faire » rows. Second call: released rows (activity).
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        'releasedAt' in args.where ? (f.releases ?? []) : (f.commandes ?? []),
      ),
    },
    repairerCategory: { findMany: vi.fn().mockResolvedValue(f.declared ?? [{ categoryId: 'c1' }]) },
    category: { findMany: vi.fn().mockResolvedValue(f.tree ?? [{ id: 'c1', parentId: null }]) },
    // CF4-25: the QUOTE_REQUESTS count (target in the where) answers 0 here; its own spec is
    // quote-requests-admin-dashboard.spec.ts.
    demande: {
      count: vi.fn(async (args: { where: Record<string, unknown> }) => {
        if (typeof args.where.targetRepairerUserId === 'string') {
          if (
            args.where.createdAt &&
            typeof args.where.createdAt === 'object' &&
            'gt' in (args.where.createdAt as any)
          ) {
            return f.unseenQuoteRequestsCount ?? 0;
          }
          return f.quoteRequestsCount ?? 0;
        }
        if (
          args.where.createdAt &&
          typeof args.where.createdAt === 'object' &&
          'gt' in (args.where.createdAt as any)
        ) {
          return f.unseenMatchingCount ?? 0;
        }
        return f.matchingCount ?? 0;
      }),
    },
    commandeStepEvent: { findMany: vi.fn().mockResolvedValue(f.stepEvents ?? []) },
    review: { findMany: vi.fn().mockResolvedValue(f.reviews ?? []) },
    dispute: { findMany: vi.fn().mockResolvedValue(f.disputes ?? []) },
  };
  return { prisma, service: new RepairerDashboardService(prisma as never) };
}

describe('RepairerDashboardService.get - guard', () => {
  it('FORBIDDEN when réparateur mode is off', async () => {
    const { service } = harness({ profile: { repairerEnabled: false } });
    await expect(service.get('me')).rejects.toMatchObject({
      message: 'Activez le mode réparateur pour suivre votre activité.',
    });
  });

  it('FORBIDDEN when there is no profile', async () => {
    const { service } = harness({ profile: null });
    await expect(service.get('me')).rejects.toThrow(/mode réparateur/);
  });

  it('a suspended réparateur is not refused', async () => {
    const { service } = harness({
      profile: { repairerEnabled: true, repairerSuspendedAt: new Date() },
    });
    await expect(service.get('me')).resolves.toBeTruthy();
  });
});

describe('RepairerDashboardService.get - « À faire »', () => {
  it('empty when nothing to do', async () => {
    const { service } = harness();
    expect((await service.get('me')).todo).toEqual([]);
  });

  it('fixed order DISPUTE, ATTENTION, MATCHING and no zero item', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'a', step: 'PAID' }), // his turn (WORKSHOP: next REPAIR_STARTED)
        commande({ id: 'd', step: 'REPAIR_STARTED', dispute: { status: 'OPEN' } }),
      ],
      matchingCount: 2,
    });
    const { todo } = await service.get('me');
    expect(todo).toEqual([
      { kind: 'DISPUTE', count: 1, commandeId: 'd', awaitingReply: 0 },
      { kind: 'ATTENTION', count: 1, commandeId: 'a' },
      { kind: 'MATCHING', count: 2 },
    ]);
  });

  it('a commande with an OPEN dispute on his turn counts under DISPUTE only', async () => {
    const { service } = harness({
      commandes: [commande({ id: 'x', step: 'PAID', dispute: { status: 'IN_REVIEW' } })],
    });
    expect((await service.get('me')).todo).toEqual([
      { kind: 'DISPUTE', count: 1, commandeId: 'x', awaitingReply: 0 },
    ]);
  });

  it('the same commande once the dispute is RESOLVED_* returns to ATTENTION (Review Focus 4)', async () => {
    const { service } = harness({
      commandes: [commande({ id: 'x', step: 'PAID', dispute: { status: 'RESOLVED_RELEASED' } })],
    });
    expect((await service.get('me')).todo).toEqual([
      { kind: 'ATTENTION', count: 1, commandeId: 'x' },
    ]);
  });

  it('not his turn -> no ATTENTION', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'p', step: 'PAID', delivery: 'PARCEL' }), // client ships
        commande({ id: 'v', step: 'AWAITING_VALIDATION' }),
        commande({ id: 'r', step: 'RELEASED' }),
        commande({ id: 'f', status: 'REFUNDED', step: 'REPAIR_STARTED' }),
        commande({ id: 'n', step: null }),
      ],
    });
    expect((await service.get('me')).todo).toEqual([]);
  });

  it('commandeId only at count 1', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'a', step: 'PAID' }),
        commande({ id: 'b', step: 'REPAIR_DONE' }),
        commande({ id: 'd1', dispute: { status: 'OPEN' } }),
        commande({ id: 'd2', dispute: { status: 'OPEN' } }),
      ],
    });
    expect((await service.get('me')).todo).toEqual([
      { kind: 'DISPUTE', count: 2, commandeId: null, awaitingReply: 0 },
      { kind: 'ATTENTION', count: 2, commandeId: null },
    ]);
  });

  it('no declared categories -> CATEGORIES_MISSING last, and no demande count query', async () => {
    const { service, prisma } = harness({
      declared: [],
      commandes: [commande({ id: 'a', step: 'PAID' })],
    });
    const { todo } = await service.get('me');
    expect(todo.at(-1)).toEqual({ kind: 'CATEGORIES_MISSING' });
    expect(todo).toHaveLength(2);
    // CF4-25: only the QUOTE_REQUESTS count (target = him) runs; no matching count.
    const matchingCalls = prisma.demande.count.mock.calls.filter(
      (c) => typeof (c[0] as { where: Record<string, unknown> }).where.targetRepairerUserId !== 'string',
    );
    expect(matchingCalls).toHaveLength(0);
  });

  it('counts matching demandes with matchingDemandeWhere', async () => {
    const { service, prisma } = harness({ matchingCount: 3 });
    const { todo } = await service.get('me');
    expect(todo).toEqual([{ kind: 'MATCHING', count: 3 }]);
    const where = prisma.demande.count.mock.calls
      .map((c) => (c[0] as { where: Record<string, unknown> }).where)
      .find((w) => typeof w.targetRepairerUserId !== 'string')!;
    expect(where.authorUserId).toEqual({ not: 'me' });
    expect(where.categoryId).toEqual({ in: ['c1'] });
    expect(where.offers).toEqual({ none: { repairerUserId: 'me', deletedAt: null } });
  });
});

describe('RepairerDashboardService.get - CF4-22 dispute awaiting his reply', () => {
  const open = (messages?: { author: 'PARTY' | 'REVIME' }[]) => ({ status: 'OPEN', messages });

  it('REVIME wrote last in his space -> awaitingReply counts it and commandeId points at it', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'quiet', dispute: open([]) }),
        commande({ id: 'asked', dispute: open([{ author: 'REVIME' }]) }),
        commande({ id: 'answered', dispute: open([{ author: 'PARTY' }]) }),
      ],
    });
    expect((await service.get('me')).todo).toEqual([
      { kind: 'DISPUTE', count: 3, commandeId: 'asked', awaitingReply: 1 },
    ]);
  });

  it('two awaiting -> commandeId null', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'a', dispute: open([{ author: 'REVIME' }]) }),
        commande({ id: 'b', dispute: { status: 'IN_REVIEW', messages: [{ author: 'REVIME' }] } }),
      ],
    });
    expect((await service.get('me')).todo).toEqual([
      { kind: 'DISPUTE', count: 2, commandeId: null, awaitingReply: 2 },
    ]);
  });

  it('a resolved dispute never awaits a reply', async () => {
    const { service } = harness({
      commandes: [
        commande({ id: 'r', step: 'RELEASED', dispute: { status: 'RESOLVED_RELEASED', messages: [{ author: 'REVIME' }] } }),
      ],
    });
    expect((await service.get('me')).todo).toEqual([]);
  });

  it('reads only the latest non-deleted message of HIS space (never the client space)', async () => {
    const { service, prisma } = harness();
    await service.get('me');
    const select = prisma.commande.findMany.mock.calls.find(
      ([a]) => !('releasedAt' in a.where),
    )?.[0] as unknown as { select: { dispute: { select: { messages: unknown } } } };
    expect(select.select.dispute.select.messages).toEqual({
      where: { space: 'REPAIRER', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { author: true, createdAt: true },
    });
  });
});

describe('RepairerDashboardService.get - scope (Review Focus 1, 3)', () => {
  it('every commande / review / dispute / step read is scoped to him as RÉPARATEUR', async () => {
    const { service, prisma } = harness();
    await service.get('me');
    const calls = [
      ...prisma.commande.findMany.mock.calls,
      ...prisma.review.findMany.mock.calls,
      ...prisma.dispute.findMany.mock.calls,
      ...prisma.commandeStepEvent.findMany.mock.calls,
    ];
    expect(calls.length).toBe(5);
    for (const [args] of calls) {
      const json = JSON.stringify(args.where);
      expect(json).toContain('"repairerUserId":"me"');
      expect(json).not.toContain('clientUserId');
    }
  });

  it('FUNDS_RELEASED reads only PAID commandes (a refund removes it)', async () => {
    const { service, prisma } = harness();
    await service.get('me');
    const released = prisma.commande.findMany.mock.calls.find(
      ([a]) => 'releasedAt' in a.where,
    )?.[0];
    expect(released?.where).toMatchObject({
      repairerUserId: 'me',
      status: 'PAID',
      releasedAt: { not: null },
    });
  });

  // V8 B2: since a missing Connect account is held too, a validated order whose payout Revime holds
  // is RELEASED with no transfer. « Fonds versés · X » would be false for it; it appears once paid.
  it('FUNDS_RELEASED reads only commandes whose transfer left (a held payout is not « versés »)', async () => {
    const { service, prisma } = harness();
    await service.get('me');
    const released = prisma.commande.findMany.mock.calls.find(
      ([a]) => 'releasedAt' in a.where,
    )?.[0];
    expect(released?.where).toMatchObject({ stripeTransferId: { not: null } });
  });

  it('step events are limited to PAID and REPAIR_DONE', async () => {
    const { service, prisma } = harness();
    await service.get('me');
    expect(prisma.commandeStepEvent.findMany.mock.calls[0]?.[0].where.step).toEqual({
      in: ['PAID', 'REPAIR_DONE'],
    });
  });
});

describe('RepairerDashboardService.get - « Activité récente »', () => {
  const d = (day: number) => new Date(Date.UTC(2026, 8, day, 12));

  it('maps every source, merges newest first, cuts at 5, and parses', async () => {
    const { service } = harness({
      stepEvents: [
        { step: 'PAID', at: d(1), commandeId: 'c1', commande: demande },
        { step: 'REPAIR_DONE', at: d(3), commandeId: 'c1', commande: demande },
        { step: 'PAID', at: d(2), commandeId: 'c2', commande: demande },
      ],
      releases: [
        { id: 'c1', releasedAt: d(5), transferredCents: null, repairCents: 4500, ...demande },
      ],
      reviews: [{ rating: 4, createdAt: d(6), commandeId: 'c1', commande: demande }],
      disputes: [{ createdAt: d(4), commandeId: 'c2', commande: demande }],
    });
    const dto = await service.get('me');
    expect(repairerDashboardSchema.parse(dto)).toEqual(dto);
    expect(dto.activity).toEqual([
      {
        kind: 'REVIEW_RECEIVED',
        at: d(6).toISOString(),
        commandeId: 'c1',
        subject: 'Écran cassé',
        amountCents: null,
        rating: 4,
      },
      {
        kind: 'FUNDS_RELEASED',
        at: d(5).toISOString(),
        commandeId: 'c1',
        subject: 'Écran cassé',
        amountCents: 4500,
        rating: null,
      },
      {
        kind: 'DISPUTE_OPENED',
        at: d(4).toISOString(),
        commandeId: 'c2',
        subject: 'Écran cassé',
        amountCents: null,
        rating: null,
      },
      {
        kind: 'REPAIR_DONE',
        at: d(3).toISOString(),
        commandeId: 'c1',
        subject: 'Écran cassé',
        amountCents: null,
        rating: null,
      },
      {
        kind: 'OFFER_ACCEPTED',
        at: d(2).toISOString(),
        commandeId: 'c2',
        subject: 'Écran cassé',
        amountCents: null,
        rating: null,
      },
    ]);
  });

  it('FUNDS_RELEASED amount is what was transferred when recorded', async () => {
    const { service } = harness({
      releases: [
        { id: 'c1', releasedAt: d(5), transferredCents: 4000, repairCents: 4500, ...demande },
      ],
    });
    expect((await service.get('me')).activity[0]?.amountCents).toBe(4000);
  });
});

describe('RepairerDashboardService - CF5-15 unseen todo count & markSeen', () => {
  it('when dashboardTodoSeenAt is null, unseenTodoCount equals total todoBadgeCount', async () => {
    const { service } = harness({
      profile: { repairerEnabled: true, dashboardTodoSeenAt: null },
      commandes: [
        commande({ id: 'a', step: 'PAID' }),
        commande({ id: 'd', step: 'REPAIR_STARTED', dispute: { status: 'OPEN' } }),
      ],
      matchingCount: 2,
    });
    const res = await service.get('me');
    expect(res.todoSeenAt).toBeNull();
    expect(res.unseenTodoCount).toBe(4); // 1 attention + 1 dispute + 2 matching
  });

  it('when dashboardTodoSeenAt is set and no items are newer, unseenTodoCount is 0', async () => {
    const seenAt = new Date('2026-10-04T10:00:00Z');
    const earlier = new Date('2026-10-04T09:00:00Z');
    const { service } = harness({
      profile: { repairerEnabled: true, dashboardTodoSeenAt: seenAt },
      commandes: [
        commande({ id: 'a', step: 'PAID', stepEvents: [{ at: earlier, step: 'PAID' }] }),
        commande({
          id: 'd',
          step: 'REPAIR_STARTED',
          dispute: { status: 'OPEN', createdAt: earlier },
        }),
      ],
      matchingCount: 2,
      unseenMatchingCount: 0,
    });
    const res = await service.get('me');
    expect(res.todoSeenAt).toBe(seenAt.toISOString());
    expect(res.unseenTodoCount).toBe(0);
    // todo list is still populated for the dashboard view
    expect(res.todo.length).toBe(3);
  });

  it('when an item is created/updated after dashboardTodoSeenAt, unseenTodoCount counts only newer items', async () => {
    const seenAt = new Date('2026-10-04T10:00:00Z');
    const earlier = new Date('2026-10-04T09:00:00Z');
    const later = new Date('2026-10-04T11:00:00Z');
    const { service } = harness({
      profile: { repairerEnabled: true, dashboardTodoSeenAt: seenAt },
      commandes: [
        commande({ id: 'a', step: 'PAID', stepEvents: [{ at: earlier, step: 'PAID' }] }),
        commande({
          id: 'd',
          step: 'REPAIR_STARTED',
          dispute: { status: 'OPEN', createdAt: later },
        }),
      ],
      matchingCount: 3,
      unseenMatchingCount: 1, // 1 new matching demande after seenAt
    });
    const res = await service.get('me');
    expect(res.unseenTodoCount).toBe(2); // 1 newer dispute + 1 newer matching
  });

  it('dispute message from PARTY (the repairer himself) after seenAt does NOT count as unseen, but REVIME does', async () => {
    const seenAt = new Date('2026-10-04T10:00:00Z');
    const earlier = new Date('2026-10-04T09:00:00Z');
    const later = new Date('2026-10-04T11:00:00Z');

    // Repairer's own reply
    const { service: s1 } = harness({
      profile: { repairerEnabled: true, dashboardTodoSeenAt: seenAt },
      commandes: [
        commande({
          id: 'd',
          step: 'REPAIR_STARTED',
          dispute: {
            status: 'OPEN',
            createdAt: earlier,
            messages: [{ author: 'PARTY', createdAt: later }],
          },
        }),
      ],
    });
    expect((await s1.get('me')).unseenTodoCount).toBe(0);

    // REVIME's reply
    const { service: s2 } = harness({
      profile: { repairerEnabled: true, dashboardTodoSeenAt: seenAt },
      commandes: [
        commande({
          id: 'd',
          step: 'REPAIR_STARTED',
          dispute: {
            status: 'OPEN',
            createdAt: earlier,
            messages: [{ author: 'REVIME', createdAt: later }],
          },
        }),
      ],
    });
    expect((await s2.get('me')).unseenTodoCount).toBe(1);
  });

  it('markSeen updates profile dashboardTodoSeenAt with current date', async () => {
    const { service, prisma } = harness();
    await service.markSeen('me');
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: 'me' },
      data: { dashboardTodoSeenAt: expect.any(Date) },
    });
  });
});
