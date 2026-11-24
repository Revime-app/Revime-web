import type { AdminAttentionItem, CommandeStatus, CommandeStep } from '@revime/shared';

/** Spec §7.8: a parcel that has not moved for this long is blocked. /colis and /attention both read it. */
export const PARCEL_STALL_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Legs that are not over: FAILED is its own incident, DELIVERED and CANCELLED are done. */
export const PARCEL_STALLABLE_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'ORDERED', 'LABEL_READY', 'IN_TRANSIT']);

/** Carrier events that need a human: the carrier's problem, not a quiet parcel. */
export const PARCEL_INCIDENT_EVENTS: ReadonlySet<string> = new Set(['EXCEPTION', 'RETURNED', 'FAILED_ATTEMPT']);

type Input = {
  commandeId: string;
  demandeTitle: string;
  clientName?: string;
  repairerName?: string;
  status: CommandeStatus;
  step: CommandeStep | null;
  totalCents: number;
  updatedAt: Date;
  shipments: {
    leg: string;
    status: string;
    updatedAt: Date;
    events: { status: string; occurredAt: Date }[];
  }[];
};

/**
 * Pure, like `refundPlan`: which commandes have a leg an operator must look at (spec §7.8, P15/P16).
 * A FAILED leg is Boxtal's refusal, retried from /colis; a newest carrier event of EXCEPTION or
 * RETURNED is the carrier's problem (PARCEL_INCIDENT).
 * A leg that is not over (PENDING, ORDERED, LABEL_READY or IN_TRANSIT) with no movement for 3 days is
 * PARCEL_BLOCKED, the same rule /colis flags (one constant, `PARCEL_STALL_AFTER_MS`).
 */
export function shipmentAttentionItems(rows: Input[]): AdminAttentionItem[] {
  const out: AdminAttentionItem[] = [];
  const stalledBefore = Date.now() - PARCEL_STALL_AFTER_MS;

  for (const r of rows) {
    for (const s of r.shipments) {
      const newest = [...(s.events ?? [])].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )[0];

      if (s.status === 'FAILED') {
        out.push({
          commandeId: r.commandeId,
          demandeTitle: r.demandeTitle,
          clientName: r.clientName,
          repairerName: r.repairerName,
          reasons: ['PARCEL_INCIDENT'],
          reason: 'PARCEL_INCIDENT',
          status: r.status,
          step: r.step,
          totalCents: r.totalCents,
          since: new Date(s.updatedAt).toISOString(),
        });
      } else if (newest && PARCEL_INCIDENT_EVENTS.has(newest.status)) {
        out.push({
          commandeId: r.commandeId,
          demandeTitle: r.demandeTitle,
          clientName: r.clientName,
          repairerName: r.repairerName,
          reasons: ['PARCEL_INCIDENT'],
          reason: 'PARCEL_INCIDENT',
          status: r.status,
          step: r.step,
          totalCents: r.totalCents,
          since: new Date(newest.occurredAt).toISOString(),
        });
      }

      // Blocked parcel: no tracking movement for PARCEL_STALL_AFTER_MS
      const lastActivity = newest?.occurredAt ? new Date(newest.occurredAt) : new Date(s.updatedAt);
      if (PARCEL_STALLABLE_STATUSES.has(s.status) && lastActivity.getTime() <= stalledBefore) {
        out.push({
          commandeId: r.commandeId,
          demandeTitle: r.demandeTitle,
          clientName: r.clientName,
          repairerName: r.repairerName,
          reasons: ['PARCEL_BLOCKED'],
          reason: 'PARCEL_BLOCKED',
          status: r.status,
          step: r.step,
          totalCents: r.totalCents,
          since: lastActivity.toISOString(),
        });
      }
    }
  }
  return out;
}
