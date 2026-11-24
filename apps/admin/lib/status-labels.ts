import {
  COMMANDE_STATUS_LABEL,
  STEP_LABEL,
  type CommandeStep,
  type ShipmentLeg,
  type ShipmentStatus,
} from '@revime/shared';
import { DISPUTE_STATUS_LABEL } from './dispute-status-label';

/**
 * French wording for the enum values the sheets used to print as they came out of the database
 * (UI5: « PENDING_PAYMENT, PAID, WORKSHOP, PARCEL… → libellés lisibles »).
 *
 * Every map is a `Record` over the enum's own union, so adding a value to the schema fails the
 * typecheck here instead of leaking the raw name to an operator. The helpers still take a plain
 * `string`: the payloads they read come from the API as strings, and a value from a newer API than
 * this build must read as itself, not as « undefined ».
 */

const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: 'En attente',
  ORDERED: 'Commandée',
  LABEL_READY: 'Étiquette prête',
  IN_TRANSIT: 'En transit',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
};

const SHIPMENT_LEG_LABEL: Record<ShipmentLeg, string> = {
  OUTBOUND: 'Aller',
  RETURN: 'Retour',
};

const DELIVERY_MODE_LABEL: Record<'HOME' | 'WORKSHOP' | 'PARCEL', string> = {
  HOME: 'À domicile',
  WORKSHOP: 'Atelier',
  PARCEL: 'Colis',
};

const CANCELLATION_STATUS_LABEL: Record<
  'PENDING' | 'APPROVED' | 'REFUSED' | 'WITHDRAWN' | 'SUPERSEDED',
  string
> = {
  PENDING: 'en attente',
  APPROVED: 'acceptée',
  REFUSED: 'refusée',
  WITHDRAWN: 'retirée',
  SUPERSEDED: 'remplacée',
};

const DISPUTE_INITIATOR_LABEL: Record<'CLIENT' | 'REPAIRER' | 'ADMIN' | 'STRIPE', string> = {
  CLIENT: 'Client',
  REPAIRER: 'Réparateur',
  ADMIN: 'Administrateur',
  STRIPE: 'Stripe',
};

const REQUESTER_ROLE_LABEL: Record<'CLIENT' | 'REPAIRER' | 'ADMIN', string> = {
  CLIENT: 'le client',
  REPAIRER: 'le réparateur',
  ADMIN: "l'équipe Revime",
};

function labelOf(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export const commandeStatusLabel = (status: string): string => labelOf(COMMANDE_STATUS_LABEL, status);
export const commandeStepLabel = (step: CommandeStep | string): string => labelOf(STEP_LABEL, step);
export const shipmentStatusLabel = (status: string): string => labelOf(SHIPMENT_STATUS_LABEL, status);
export const shipmentLegLabel = (leg: string): string => labelOf(SHIPMENT_LEG_LABEL, leg);
export const deliveryModeLabel = (delivery: string): string => labelOf(DELIVERY_MODE_LABEL, delivery);
export const cancellationStatusLabel = (status: string): string => labelOf(CANCELLATION_STATUS_LABEL, status);
export const disputeInitiatorLabel = (initiator: string): string => labelOf(DISPUTE_INITIATOR_LABEL, initiator);
export const requesterRoleLabel = (role: string): string => labelOf(REQUESTER_ROLE_LABEL, role);

/** A dispute listed with its stored status only (no order to derive it from): the queue's own wording. */
export const storedDisputeStatusLabel = (status: string): string => labelOf(DISPUTE_STATUS_LABEL, status);
