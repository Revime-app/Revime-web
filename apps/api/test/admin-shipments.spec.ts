import { describe, expect, it } from 'vitest';
import { ATTENTION_REASON_LABEL } from '@revime/shared';
import { shipmentAttentionItems } from '../src/cron/shipment-attention.js';

describe('shipment attention rows', () => {
  it('a FAILED leg and a leg whose newest event is EXCEPTION or RETURNED each yield one row', () => {
    const rows = shipmentAttentionItems([
      { commandeId: 'c1', demandeTitle: 'Écran cassé', status: 'PAID', step: 'PAID', totalCents: 12_000, updatedAt: new Date('2026-09-05T08:00:00Z'), shipments: [
        { leg: 'OUTBOUND', status: 'FAILED', updatedAt: new Date('2026-09-05T09:00:00Z'), events: [] },
        { leg: 'RETURN', status: 'PENDING', updatedAt: new Date(), events: [] },
      ] },
      { commandeId: 'c2', demandeTitle: 'Batterie', status: 'PAID', step: 'PARCEL_SENT', totalCents: 9_000, updatedAt: new Date(), shipments: [
        { leg: 'OUTBOUND', status: 'IN_TRANSIT', updatedAt: new Date(), events: [{ status: 'EXCEPTION', occurredAt: new Date('2026-09-06T10:00:00Z') }, { status: 'SHIPPED', occurredAt: new Date('2026-09-05T10:00:00Z') }] },
      ] },
      { commandeId: 'c3', demandeTitle: 'ok', status: 'PAID', step: 'PARCEL_SENT', totalCents: 1, updatedAt: new Date(), shipments: [
        { leg: 'OUTBOUND', status: 'IN_TRANSIT', updatedAt: new Date(), events: [{ status: 'SHIPPED', occurredAt: new Date() }] },
      ] },
    ]);
    expect(rows.map((r) => [r.commandeId, r.reason])).toEqual([
      ['c1', 'PARCEL_INCIDENT'],
      ['c2', 'PARCEL_INCIDENT'],
      ['c2', 'PARCEL_BLOCKED'],
    ]);
    expect(rows[0]!.since).toBe('2026-09-05T09:00:00.000Z');
    expect(rows[1]!.since).toBe('2026-09-06T10:00:00.000Z');
  });

  it('a RETURNED newest event is an exception row too, and an older EXCEPTION superseded by a scan is not', () => {
    const rows = shipmentAttentionItems([
      { commandeId: 'c4', demandeTitle: 'Retourné', status: 'PAID', step: 'PARCEL_SENT', totalCents: 1, updatedAt: new Date(), shipments: [
        { leg: 'RETURN', status: 'IN_TRANSIT', updatedAt: new Date(), events: [{ status: 'RETURNED', occurredAt: new Date('2026-09-07T10:00:00Z') }] },
      ] },
      { commandeId: 'c5', demandeTitle: 'Reparti', status: 'PAID', step: 'PARCEL_SENT', totalCents: 1, updatedAt: new Date(), shipments: [
        { leg: 'OUTBOUND', status: 'IN_TRANSIT', updatedAt: new Date(), events: [{ status: 'EXCEPTION', occurredAt: new Date('2026-09-05T10:00:00Z') }, { status: 'IN_TRANSIT', occurredAt: new Date('2026-09-06T10:00:00Z') }] },
      ] },
    ]);
    expect(rows.map((r) => [r.commandeId, r.reason])).toEqual([
      ['c4', 'PARCEL_INCIDENT'],
      ['c4', 'PARCEL_BLOCKED'],
      ['c5', 'PARCEL_BLOCKED'],
    ]);
  });

  it('both reasons have French labels for the digest and the table', () => {
    expect(ATTENTION_REASON_LABEL.SHIPMENT_FAILED).toBe('Étiquette Boxtal en échec');
    expect(ATTENTION_REASON_LABEL.SHIPMENT_EXCEPTION).toBe('Incident transporteur');
  });
});
