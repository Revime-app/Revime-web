import { describe, expect, it } from 'vitest';
import { repairStatus } from '@revime/shared';

/**
 * A unit test over the SHAPE the service must produce, not an HTTP test - the
 * integration suite writes to the production database and must never be run.
 * `pickCommande` is the pure helper the service uses, so it is testable here.
 */
import { pickCommande } from '../src/demandes/pick-commande.js';

describe('pickCommande', () => {
  it('is null when a demande has no commande', () => {
    expect(pickCommande([])).toBeNull();
  });

  it('returns the single live commande, widened with commandeId/delivery/disputeOpen/partialRefund/cancellationPending', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'PAID',
          step: 'PAID',
          delivery: 'HOME',
          disputeOpen: false,
          createdAt: new Date(1),
          refundedCents: null,
          totalCents: 10000,
          cancellationRequestedAt: null,
        },
      ]),
    ).toEqual({
      status: 'PAID',
      step: 'PAID',
      commandeId: 'c1',
      delivery: 'HOME',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('carries disputeOpen: true through unchanged', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'PAID',
          step: 'REPAIR_STARTED',
          delivery: 'PARCEL',
          disputeOpen: true,
          createdAt: new Date(1),
          refundedCents: null,
          totalCents: 10000,
          cancellationRequestedAt: null,
        },
      ]),
    ).toEqual({
      status: 'PAID',
      step: 'REPAIR_STARTED',
      commandeId: 'c1',
      delivery: 'PARCEL',
      disputeOpen: true,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('sets cancellationPending: true when cancellationRequestedAt is set', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'PAID',
          step: 'REPAIR_STARTED',
          delivery: 'PARCEL',
          disputeOpen: false,
          createdAt: new Date(1),
          refundedCents: null,
          totalCents: 10000,
          cancellationRequestedAt: new Date(2),
        },
      ]),
    ).toEqual({
      status: 'PAID',
      step: 'REPAIR_STARTED',
      commandeId: 'c1',
      delivery: 'PARCEL',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: true,
    });
  });

  it('sets partialRefund: true for a REFUNDED row refunded strictly less than the total', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'REFUNDED',
          step: 'REPAIR_STARTED',
          delivery: 'PARCEL',
          disputeOpen: false,
          createdAt: new Date(1),
          refundedCents: 5000,
          totalCents: 10000,
          cancellationRequestedAt: null,
        },
      ]),
    ).toEqual({
      status: 'REFUNDED',
      step: 'REPAIR_STARTED',
      commandeId: 'c1',
      delivery: 'PARCEL',
      disputeOpen: false,
      partialRefund: true,
      cancellationPending: false,
    });
  });

  it('sets partialRefund: false for a REFUNDED row refunded in full', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'REFUNDED',
          step: 'REPAIR_STARTED',
          delivery: 'PARCEL',
          disputeOpen: false,
          createdAt: new Date(1),
          refundedCents: 10000,
          totalCents: 10000,
          cancellationRequestedAt: null,
        },
      ]),
    ).toEqual({
      status: 'REFUNDED',
      step: 'REPAIR_STARTED',
      commandeId: 'c1',
      delivery: 'PARCEL',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('sets partialRefund: false for a legacy REFUNDED row with no recorded refundedCents', () => {
    expect(
      pickCommande([
        {
          id: 'c1',
          status: 'REFUNDED',
          step: 'REPAIR_STARTED',
          delivery: 'PARCEL',
          disputeOpen: false,
          createdAt: new Date(1),
          refundedCents: null,
          totalCents: 10000,
          cancellationRequestedAt: null,
        },
      ]),
    ).toEqual({
      status: 'REFUNDED',
      step: 'REPAIR_STARTED',
      commandeId: 'c1',
      delivery: 'PARCEL',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('prefers a non-ABANDONED commande over an abandoned one', () => {
    const rows = [
      {
        id: 'c1',
        status: 'ABANDONED' as const,
        step: null,
        delivery: 'HOME' as const,
        disputeOpen: false,
        createdAt: new Date(1),
        refundedCents: null,
        totalCents: 10000,
        cancellationRequestedAt: null,
      },
      {
        id: 'c2',
        status: 'PAID' as const,
        step: 'PAID' as const,
        delivery: 'HOME' as const,
        disputeOpen: false,
        createdAt: new Date(2),
        refundedCents: null,
        totalCents: 10000,
        cancellationRequestedAt: null,
      },
    ];
    expect(pickCommande(rows)).toEqual({
      status: 'PAID',
      step: 'PAID',
      commandeId: 'c2',
      delivery: 'HOME',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('returns the NEWEST abandoned one when every attempt was abandoned - ABANDONED rule unchanged', () => {
    const rows = [
      {
        id: 'c1',
        status: 'ABANDONED' as const,
        step: null,
        delivery: 'HOME' as const,
        disputeOpen: false,
        createdAt: new Date(1),
        refundedCents: null,
        totalCents: 10000,
        cancellationRequestedAt: null,
      },
      {
        id: 'c2',
        status: 'ABANDONED' as const,
        step: null,
        delivery: 'WORKSHOP' as const,
        disputeOpen: false,
        createdAt: new Date(2),
        refundedCents: null,
        totalCents: 10000,
        cancellationRequestedAt: null,
      },
    ];
    expect(pickCommande(rows)).toEqual({
      status: 'ABANDONED',
      step: null,
      commandeId: 'c2',
      delivery: 'WORKSHOP',
      disputeOpen: false,
      partialRefund: false,
      cancellationPending: false,
    });
  });

  it('feeds repairStatus to client index 0 for an all-abandoned demande', () => {
    const c = pickCommande([
      {
        id: 'c1',
        status: 'ABANDONED',
        step: null,
        delivery: 'HOME',
        disputeOpen: false,
        createdAt: new Date(1),
        refundedCents: null,
        totalCents: 10000,
        cancellationRequestedAt: null,
      },
    ]);
    expect(repairStatus({ demandeStatus: 'OPEN', offerCount: 0, commande: c }, 'CLIENT')).toMatchObject({
      currentIndex: 0,
    });
  });
});

/**
 * V8 B2, `Q8-08`. A held payout (RELEASED, no transfer) reads « Terminée » for the client, so the
 * ladder needs `hasStripeTransfer`. It says something about the RÉPARATEUR's payout setup, and
 * `DemandeDto.commande` reaches réparateurs who are not party to the order, so it is sent only when
 * the caller asks for it: the author's own list and the author's own detail.
 */
describe('pickCommande, hasStripeTransfer (V8 Q8-08)', () => {
  const row = (stripeTransferId: string | null) => ({
    id: 'c1',
    status: 'PAID' as const,
    step: 'RELEASED' as const,
    delivery: 'HOME' as const,
    disputeOpen: false,
    createdAt: new Date(1),
    refundedCents: null,
    totalCents: 10000,
    cancellationRequestedAt: null,
    stripeTransferId,
  });

  it('is sent to the author: false while Revime holds the payout, true once it left', () => {
    expect(pickCommande([row(null)], { withTransfer: true })).toMatchObject({ hasStripeTransfer: false });
    expect(pickCommande([row('tr_1')], { withTransfer: true })).toMatchObject({ hasStripeTransfer: true });
  });

  it('is absent for anyone else, so no other réparateur learns about this one’s payouts', () => {
    expect(pickCommande([row(null)])).not.toHaveProperty('hasStripeTransfer');
    expect(pickCommande([row(null)], { withTransfer: false })).not.toHaveProperty('hasStripeTransfer');
  });

  it('reads « Terminée » for the client through repairStatus when held', () => {
    const c = pickCommande([row(null)], { withTransfer: true });
    expect(repairStatus({ demandeStatus: 'IN_PROGRESS', offerCount: 1, commande: c }, 'CLIENT').label).toBe('Terminée');
  });
});
