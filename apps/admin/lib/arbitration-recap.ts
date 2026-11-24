export type RecapMode = 'RELEASE' | 'REFUND' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'DISMISS';

export type RecapRefundBody = { repairCents: number; shippingCents: number; protectionCents: number };

export type ArbitrationRecap = {
  clientRefundCents: number;
  repairerPayoutCents: number;
  /** What Revime keeps of the order: whatever is neither refunded nor paid to the réparateur. */
  retainedCents: number;
};

/**
 * The amounts the operator confirms before arbitrating (P18), by the rules the API applies:
 * a release pays the réparateur the repair share only, a refund gives the client exactly the
 * breakdown chosen (`refund-plan.ts`: repair + livraison + protection), and a dismissal moves
 * nothing. The remainder is whatever stays with Revime, so the three figures always add up to
 * the order total. Protection that goes back to the client is a refund, never a fee.
 */
export function arbitrationRecap(input: {
  mode: RecapMode;
  totalCents: number;
  repairCents: number;
  refundBody: RecapRefundBody | null;
}): ArbitrationRecap {
  const { mode, totalCents, repairCents, refundBody } = input;
  if (mode === 'DISMISS') {
    return { clientRefundCents: 0, repairerPayoutCents: 0, retainedCents: 0 };
  }
  let clientRefundCents = 0;
  let repairerPayoutCents = 0;
  if (mode === 'RELEASE') {
    repairerPayoutCents = repairCents;
  } else if (refundBody) {
    clientRefundCents = refundBody.repairCents + refundBody.shippingCents + refundBody.protectionCents;
    repairerPayoutCents = Math.max(0, repairCents - refundBody.repairCents);
  } else {
    // No breakdown chosen yet: a full refund of the order.
    clientRefundCents = totalCents || repairCents;
  }
  return {
    clientRefundCents,
    repairerPayoutCents,
    retainedCents: Math.max(0, totalCents - clientRefundCents - repairerPayoutCents),
  };
}
