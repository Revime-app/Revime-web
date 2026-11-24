import { describe, expect, it } from 'vitest';
import {
  adminRefundListQuerySchema,
  adminShipmentListQuerySchema,
  adminVerificationListQuerySchema,
  businessRowStatus,
  identityRowStatus,
  refundListStatus,
  SHIPMENT_DISPLAY_STATUS_LABEL,
  shipmentDisplayStatus,
  VERIFICATION_ROW_STATUS_LABEL,
  REFUND_LIST_STATUS_LABEL,
} from '@revime/shared';

// CF4-F Task 1 (spec §3 table). Every row, both legs, incl. the "only the newest
// event counts" rule and CANCELLED winning over everything.
describe('shipmentDisplayStatus', () => {
  it('CANCELLED wins over everything, both legs', () => {
    expect(
      shipmentDisplayStatus({
        status: 'CANCELLED',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'DELIVERED',
      }),
    ).toBe('CANCELLED');
    expect(
      shipmentDisplayStatus({
        status: 'CANCELLED',
        leg: 'RETURN',
        labelDownloadedAt: new Date(),
        newestEventStatus: 'EXCEPTION',
      }),
    ).toBe('CANCELLED');
  });

  it('FAILED status -> INCIDENT', () => {
    expect(
      shipmentDisplayStatus({
        status: 'FAILED',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: null,
      }),
    ).toBe('INCIDENT');
  });

  it('newest event EXCEPTION / RETURNED / FAILED_ATTEMPT -> INCIDENT even if status is IN_TRANSIT', () => {
    for (const newestEventStatus of ['EXCEPTION', 'RETURNED', 'FAILED_ATTEMPT']) {
      expect(
        shipmentDisplayStatus({
          status: 'IN_TRANSIT',
          leg: 'OUTBOUND',
          labelDownloadedAt: null,
          newestEventStatus,
        }),
      ).toBe('INCIDENT');
    }
  });

  it('only the NEWEST event counts: an earlier EXCEPTION does not cause INCIDENT once the newest is IN_TRANSIT', () => {
    expect(
      shipmentDisplayStatus({
        status: 'IN_TRANSIT',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'IN_TRANSIT',
      }),
    ).toBe('IN_TRANSIT');
  });

  it('DELIVERED -> DELIVERED on OUTBOUND, RETURN_DELIVERED on RETURN', () => {
    expect(
      shipmentDisplayStatus({
        status: 'DELIVERED',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'DELIVERED',
      }),
    ).toBe('DELIVERED');
    expect(
      shipmentDisplayStatus({
        status: 'DELIVERED',
        leg: 'RETURN',
        labelDownloadedAt: null,
        newestEventStatus: 'DELIVERED',
      }),
    ).toBe('RETURN_DELIVERED');
  });

  it('IN_TRANSIT on RETURN leg -> RETURN_IN_TRANSIT regardless of the newest event', () => {
    expect(
      shipmentDisplayStatus({
        status: 'IN_TRANSIT',
        leg: 'RETURN',
        labelDownloadedAt: null,
        newestEventStatus: 'REACHED_DELIVERY_PICKUP_POINT',
      }),
    ).toBe('RETURN_IN_TRANSIT');
  });

  it('IN_TRANSIT on OUTBOUND with newest REACHED_DELIVERY_PICKUP_POINT -> AT_PICKUP_POINT', () => {
    expect(
      shipmentDisplayStatus({
        status: 'IN_TRANSIT',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'REACHED_DELIVERY_PICKUP_POINT',
      }),
    ).toBe('AT_PICKUP_POINT');
  });

  it('IN_TRANSIT on OUTBOUND with newest SHIPPED -> HANDED_OVER', () => {
    expect(
      shipmentDisplayStatus({
        status: 'IN_TRANSIT',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'SHIPPED',
      }),
    ).toBe('HANDED_OVER');
  });

  it('IN_TRANSIT on OUTBOUND with newest OUT_FOR_DELIVERY (otherwise case) -> IN_TRANSIT', () => {
    expect(
      shipmentDisplayStatus({
        status: 'IN_TRANSIT',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: 'OUT_FOR_DELIVERY',
      }),
    ).toBe('IN_TRANSIT');
  });

  it('LABEL_READY with labelDownloadedAt -> DOWNLOADED', () => {
    expect(
      shipmentDisplayStatus({
        status: 'LABEL_READY',
        leg: 'OUTBOUND',
        labelDownloadedAt: new Date('2026-09-01T00:00:00.000Z'),
        newestEventStatus: null,
      }),
    ).toBe('DOWNLOADED');
    // Also accepts an ISO string, not only a Date.
    expect(
      shipmentDisplayStatus({
        status: 'LABEL_READY',
        leg: 'RETURN',
        labelDownloadedAt: '2026-09-01T00:00:00.000Z',
        newestEventStatus: null,
      }),
    ).toBe('DOWNLOADED');
  });

  it('LABEL_READY without labelDownloadedAt -> CREATED', () => {
    expect(
      shipmentDisplayStatus({
        status: 'LABEL_READY',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: null,
      }),
    ).toBe('CREATED');
  });

  it('PENDING / ORDERED -> TO_CREATE', () => {
    expect(
      shipmentDisplayStatus({
        status: 'PENDING',
        leg: 'OUTBOUND',
        labelDownloadedAt: null,
        newestEventStatus: null,
      }),
    ).toBe('TO_CREATE');
    expect(
      shipmentDisplayStatus({
        status: 'ORDERED',
        leg: 'RETURN',
        labelDownloadedAt: null,
        newestEventStatus: null,
      }),
    ).toBe('TO_CREATE');
  });

  it('exposes exactly 11 French labels, in the order of the spec table', () => {
    expect(SHIPMENT_DISPLAY_STATUS_LABEL).toEqual({
      TO_CREATE: 'Étiquette à créer',
      CREATED: 'Étiquette créée',
      DOWNLOADED: 'Étiquette téléchargée',
      HANDED_OVER: 'Remise au transporteur',
      IN_TRANSIT: 'En transit',
      AT_PICKUP_POINT: 'Arrivée en point relais',
      DELIVERED: 'Livrée',
      RETURN_IN_TRANSIT: 'Retour en cours',
      RETURN_DELIVERED: 'Retour livré',
      CANCELLED: 'Annulée',
      INCIDENT: 'Incident',
    });
    expect(Object.keys(SHIPMENT_DISPLAY_STATUS_LABEL)).toHaveLength(11);
  });
});

describe('refundListStatus', () => {
  it('PAID (with a live refund reference) -> INCOMPLETE, even with a share owed', () => {
    expect(
      refundListStatus({ status: 'PAID', shareOwedCents: 500, partialRefund: false }),
    ).toBe('INCOMPLETE');
  });

  it('REFUNDED with shareOwedCents > 0 -> SHARE_OWED', () => {
    expect(
      refundListStatus({ status: 'REFUNDED', shareOwedCents: 500, partialRefund: false }),
    ).toBe('SHARE_OWED');
  });

  it('REFUNDED, no share owed, partialRefund -> PARTIAL', () => {
    expect(
      refundListStatus({ status: 'REFUNDED', shareOwedCents: 0, partialRefund: true }),
    ).toBe('PARTIAL');
  });

  it('REFUNDED, no share owed, not partial -> FULL', () => {
    expect(
      refundListStatus({ status: 'REFUNDED', shareOwedCents: 0, partialRefund: false }),
    ).toBe('FULL');
  });

  it('exposes exactly 4 French labels', () => {
    expect(REFUND_LIST_STATUS_LABEL).toEqual({
      INCOMPLETE: 'Incomplet',
      SHARE_OWED: 'Part réparateur due',
      PARTIAL: 'Remboursé partiellement',
      FULL: 'Remboursé',
    });
    expect(Object.keys(REFUND_LIST_STATUS_LABEL)).toHaveLength(4);
  });
});

describe('identityRowStatus', () => {
  it('verifiedAt set -> VERIFIED, even over a stale REQUIRES_INPUT status', () => {
    expect(
      identityRowStatus({
        status: 'REQUIRES_INPUT',
        verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastErrorCode: 'invalid_document',
      }),
    ).toBe('VERIFIED');
  });

  it('REQUIRES_INPUT with an error code, no verifiedAt -> DOCUMENTS_REQUIRED', () => {
    expect(
      identityRowStatus({ status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'invalid_document' }),
    ).toBe('DOCUMENTS_REQUIRED');
  });

  it('PROCESSING -> PROCESSING', () => {
    expect(
      identityRowStatus({ status: 'PROCESSING', verifiedAt: null, lastErrorCode: null }),
    ).toBe('PROCESSING');
  });

  it('REQUIRES_INPUT, no error code, no verifiedAt -> NOT_STARTED', () => {
    expect(
      identityRowStatus({ status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: null }),
    ).toBe('NOT_STARTED');
  });

  it('CANCELED -> CANCELED', () => {
    expect(
      identityRowStatus({ status: 'CANCELED', verifiedAt: null, lastErrorCode: null }),
    ).toBe('CANCELED');
  });

  // Ruling R7: identityRowStatus is exhaustive over IdentityStatus (switch +
  // `never` check). VERIFIED with no verifiedAt stamp now reads VERIFIED - Stripe
  // reports the session verified, and identity.service.ts stamps `verifiedAt` in
  // the same sync, so a missing stamp is a timing gap, not a cancellation. This
  // pins that so a future refactor cannot silently regress it to CANCELED.
  it('VERIFIED status without a verifiedAt stamp reads VERIFIED (timing gap, not a cancellation)', () => {
    expect(
      identityRowStatus({ status: 'VERIFIED', verifiedAt: null, lastErrorCode: null }),
    ).toBe('VERIFIED');
  });

  // CF4-39 (sub-project M): the operator's decision is read FIRST.
  it.each([
    ['REFUSED', 'ADMIN_REFUSED'],
    ['DOCUMENTS_REQUESTED', 'ADMIN_DOCUMENTS_REQUESTED'],
    ['ACCEPTED', 'ADMIN_ACCEPTED'],
  ] as const)('decision %s -> %s, over any Stripe state', (decision, expected) => {
    expect(
      identityRowStatus({ status: 'VERIFIED', verifiedAt: new Date(), lastErrorCode: null, decision }),
    ).toBe(expected);
    expect(
      identityRowStatus({ status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'x', decision }),
    ).toBe(expected);
  });

  it('decision null keeps the Stripe rules', () => {
    expect(
      identityRowStatus({ status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'x', decision: null }),
    ).toBe('DOCUMENTS_REQUIRED');
  });

  it('labels the three decision statuses', () => {
    expect(VERIFICATION_ROW_STATUS_LABEL.ADMIN_REFUSED).toBe('Refusée par REVIME');
    expect(VERIFICATION_ROW_STATUS_LABEL.ADMIN_DOCUMENTS_REQUESTED).toBe('Nouveaux documents demandés');
    expect(VERIFICATION_ROW_STATUS_LABEL.ADMIN_ACCEPTED).toBe('Acceptée manuellement');
  });
});

describe('businessRowStatus', () => {
  it('maps VERIFIED / REJECTED / FAILED to the row status vocabulary', () => {
    expect(businessRowStatus('VERIFIED')).toBe('VERIFIED');
    expect(businessRowStatus('REJECTED')).toBe('REJECTED');
    expect(businessRowStatus('FAILED')).toBe('FAILED');
  });
});

describe('VERIFICATION_ROW_STATUS_LABEL', () => {
  it('exposes exactly 10 French labels', () => {
    expect(VERIFICATION_ROW_STATUS_LABEL).toEqual({
      VERIFIED: 'Vérifiée',
      DOCUMENTS_REQUIRED: 'Documents à refaire',
      PROCESSING: 'En cours',
      NOT_STARTED: 'Non commencée',
      CANCELED: 'Annulée',
      REJECTED: 'Refusée',
      FAILED: 'Échec technique',
      // CF4-39 (sub-project M).
      ADMIN_REFUSED: 'Refusée par REVIME',
      ADMIN_DOCUMENTS_REQUESTED: 'Nouveaux documents demandés',
      ADMIN_ACCEPTED: 'Acceptée manuellement',
    });
    expect(Object.keys(VERIFICATION_ROW_STATUS_LABEL)).toHaveLength(10);
  });
});

describe('adminShipmentListQuerySchema', () => {
  it('defaults page 1, pageSize 25', () => {
    const parsed = adminShipmentListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('coerces page/pageSize from strings', () => {
    const parsed = adminShipmentListQuerySchema.parse({ page: '3', pageSize: '10' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(10);
  });

  it('trims optional strings and treats empty string as undefined', () => {
    const parsed = adminShipmentListQuerySchema.parse({ client: '  bob  ', carrier: '' });
    expect(parsed.client).toBe('bob');
    expect(parsed.carrier).toBeUndefined();
  });

  it('rejects an unknown status', () => {
    expect(() => adminShipmentListQuerySchema.parse({ status: 'NOT_A_STATUS' })).toThrow();
  });

  it('rejects a garbage ISO date', () => {
    expect(() => adminShipmentListQuerySchema.parse({ from: 'not-a-date' })).toThrow();
  });

  it('accepts a valid ISO date for from/to', () => {
    const parsed = adminShipmentListQuerySchema.parse({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(parsed.from).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.to).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('adminRefundListQuerySchema', () => {
  it('defaults page 1, pageSize 25', () => {
    const parsed = adminRefundListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('rejects an unknown status', () => {
    expect(() => adminRefundListQuerySchema.parse({ status: 'NOT_A_STATUS' })).toThrow();
  });

  it('coerces minCents/maxCents to non-negative ints', () => {
    const parsed = adminRefundListQuerySchema.parse({ minCents: '100', maxCents: '5000' });
    expect(parsed.minCents).toBe(100);
    expect(parsed.maxCents).toBe(5000);
  });

  it('rejects a negative minCents', () => {
    expect(() => adminRefundListQuerySchema.parse({ minCents: '-1' })).toThrow();
  });

  it('trims optional q and treats empty string as undefined', () => {
    const parsed = adminRefundListQuerySchema.parse({ q: '  order-123  ' });
    expect(parsed.q).toBe('order-123');
    const parsedEmpty = adminRefundListQuerySchema.parse({ q: '' });
    expect(parsedEmpty.q).toBeUndefined();
  });
});

describe('adminVerificationListQuerySchema', () => {
  it('defaults page 1, pageSize 25, needsAction "true"', () => {
    const parsed = adminVerificationListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.needsAction).toBe('true');
  });

  it('rejects an unknown status', () => {
    expect(() => adminVerificationListQuerySchema.parse({ status: 'NOT_A_STATUS' })).toThrow();
  });

  it('accepts the real réparateur kind enum members as accountKind', () => {
    expect(adminVerificationListQuerySchema.parse({ accountKind: 'INDIVIDUAL' }).accountKind).toBe('INDIVIDUAL');
    expect(adminVerificationListQuerySchema.parse({ accountKind: 'PRO' }).accountKind).toBe('PRO');
  });

  it('rejects an unknown accountKind', () => {
    expect(() => adminVerificationListQuerySchema.parse({ accountKind: 'BUSINESS' })).toThrow();
  });
});
