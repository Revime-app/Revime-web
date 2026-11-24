import { describe, expect, it } from 'vitest';
import { arbitrationRecap } from '../lib/arbitration-recap';

// Order: repair 100 €, livraison 10 €, protection 5 €, total 115 €.
const order = { totalCents: 11500, repairCents: 10000 };

describe('RU-22 · P18 arbitration recap', () => {
  it('a release pays the repair share and Revime keeps the rest', () => {
    expect(arbitrationRecap({ mode: 'RELEASE', ...order, refundBody: null })).toEqual({
      clientRefundCents: 0,
      repairerPayoutCents: 10000,
      retainedCents: 1500,
    });
  });

  it('a partial refund counts the protection given back as a refund, not as a fee', () => {
    const r = arbitrationRecap({
      mode: 'REFUND',
      ...order,
      refundBody: { repairCents: 4000, shippingCents: 0, protectionCents: 500 },
    });
    expect(r).toEqual({ clientRefundCents: 4500, repairerPayoutCents: 6000, retainedCents: 1000 });
    expect(r.clientRefundCents + r.repairerPayoutCents + r.retainedCents).toBe(order.totalCents);
  });

  it('a full refund with the whole breakdown leaves nothing to anyone else', () => {
    expect(
      arbitrationRecap({
        mode: 'REFUND_FULL',
        ...order,
        refundBody: { repairCents: 10000, shippingCents: 1000, protectionCents: 500 },
      }),
    ).toEqual({ clientRefundCents: 11500, repairerPayoutCents: 0, retainedCents: 0 });
  });

  it('a full refund before a breakdown is chosen refunds the whole order', () => {
    expect(arbitrationRecap({ mode: 'REFUND_FULL', ...order, refundBody: null })).toEqual({
      clientRefundCents: 11500,
      repairerPayoutCents: 0,
      retainedCents: 0,
    });
  });

  it('a dismissal moves nothing', () => {
    expect(arbitrationRecap({ mode: 'DISMISS', ...order, refundBody: null })).toEqual({
      clientRefundCents: 0,
      repairerPayoutCents: 0,
      retainedCents: 0,
    });
  });
});
