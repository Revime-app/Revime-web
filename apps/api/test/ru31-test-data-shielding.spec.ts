import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import {
  GENUINE_COLLECTED_COMMANDE_WHERE,
  GENUINE_COMMANDE_PAID_WHERE,
  GENUINE_COMMANDE_WHERE,
  GENUINE_USER_WHERE,
} from '../src/admin/admin-constants.js';
import { AdminExportsService } from '../src/admin/admin-exports.service.js';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';
import { AdminPaymentsService } from '../src/admin/admin-payments.service.js';
import { AdminPayoutsService } from '../src/admin/admin-payouts.service.js';
import { AdminStatsService } from '../src/admin/admin-stats.service.js';
import { NOT_DEMO_REVIEW_WHERE } from '../src/reviews/demo-review.js';
import { repairerStats } from '../src/reviews/repairer-stats.js';

/**
 * RU-31 (review of PRE-1 to PRE-3). PRE-3 shielded the overview tiles it listed, and the client's
 * wording is « exclusion des stats »: every figure an operator reads as real. These specs pin the
 * shared predicates by EVALUATING them on e-mails (a literal `toEqual` of the constant would only
 * restate it), then check that each statistic, KPI, export and rating query carries them.
 */

type EmailFilter = { endsWith?: string; mode?: 'insensitive'; not?: { endsWith?: string } };

/** Evaluates the `{ email: filter }` shapes the predicates use; anything else throws. */
function emailMatches(email: string, filter: EmailFilter): boolean {
  const fold = (s: string) => (filter.mode === 'insensitive' ? s.toLowerCase() : s);
  const ends = (suffix: string) => fold(email).endsWith(fold(suffix));
  if (filter.not) {
    if (!filter.not.endsWith) throw new Error('unsupported filter');
    return !ends(filter.not.endsWith);
  }
  if (filter.endsWith) return ends(filter.endsWith);
  throw new Error('unsupported filter');
}

function userMatches(email: string, where: { AND: Array<{ email: EmailFilter }> }): boolean {
  return where.AND.every((clause) => emailMatches(email, clause.email));
}

function reviewMatches(
  authorEmail: string,
  repairerEmail: string,
  where: { author: { email: EmailFilter }; repairer: { email: EmailFilter } },
): boolean {
  return emailMatches(authorEmail, where.author.email) && emailMatches(repairerEmail, where.repairer.email);
}

/** A where is shielded when it names BOTH exclusion suffixes (the evaluator tests the semantics). */
const SHIELDED = (where: unknown): boolean => {
  const json = JSON.stringify(where);
  return json.includes('@repareme.test') && json.includes('@demo.revime.fr');
};

const callsOf = (fn: { mock: { calls: unknown[][] } }): Array<{ where?: unknown }> =>
  fn.mock.calls.map((c) => (c[0] ?? {}) as { where?: unknown });

describe('RU-31 shared predicates', () => {
  it('GENUINE_USER_WHERE excludes fixture and demo accounts whatever the e-mail case', () => {
    expect(userMatches('claire@gmail.com', GENUINE_USER_WHERE)).toBe(true);
    expect(userMatches('x1@repareme.test', GENUINE_USER_WHERE)).toBe(false);
    expect(userMatches('X1@REPAREME.TEST', GENUINE_USER_WHERE)).toBe(false);
    expect(userMatches('a@demo.revime.fr', GENUINE_USER_WHERE)).toBe(false);
    expect(userMatches('A@Demo.Revime.FR', GENUINE_USER_WHERE)).toBe(false);
  });

  it('NOT_DEMO_REVIEW_WHERE drops a review whose author OR réparateur is a demo account', () => {
    expect(reviewMatches('c@gmail.com', 'r@gmail.com', NOT_DEMO_REVIEW_WHERE)).toBe(true);
    expect(reviewMatches('c@demo.revime.fr', 'r@gmail.com', NOT_DEMO_REVIEW_WHERE)).toBe(false);
    expect(reviewMatches('C@DEMO.REVIME.FR', 'r@gmail.com', NOT_DEMO_REVIEW_WHERE)).toBe(false);
    expect(reviewMatches('c@gmail.com', 'R@DEMO.REVIME.FR', NOT_DEMO_REVIEW_WHERE)).toBe(false);
  });

  it('a collected order needs a Stripe payment intent AND genuine parties; PAID composes it', () => {
    expect(GENUINE_COMMANDE_WHERE).toEqual({ client: GENUINE_USER_WHERE, repairer: GENUINE_USER_WHERE });
    expect(GENUINE_COLLECTED_COMMANDE_WHERE).toMatchObject({
      ...GENUINE_COMMANDE_WHERE,
      stripePaymentIntentId: { not: null },
    });
    expect(GENUINE_COMMANDE_PAID_WHERE).toMatchObject({ ...GENUINE_COLLECTED_COMMANDE_WHERE, status: 'PAID' });
  });
});

describe('RU-31 PRE-2 public rating', () => {
  it('the rating aggregate (offers, favourites, fiche) excludes demo reviews like the list does', async () => {
    const reviewGroupBy = vi.fn().mockResolvedValue([]);
    const prisma = { review: { groupBy: reviewGroupBy }, commande: { groupBy: vi.fn().mockResolvedValue([]) } };

    await repairerStats(prisma as never, ['rep-1']);

    const args = reviewGroupBy.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ repairerUserId: { in: ['rep-1'] }, deletedAt: null, ...NOT_DEMO_REVIEW_WHERE });
  });
});

describe('RU-31 PRE-3 statistics page', () => {
  it('every population query of /statistiques excludes fixture and demo accounts', async () => {
    const model = () => ({ findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) });
    const prisma = { demande: model(), commande: model(), offer: model(), user: model() };
    const service = new AdminStatsService(prisma as never);

    await service.getOverview({});

    for (const name of ['demande', 'commande', 'offer', 'user'] as const) {
      const calls = [...callsOf(prisma[name].findMany), ...callsOf(prisma[name].count)];
      expect(calls.length, `${name} was never queried`).toBeGreaterThanOrEqual(2);
      for (const call of calls) {
        expect(SHIELDED(call.where), `${name} query is not shielded: ${JSON.stringify(call.where)}`).toBe(true);
      }
    }
    for (const call of callsOf(prisma.commande.findMany)) {
      expect(call.where).toMatchObject(GENUINE_COLLECTED_COMMANDE_WHERE);
    }
  });
});

describe('RU-31 PRE-3 payment and payout KPIs', () => {
  it('payments KPIs (volume, commission, escrow, refunded, disputed) count genuine orders only', async () => {
    const prisma = {
      commande: {
        aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      dispute: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = new AdminPaymentsService(prisma as never);

    await service.list({});

    const aggregates = callsOf(prisma.commande.aggregate);
    expect(aggregates).toHaveLength(3);
    for (const call of aggregates) {
      expect(call.where).toMatchObject(GENUINE_COLLECTED_COMMANDE_WHERE);
    }
    const disputes = callsOf(prisma.dispute.count);
    expect(disputes).toHaveLength(1);
    expect(disputes[0]!.where).toMatchObject({ commande: GENUINE_COMMANDE_WHERE });
  });

  it('payout KPIs (transferred, pending escrow, failed transfers) count genuine orders only', async () => {
    const prisma = {
      commande: {
        aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
        count: vi.fn().mockResolvedValue(0),
        // Amended 2026-11-18 by V8 `ISS8-013`: released, untransferred orders are read (findMany) and
        // split into failed and held, instead of counted; the same genuine-orders where applies.
        findMany: vi.fn().mockResolvedValue([]),
      },
      connectAccount: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = new AdminPayoutsService(prisma as never, {} as never, {} as never);

    await service.getPayoutKpis();

    for (const call of [...callsOf(prisma.commande.aggregate), ...callsOf(prisma.commande.findMany)]) {
      expect(call.where).toMatchObject(GENUINE_COLLECTED_COMMANDE_WHERE);
    }
    expect(prisma.commande.aggregate).toHaveBeenCalledTimes(2);
    expect(prisma.commande.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.commande.count).not.toHaveBeenCalled();
  });
});

describe('RU-31 PRE-3 accounting exports', () => {
  it('summary, collections, commissions and refunds reports exclude fixture and demo orders', async () => {
    const prisma = {
      commande: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    };
    const service = new AdminExportsService(prisma as never, {} as never, {} as never, {} as never);
    const bounds = { start: new Date('2026-10-01T00:00:00.000Z'), end: new Date('2026-10-31T23:59:59.000Z') };

    await service.getExportSummary({ period: 'this_month' } as never);
    await service.buildCollectionsReport(bounds);
    await service.buildCommissionsVatReport(bounds);
    await service.buildRefundsReport(bounds);

    const calls = [...callsOf(prisma.commande.findMany), ...callsOf(prisma.commande.count)];
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const call of calls) {
      expect(call.where).toMatchObject(GENUINE_COLLECTED_COMMANDE_WHERE);
    }
  });
});

describe('RU-31 PRE-3 overview, the tiles PRE-3 left out', () => {
  let prisma: any;
  let service: AdminOverviewService;

  beforeEach(() => {
    const count = () => vi.fn().mockResolvedValue(0);
    prisma = {
      $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
      user: { count: count() },
      session: { findMany: vi.fn().mockResolvedValue([]) },
      profile: { count: count() },
      repairerProfile: { count: count(), findMany: vi.fn().mockResolvedValue([]) }, // findMany: V8 E1 setup figures
      identityVerification: { count: count() },
      businessVerification: { count: count() },
      demande: { count: count(), findMany: vi.fn().mockResolvedValue([]) },
      offer: { count: count() },
      commande: {
        count: count(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 0, protectionCents: 0 } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      dispute: { count: count() },
    };
    service = new AdminOverviewService(prisma as never, NO_ATTENTION as never);
    // The sidebar badges are operator work queues (a fixture's open dispute is still a row to open).
    vi.spyOn(service, 'getBadgeCounts').mockResolvedValue({
      litiges: 0,
      annulations: 0,
      signalements: 0,
      verifications: 0,
      equipe: 0,
    });
  });

  it('every demande, offer, commande and dispute figure of the overview is shielded', async () => {
    await service.overview();

    for (const name of ['profile', 'demande', 'offer', 'commande', 'dispute'] as const) {
      const model = prisma[name];
      const calls = [
        ...callsOf(model.count),
        ...(model.aggregate ? callsOf(model.aggregate) : []),
        ...(model.findMany ? callsOf(model.findMany) : []),
      ];
      expect(calls.length, `${name} was never queried`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(SHIELDED(call.where), `${name} query is not shielded: ${JSON.stringify(call.where)}`).toBe(true);
      }
    }
  });
});
