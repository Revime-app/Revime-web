import { describe, expect, it } from 'vitest';
import { CommandeStatus } from '../src/generated/prisma/enums.js';
import {
  isAtEightyPercentOfQuota,
  particularQuotaOrdersWhere,
  rollingQuotaWindowStart,
  summariseParticularQuota,
  type QuotaOrder,
} from '../src/verification/particular-quota.js';

/**
 * RU-29 / A2 and A3. The counter (user detail) and the 80 % alert (verifications) used to carry
 * their own copy of « which orders count over 12 months », anchored on `createdAt`, which is when
 * the payment attempt opened, and counting an order a refund had taken back. One definition now.
 */
const order = (over: Partial<QuotaOrder> = {}): QuotaOrder => ({
  repairCents: 10000,
  refundRepairCents: null,
  paidAt: new Date('2026-03-01T10:00:00Z'),
  ...over,
});

describe('the orders CGU art. 53 counts', () => {
  const start = new Date('2025-10-19T00:00:00Z');

  it('asks for paid, unrefunded orders paid inside the window, for one or several réparateurs', () => {
    const one = particularQuotaOrdersWhere('u1', start);
    expect(one).toEqual({
      repairerUserId: 'u1',
      status: 'PAID',
      stripeRefundId: null,
      paidAt: { gte: start },
    });
    const many = particularQuotaOrdersWhere(['u1', 'u2'], start);
    expect(many.repairerUserId).toEqual({ in: ['u1', 'u2'] });
  });

  it('only uses a status the generated enum contains', () => {
    const where = particularQuotaOrdersWhere('u1', start);
    expect(Object.values(CommandeStatus)).toContain(where.status);
  });

  it('opens the window exactly one calendar year back, in UTC', () => {
    expect(rollingQuotaWindowStart(new Date('2026-10-19T08:00:00Z')).toISOString()).toBe(
      '2025-10-19T08:00:00.000Z',
    );
  });
});

describe('summariseParticularQuota', () => {
  it('is empty with no order and gives no release date', () => {
    expect(summariseParticularQuota([])).toEqual({
      missionsCount: 0,
      amountCollectedCents: 0,
      nextMissionReleaseAt: null,
    });
  });

  it('counts missions, sums what the réparateur kept and dates the release from the OLDEST payment', () => {
    const out = summariseParticularQuota([
      order({ repairCents: 15000, paidAt: new Date('2026-05-02T09:00:00Z') }),
      order({ repairCents: 20000, paidAt: new Date('2026-01-14T09:00:00Z') }),
      order({ repairCents: 5000, refundRepairCents: 2000, paidAt: new Date('2026-02-01T09:00:00Z') }),
    ]);
    expect(out.missionsCount).toBe(3);
    // 150 + 200 + (50 - 20 refunded) euros
    expect(out.amountCollectedCents).toBe(15000 + 20000 + 3000);
    expect(out.nextMissionReleaseAt?.toISOString()).toBe('2027-01-14T09:00:00.000Z');
  });
});

describe('isAtEightyPercentOfQuota', () => {
  it('fires at 8 missions or 1 200 euros, not below', () => {
    expect(isAtEightyPercentOfQuota({ missionsCount: 7, amountCollectedCents: 119999 })).toBe(false);
    expect(isAtEightyPercentOfQuota({ missionsCount: 8, amountCollectedCents: 0 })).toBe(true);
    expect(isAtEightyPercentOfQuota({ missionsCount: 1, amountCollectedCents: 120000 })).toBe(true);
  });
});
