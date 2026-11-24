import { describe, expect, it } from 'vitest';
import { effectiveDisputeStatus } from '../src/admin/dispute-effective-status.js';

const refunded = (refundedCents: number | null) => ({
  status: 'REFUNDED',
  totalCents: 10_636,
  refundedCents,
});

describe('effectiveDisputeStatus (B11)', () => {
  it('shows a dispute closed « Réparation reprise » on a refunded order as refunded', () => {
    expect(
      effectiveDisputeStatus({
        status: 'RESOLVED_DISMISSED',
        verdict: 'DISMISSED',
        commande: refunded(10_636),
      }),
    ).toEqual({ status: 'RESOLVED_REFUNDED', verdict: 'REFUND_CLIENT' });
  });

  it('derives a partial refund verdict from the refunded amount', () => {
    expect(
      effectiveDisputeStatus({
        status: 'RESOLVED_RELEASED',
        verdict: 'RELEASE_REPAIRER',
        commande: refunded(2_100),
      }),
    ).toEqual({ status: 'RESOLVED_REFUNDED', verdict: 'PARTIAL_REFUND' });
  });

  it('treats a missing refunded amount as a full refund', () => {
    expect(
      effectiveDisputeStatus({ status: 'OPEN', verdict: null, commande: refunded(null) }),
    ).toEqual({ status: 'RESOLVED_REFUNDED', verdict: 'REFUND_CLIENT' });
  });

  it('keeps a stored verdict that already agrees with the refund', () => {
    expect(
      effectiveDisputeStatus({
        status: 'IN_REVIEW',
        verdict: 'PARTIAL_REFUND',
        commande: refunded(10_636),
      }),
    ).toEqual({ status: 'RESOLVED_REFUNDED', verdict: 'PARTIAL_REFUND' });
  });

  it('leaves an already refunded dispute untouched', () => {
    expect(
      effectiveDisputeStatus({
        status: 'RESOLVED_REFUNDED',
        verdict: 'REFUND_CLIENT',
        commande: refunded(10_636),
      }),
    ).toEqual({ status: 'RESOLVED_REFUNDED', verdict: 'REFUND_CLIENT' });
  });

  it('leaves a dispute alone when the order is not refunded', () => {
    expect(
      effectiveDisputeStatus({
        status: 'RESOLVED_DISMISSED',
        verdict: 'DISMISSED',
        commande: { status: 'PAID', totalCents: 10_636, refundedCents: null },
      }),
    ).toEqual({ status: 'RESOLVED_DISMISSED', verdict: 'DISMISSED' });
  });

  it('leaves a dispute alone when its order was not loaded', () => {
    expect(
      effectiveDisputeStatus({ status: 'OPEN', verdict: null, commande: null }),
    ).toEqual({ status: 'OPEN', verdict: null });
  });
});
