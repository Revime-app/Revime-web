import { describe, expect, it } from 'vitest';
import {
  activityCells,
  repairerActivity,
  repairerProfileCounts,
  revenueDeltaPercent,
  revenueSubline,
  type CommandeListItem,
  type CommandeStatus,
  type CommandeStep,
  type RepairerActivity,
} from '@revime/shared';

/**
 * The réparateur dashboard's arithmetic, tested here because `apps/mobile` has no test
 * harness and `tsc` cannot see any of these mistakes: a refund counted as revenue, a
 * December-to-January month boundary, or a percentage over a zero base.
 *
 * A fixed "now" rather than `new Date()`, so every assertion below means the same thing
 * in five years.
 *
 * 🛑 **Dates are built from LOCAL parts, never written as a UTC literal**, and that is a
 * finding rather than a style choice. `repairerActivity` buckets by the device's local
 * calendar, which is right for the user: a commande opened at 01:00 on 1 August in Paris
 * belongs to his August. But it means `'2026-07-31T23:00:00.000Z'` is July in a UTC CI
 * container and August on this machine, so a UTC literal near a month boundary asserts
 * different things in different places. The first version of this file had exactly that and
 * failed here while passing its own intent.
 */
const NOW = local(2026, 8, 20);

/** An ISO string for midday on a given local calendar day. `month` is 1-based. */
function local(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function iso(year: number, month: number, day: number): string {
  return local(year, month, day).toISOString();
}

type Row = Pick<CommandeListItem, 'status' | 'step' | 'payoutCents' | 'releasedAt' | 'hasStripeTransfer'>;

function row(over: Partial<Row> = {}): Row {
  return {
    status: 'PAID' satisfies CommandeStatus,
    step: 'RELEASED' satisfies CommandeStep,
    payoutCents: 8000,
    releasedAt: iso(2026, 8, 4),
    ...over,
  };
}

describe('repairerActivity', () => {
  /**
   * V8 `ISS8-007` (owner: « Yes, fix it », 2026-11-17). A payout Revime is HOLDING (the client
   * validated, the réparateur has not finished « Virements » or his fiscal information) is RELEASED
   * with no transfer. It is a finished repair, but the money is not his yet: « En attente », never
   * « Versés » nor the month's revenue. `=== false` only: an older API sends no field.
   */
  it('counts a held payout as a finished repair and as « en attente », never as paid or revenue', () => {
    const a = repairerActivity(
      [row({ payoutCents: 8000, hasStripeTransfer: false }), row({ payoutCents: 4550, hasStripeTransfer: true })],
      NOW,
    );
    expect(a.releasedCount).toBe(2);
    expect(a.pendingCents).toBe(8000);
    expect(a.paidOutCents).toBe(4550);
    expect(a.revenueThisMonthCents).toBe(4550);
    expect(a.activeCount).toBe(0);
  });

  it('keeps a held payout out of last month too', () => {
    const a = repairerActivity([row({ releasedAt: iso(2026, 7, 10), hasStripeTransfer: false })], NOW);
    expect(a.revenueLastMonthCents).toBe(0);
    expect(a.pendingCents).toBe(8000);
  });

  it('reads a row with no hasStripeTransfer (an older API) as paid, as before', () => {
    const a = repairerActivity([row({ payoutCents: 8000 })], NOW);
    expect(a.paidOutCents).toBe(8000);
    expect(a.pendingCents).toBe(0);
  });

  it('reads all zeroes for an empty list, which is every account in production today', () => {
    expect(repairerActivity([], NOW)).toEqual({
      revenueThisMonthCents: 0,
      revenueLastMonthCents: 0,
      pendingCents: 0,
      activeCount: 0,
      releasedCount: 0,
      paidOutCents: 0,
    });
  });

  it('counts a released commande as revenue for the month it belongs to', () => {
    const a = repairerActivity([row({ payoutCents: 8000 }), row({ payoutCents: 4550 })], NOW);
    expect(a.revenueThisMonthCents).toBe(12_550);
    expect(a.releasedCount).toBe(2);
    expect(a.pendingCents).toBe(0);
    expect(a.activeCount).toBe(0);
  });

  it('buckets revenue by releasedAt, not by when the commande was opened', () => {
    const a = repairerActivity(
      [
        // Released this month.
        row({ payoutCents: 8000, releasedAt: iso(2026, 8, 4) }),
        // Released last month.
        row({ payoutCents: 3000, releasedAt: iso(2026, 7, 30) }),
      ],
      NOW,
    );
    expect(a.revenueThisMonthCents).toBe(8000);
    expect(a.revenueLastMonthCents).toBe(3000);
  });

  it('separates last month from this month', () => {
    const a = repairerActivity(
      [
        row({ payoutCents: 8000, releasedAt: iso(2026, 8, 4) }),
        row({ payoutCents: 3000, releasedAt: iso(2026, 7, 31) }),
        // Two months back is neither, so it belongs to neither figure.
        row({ payoutCents: 9900, releasedAt: iso(2026, 6, 15) }),
      ],
      NOW,
    );
    expect(a.revenueThisMonthCents).toBe(8000);
    expect(a.revenueLastMonthCents).toBe(3000);
    // `terminées` is a lifetime total, so the June row still counts here.
    expect(a.releasedCount).toBe(3);
  });

  it('crosses the year boundary, where a naive month - 1 would lose December', () => {
    const a = repairerActivity(
      [row({ payoutCents: 5000, releasedAt: iso(2026, 12, 20) })],
      local(2027, 1, 10),
    );
    expect(a.revenueLastMonthCents).toBe(5000);
    expect(a.revenueThisMonthCents).toBe(0);
  });

  it('December release is « mois dernier » in January', () => {
    const now = local(2027, 1, 10);
    const a = repairerActivity([row({ payoutCents: 4200, releasedAt: iso(2026, 12, 15) })], now);
    expect(a.revenueLastMonthCents).toBe(4200);
  });

  it('🛑 EXCLUDES a refund from revenue, in every figure it could leak into', () => {
    const a = repairerActivity(
      [row({ status: 'REFUNDED', payoutCents: 8000 }), row({ status: 'REFUNDED', step: 'PAID' })],
      NOW,
    );
    expect(a).toEqual({
      revenueThisMonthCents: 0,
      revenueLastMonthCents: 0,
      pendingCents: 0,
      activeCount: 0,
      releasedCount: 0,
      paidOutCents: 0,
    });
  });

  it('excludes an abandoned checkout and one that was never paid', () => {
    const a = repairerActivity(
      [
        row({ status: 'ABANDONED', step: 'PAID' }),
        row({ status: 'PENDING_PAYMENT', step: 'PAID' }),
      ],
      NOW,
    );
    expect(a.pendingCents).toBe(0);
    expect(a.activeCount).toBe(0);
    expect(a.releasedCount).toBe(0);
  });

  it('counts work in flight as pending rather than as revenue', () => {
    const a = repairerActivity(
      [
        row({ step: 'REPAIR_STARTED', payoutCents: 6000 }),
        row({ step: 'AWAITING_VALIDATION', payoutCents: 3200 }),
      ],
      NOW,
    );
    expect(a.pendingCents).toBe(9200);
    expect(a.activeCount).toBe(2);
    expect(a.revenueThisMonthCents).toBe(0);
    expect(a.releasedCount).toBe(0);
  });

  it('keeps pending as a balance rather than a monthly figure', () => {
    // Paid in June, still not released. He is still owed it in August.
    const a = repairerActivity(
      [row({ step: 'REPAIR_STARTED', payoutCents: 6000, releasedAt: null })],
      NOW,
    );
    expect(a.pendingCents).toBe(6000);
    expect(a.activeCount).toBe(1);
  });

  it('a released row with null or unparseable releasedAt is in no month but still paid out', () => {
    const a = repairerActivity(
      [
        row({ releasedAt: null, payoutCents: 8000 }),
        row({ releasedAt: 'not-a-date', payoutCents: 4000 }),
      ],
      NOW,
    );
    expect(a.revenueThisMonthCents).toBe(0);
    expect(a.revenueLastMonthCents).toBe(0);
    expect(a.paidOutCents).toBe(12_000);
    expect(a.releasedCount).toBe(2);
  });

  it('tolerates releasedAt missing from an older API', () => {
    const legacyRow = {
      status: 'PAID' satisfies CommandeStatus,
      step: 'RELEASED' satisfies CommandeStep,
      payoutCents: 5000,
    } as unknown as Row;
    expect(() => repairerActivity([legacyRow], NOW)).not.toThrow();
    const a = repairerActivity([legacyRow], NOW);
    expect(a.revenueThisMonthCents).toBe(0);
    expect(a.revenueLastMonthCents).toBe(0);
    expect(a.paidOutCents).toBe(5000);
    expect(a.releasedCount).toBe(1);
  });

  it('paidOutCents sums PAID+RELEASED only', () => {
    const a = repairerActivity(
      [
        row({ payoutCents: 8000 }), // PAID + RELEASED
        row({ payoutCents: 6000, step: 'REPAIR_STARTED' }), // active, not released
        row({ status: 'REFUNDED', step: 'RELEASED', payoutCents: 9000 }), // refunded, never counted
      ],
      NOW,
    );
    expect(a.paidOutCents).toBe(8000);
  });

  it('ignores a row whose date cannot be read rather than counting it in the wrong month', () => {
    const a = repairerActivity([row({ releasedAt: 'not-a-date', payoutCents: 8000 })], NOW);
    expect(a.revenueThisMonthCents).toBe(0);
    expect(a.revenueLastMonthCents).toBe(0);
    // It is still a finished repair, so the lifetime count keeps it.
    expect(a.releasedCount).toBe(1);
  });
});

describe('revenueDeltaPercent', () => {
  it('🛑 returns null over a zero base, because 0 to 0 is not a percentage', () => {
    expect(revenueDeltaPercent(0, 0)).toBeNull();
    expect(revenueDeltaPercent(12_550, 0)).toBeNull();
  });

  it('rounds to a whole percent', () => {
    expect(revenueDeltaPercent(11_800, 10_000)).toBe(18);
    expect(revenueDeltaPercent(10_000, 10_000)).toBe(0);
  });

  it('goes negative when the month is down, rather than clamping at zero', () => {
    expect(revenueDeltaPercent(7500, 10_000)).toBe(-25);
  });
});

/**
 * The copy, over every state it can reach. This is the half a typecheck is blind to, and
 * the half that has actually shipped defects here: a plural against a count of one, and a
 * fixed clause asserting a comparison that does not exist.
 */
function activity(over: Partial<RepairerActivity> = {}): RepairerActivity {
  return {
    revenueThisMonthCents: 0,
    revenueLastMonthCents: 0,
    pendingCents: 0,
    activeCount: 0,
    releasedCount: 0,
    paidOutCents: 0,
    ...over,
  };
}

describe('revenueSubline', () => {
  it('🛑 explains the zero for an account that has never been paid, which is all of them today', () => {
    expect(revenueSubline(activity())).toBe(
      'Vos revenus apparaîtront ici après votre première réparation payée.',
    );
  });

  it('carries the comparison when a delta exists', () => {
    expect(
      revenueSubline(
        activity({
          revenueThisMonthCents: 11_800,
          revenueLastMonthCents: 10_000,
          pendingCents: 9200,
          releasedCount: 3,
        }),
      ),
    ).toBe('+18 % vs mois dernier');
  });

  it('🛑 returns null in a first earning month rather than printing +0 % or a pending clause', () => {
    const line = revenueSubline(activity({ revenueThisMonthCents: 8000, releasedCount: 1 }));
    expect(line).toBeNull();
  });

  it('returns null for a pending-only account, with no delta to report', () => {
    expect(revenueSubline(activity({ pendingCents: 9200 }))).toBeNull();
  });

  it('signs a fall without a stray plus', () => {
    expect(
      revenueSubline(
        activity({ revenueThisMonthCents: 7500, revenueLastMonthCents: 10_000, releasedCount: 4 }),
      ),
    ).toBe('-25 % vs mois dernier');
  });

  it('never contains « en attente », in any non-null state', () => {
    const states = [
      activity(),
      activity({ pendingCents: 100 }),
      activity({ revenueThisMonthCents: 8000, releasedCount: 1 }),
      activity({ revenueThisMonthCents: 8000, revenueLastMonthCents: 5000, releasedCount: 2 }),
    ];
    for (const s of states) {
      const line = revenueSubline(s);
      if (line !== null) expect(line).not.toContain('en attente');
    }
  });

  it('never contains an apostrophe, in any state', () => {
    const states = [
      activity(),
      activity({ pendingCents: 100 }),
      activity({ revenueThisMonthCents: 8000, releasedCount: 1 }),
      activity({ revenueThisMonthCents: 8000, revenueLastMonthCents: 5000, releasedCount: 2 }),
    ];
    for (const s of states) {
      const line = revenueSubline(s);
      if (line !== null) expect(line).not.toMatch(/['’]/);
    }
  });
});

describe('activityCells', () => {
  it('reads as four honest zeroes for a new réparateur, with « - » for the rating', () => {
    expect(activityCells(activity(), null, 0)).toEqual([
      { value: '0', label: 'en cours' },
      { value: '-', label: 'note moyenne' },
      { value: '0', label: 'avis reçus' },
      { value: '0', label: 'terminées' },
    ]);
  });

  it('🛑 agrees with a count of one, where a fixed plural would read « 1 avis reçus »', () => {
    const cells = activityCells(activity({ activeCount: 1, releasedCount: 1 }), 5, 1);
    expect(cells[2]).toEqual({ value: '1', label: 'avis reçu' });
    expect(cells[3]).toEqual({ value: '1', label: 'terminée' });
    // « en cours » is invariable on purpose, so it is correct at every count.
    expect(cells[0]).toEqual({ value: '1', label: 'en cours' });
  });

  it('renders a rating with a French comma and never as a bare 0', () => {
    expect(activityCells(activity(), 4.8, 12)[1]).toEqual({
      value: '4,8',
      label: 'note moyenne',
    });
    expect(activityCells(activity(), null, 0)[1]?.value).toBe('-');
  });
});

describe('repairerProfileCounts', () => {
  it('counts active commandes and pending offers over a mixed set', () => {
    const commandes: Pick<CommandeListItem, 'status' | 'step'>[] = [
      { status: 'PAID', step: 'REPAIR_STARTED' },
      { status: 'PAID', step: 'RELEASED' },
      { status: 'REFUNDED', step: 'REPAIR_DONE' },
      { status: 'PAID', step: 'AWAITING_VALIDATION' },
    ];
    const offers: { status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' }[] = [
      { status: 'SENT' },
      { status: 'SENT' },
      { status: 'ACCEPTED' },
      { status: 'REJECTED' },
      { status: 'WITHDRAWN' },
    ];
    expect(repairerProfileCounts(commandes, offers)).toEqual({
      activeCount: 2,
      pendingOffersCount: 2,
    });
  });

  it('reads zeroes for an account with no commandes and no offers', () => {
    expect(repairerProfileCounts([], [])).toEqual({
      activeCount: 0,
      pendingOffersCount: 0,
    });
  });
});
