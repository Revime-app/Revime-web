import { describe, expect, it } from 'vitest';
import {
  partialRefundOf,
  refundPlan,
  RefundPlanError,
  reversalExpected,
  shareOwedCents,
} from '../src/commandes/refund-plan.js';
import { computeAmounts } from '@revime/shared';

// Authoritative fixture per the CF4-D task-2 brief: repair 8000, shipping 1700,
// insurance 200, protection 650. shippingCents ceiling for Y is shipping +
// insurance = 1900.
const order = {
  repairCents: 8000,
  shippingCents: 1700,
  insuranceCents: 200,
  protectionCents: 650,
  stripeTransferId: null as string | null,
  transferredCents: null as number | null,
};

describe('refundPlan', () => {
  it('X=repair, Y=all, Z=all, not paid: refunds everything, no transfer needed', () => {
    // The old "full total" behaviour is this row: X = repair, Y = shipping +
    // insurance, Z = protection. See CF4-15 / CF4-33 and spec §3.
    expect(
      refundPlan({ repairCents: 8000, shippingCents: 1900, protectionCents: 650 }, order),
    ).toEqual({
      refundCents: 10550,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('not paid, X < repair: refunds X+Y+Z and needs a payability check before transferring the rest', () => {
    expect(
      refundPlan({ repairCents: 3000, shippingCents: 0, protectionCents: 0 }, order),
    ).toEqual({
      refundCents: 3000,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 5000,
      needsPayabilityCheck: true,
    });
  });

  it('already paid, X > 0: reverses X first, then refunds, no transfer', () => {
    const paid = { ...order, stripeTransferId: 'tr_1', transferredCents: 8000 };
    expect(
      refundPlan({ repairCents: 3000, shippingCents: 1900, protectionCents: 0 }, paid),
    ).toEqual({
      refundCents: 4900,
      reverseFirst: true,
      reverseCents: 3000,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('already paid, X = 0: refunds Y+Z, no reversal, réparateur keeps the repair money', () => {
    const paid = { ...order, stripeTransferId: 'tr_1', transferredCents: 8000 };
    expect(
      refundPlan({ repairCents: 0, shippingCents: 1900, protectionCents: 650 }, paid),
    ).toEqual({
      refundCents: 2550,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('already paid with a historical transferredCents lower than repair: reversal is capped at what was actually transferred', () => {
    const paid = { ...order, stripeTransferId: 'tr_1', transferredCents: 5000 };
    expect(
      refundPlan({ repairCents: 8000, shippingCents: 0, protectionCents: 0 }, paid),
    ).toEqual({
      refundCents: 8000,
      reverseFirst: true,
      reverseCents: 5000,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('transfer id with null transferredCents: a row we do not understand, no reversal, no transfer', () => {
    const legacy = { ...order, stripeTransferId: 'tr_1', transferredCents: null };
    expect(
      refundPlan({ repairCents: 8000, shippingCents: 0, protectionCents: 0 }, legacy),
    ).toEqual({
      refundCents: 8000,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('rejects a repair amount above its ceiling', () => {
    expect(() =>
      refundPlan({ repairCents: 8001, shippingCents: 0, protectionCents: 0 }, order),
    ).toThrow(RefundPlanError);
    expect(() =>
      refundPlan({ repairCents: 8001, shippingCents: 0, protectionCents: 0 }, order),
    ).toThrow('Le montant de la réparation dépasse le montant payé.');
  });

  it('rejects a shipping (+ insurance) amount above its ceiling', () => {
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 1901, protectionCents: 0 }, order),
    ).toThrow(RefundPlanError);
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 1901, protectionCents: 0 }, order),
    ).toThrow('Le montant de la livraison dépasse le montant payé.');
  });

  it('rejects a protection amount above its ceiling', () => {
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 0, protectionCents: 651 }, order),
    ).toThrow(RefundPlanError);
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 0, protectionCents: 651 }, order),
    ).toThrow('Le montant de la Protection REVIME dépasse le montant payé.');
  });

  it('rejects a zero total, checked only after the ceilings pass', () => {
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 0, protectionCents: 0 }, order),
    ).toThrow(RefundPlanError);
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 0, protectionCents: 0 }, order),
    ).toThrow('Le remboursement doit être supérieur à 0 €.');
  });

  it('validates ceilings in order - repair before shipping before protection - even when several are over', () => {
    // repair AND shipping both over ceiling: repair's message wins.
    expect(() =>
      refundPlan({ repairCents: 9000, shippingCents: 2000, protectionCents: 0 }, order),
    ).toThrow('Le montant de la réparation dépasse le montant payé.');
    // shipping AND protection both over ceiling, repair fine: shipping's message wins.
    expect(() =>
      refundPlan({ repairCents: 0, shippingCents: 2000, protectionCents: 700 }, order),
    ).toThrow('Le montant de la livraison dépasse le montant payé.');
  });

  it('reverseCents and transferCents match the capping/zeroing arithmetic across a grid of paid states and X', () => {
    // Varies stripeTransferId/transferredCents together with X so each cell
    // actually exercises the reversal cap or the transfer remainder, instead
    // of relying on the structural fact that the two branches never both fire.
    const paidStates: Array<{ stripeTransferId: string | null; transferredCents: number | null }> = [
      { stripeTransferId: null, transferredCents: null },
      { stripeTransferId: 'tr_1', transferredCents: 8000 },
      { stripeTransferId: 'tr_1', transferredCents: 2000 },
      { stripeTransferId: 'tr_1', transferredCents: null },
    ];

    for (const paidState of paidStates) {
      const o = { ...order, ...paidState };
      for (let x = 0; x <= 8000; x += 1000) {
        for (const y of [0, 1900]) {
          for (const z of [0, 650]) {
            if (x + y + z === 0) continue;
            const plan = refundPlan({ repairCents: x, shippingCents: y, protectionCents: z }, o);

            expect(plan.reverseCents > 0 && plan.transferCents > 0).toBe(false);

            if (paidState.stripeTransferId !== null && paidState.transferredCents !== null && x > 0) {
              expect(plan.reverseFirst).toBe(true);
              expect(plan.reverseCents).toBe(Math.min(x, paidState.transferredCents));
            } else {
              expect(plan.reverseFirst).toBe(false);
              expect(plan.reverseCents).toBe(0);
            }

            if (paidState.stripeTransferId === null && x < 8000) {
              expect(plan.transferCents).toBe(8000 - x);
              expect(plan.needsPayabilityCheck).toBe(true);
            } else {
              expect(plan.transferCents).toBe(0);
              expect(plan.needsPayabilityCheck).toBe(false);
            }
          }
        }
      }
    }
  });

  it('keeps computeAmounts fixtures consistent with the shared total calculation (X=repair,Y=all,Z=all case)', () => {
    // HOME order: 8900 repair, no shipping/insurance/protection lines beyond what
    // computeAmounts derives. Full refund = the whole total, no transfer, no reversal.
    const homeAmounts = computeAmounts(8900, 'HOME');
    const homeOrder = {
      repairCents: homeAmounts.repairCents,
      shippingCents: homeAmounts.shippingCents,
      insuranceCents: 0,
      protectionCents: homeAmounts.protectionCents,
      stripeTransferId: null,
      transferredCents: null,
    };
    expect(
      refundPlan(
        {
          repairCents: homeAmounts.repairCents,
          shippingCents: homeAmounts.shippingCents,
          protectionCents: homeAmounts.protectionCents,
        },
        homeOrder,
      ),
    ).toEqual({
      refundCents: homeAmounts.totalCents,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });

  it('keeps computeAmounts PARCEL fixture consistent (repair + shipping full refund, réparateur not yet paid)', () => {
    const parcelAmounts = computeAmounts(8000, 'PARCEL');
    const parcelOrder = {
      repairCents: parcelAmounts.repairCents,
      shippingCents: parcelAmounts.shippingCents,
      insuranceCents: 0,
      protectionCents: parcelAmounts.protectionCents,
      stripeTransferId: null,
      transferredCents: null,
    };
    expect(
      refundPlan(
        {
          repairCents: parcelAmounts.repairCents,
          shippingCents: parcelAmounts.shippingCents,
          protectionCents: parcelAmounts.protectionCents,
        },
        parcelOrder,
      ),
    ).toEqual({
      refundCents: parcelAmounts.totalCents,
      reverseFirst: false,
      reverseCents: 0,
      transferCents: 0,
      needsPayabilityCheck: false,
    });
  });
});

describe('shareOwedCents', () => {
  it('REFUNDED, breakdown present, no transfer id: repair minus refunded repair', () => {
    expect(
      shareOwedCents({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: null,
      }),
    ).toBe(5000);
  });

  it('REFUNDED but a transfer id is set: nothing owed (already transferred or reversed)', () => {
    expect(
      shareOwedCents({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: 'tr_1',
      }),
    ).toBe(0);
  });

  it('REFUNDED, legacy null breakdown: nothing owed', () => {
    expect(
      shareOwedCents({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: null,
        stripeTransferId: null,
      }),
    ).toBe(0);
  });

  it('PAID (not refunded): nothing owed', () => {
    expect(
      shareOwedCents({
        status: 'PAID',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: null,
      }),
    ).toBe(0);
  });
});

describe('reversalExpected', () => {
  it('legacy REFUNDED row with a transfer and no reversal: true, unchanged', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: null,
        stripeTransferId: 'tr_1',
        transferredCents: 8000,
        stripeTransferReversalId: null,
      }),
    ).toBe(true);
  });

  it('pre-release partial refund: transferred + refundRepair equals repair, no reversal expected', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: 'tr_1',
        transferredCents: 5000,
        stripeTransferReversalId: null,
      }),
    ).toBe(false);
  });

  it('post-release, X=0: transferred covers the whole repair, no reversal expected', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 0,
        stripeTransferId: 'tr_1',
        transferredCents: 8000,
        stripeTransferReversalId: null,
      }),
    ).toBe(false);
  });

  it('post-release, X=3000, no reversal recorded yet: reversal is expected', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: 'tr_1',
        transferredCents: 8000,
        stripeTransferReversalId: null,
      }),
    ).toBe(true);
  });

  it('reversal id already set: not expected again', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: 'tr_1',
        transferredCents: 8000,
        stripeTransferReversalId: 'trr_1',
      }),
    ).toBe(false);
  });

  it('legacy row (null breakdown), transferredCents null: true - matches today\'s predicate, a row we cannot account for', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: null,
        stripeTransferId: 'tr_1',
        transferredCents: null,
        stripeTransferReversalId: null,
      }),
    ).toBe(true);
  });

  it('legacy row (null breakdown), transferredCents 0: still true - 0 is a recorded amount, but with no breakdown the legacy rule applies', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: null,
        stripeTransferId: 'tr_1',
        transferredCents: 0,
        stripeTransferReversalId: null,
      }),
    ).toBe(true);
  });

  it('breakdown present but transferredCents null: true - a recorded breakdown alone is not enough without a recorded transferred amount', () => {
    expect(
      reversalExpected({
        status: 'REFUNDED',
        repairCents: 8000,
        refundRepairCents: 3000,
        stripeTransferId: 'tr_1',
        transferredCents: null,
        stripeTransferReversalId: null,
      }),
    ).toBe(true);
  });
});

/**
 * CF4-D task 8 (spec §6). `partialRefundOf`: true only for a REFUNDED row refunded
 * strictly less than its total - the four `disputeOpen: isDisputeOpen(...)` facts
 * sites feed this into `ProgressCommande.partialRefund` / `RepairFacts['commande'].partialRefund`.
 */
describe('partialRefundOf', () => {
  it('true for a REFUNDED row refunded strictly less than the total', () => {
    expect(partialRefundOf({ status: 'REFUNDED', refundedCents: 5000, totalCents: 10000 })).toBe(true);
  });

  it('false for a REFUNDED row refunded in full', () => {
    expect(partialRefundOf({ status: 'REFUNDED', refundedCents: 10000, totalCents: 10000 })).toBe(false);
  });

  it('false for a legacy REFUNDED row with no recorded refundedCents', () => {
    expect(partialRefundOf({ status: 'REFUNDED', refundedCents: null, totalCents: 10000 })).toBe(false);
  });

  it('false for a non-REFUNDED status, whatever refundedCents says', () => {
    expect(partialRefundOf({ status: 'PAID', refundedCents: 5000, totalCents: 10000 })).toBe(false);
    expect(partialRefundOf({ status: 'PENDING_PAYMENT', refundedCents: null, totalCents: 10000 })).toBe(false);
    expect(partialRefundOf({ status: 'ABANDONED', refundedCents: null, totalCents: 10000 })).toBe(false);
  });

  it('false when refundedCents somehow exceeds the total (defensive, should not occur)', () => {
    expect(partialRefundOf({ status: 'REFUNDED', refundedCents: 11000, totalCents: 10000 })).toBe(false);
  });
});
