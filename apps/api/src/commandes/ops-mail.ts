import { euros } from '@revime/shared';
import { mailSender, type Mail } from '../mail/mail.service.js';

export type ParcelOpsParty = {
  name: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  phone: string;
};

export type ParcelOpsInput = {
  commandeId: string;
  demandeTitle: string;
  client: ParcelOpsParty;
  repairer: ParcelOpsParty;
};

/**
 * The ONLY email P4 adds, and it goes to Revime rather than to a user.
 *
 * 🛑 CORRECTED 2026-09-04 (Livraison Boxtal): there IS a carrier API now. Under
 * `SHIPPING_DRIVER=boxtal` the server orders the labels itself and this mail is NOT sent;
 * `sendShippingOpsMail` below mails ops only when that path FAILS. Under the `manual` driver
 * the paragraph that follows still describes what happens.
 *
 * Under the manual driver there is no carrier API in play, so the operator
 * buys the two labels by hand and forwards the carrier's own email. This message
 * is what tells him there is work and gives him everything he needs to do it
 * without opening the database.
 *
 * Neither party is emailed, deliberately: the tracking screen is the
 * notification, and it is also what gates the « Colis envoyé » button, so a party
 * with no label could not act on a mail anyway.
 *
 * Returns null when OPS_EMAIL is unset, so the caller can log loudly rather than
 * silently dropping the work.
 */
export function buildParcelOpsMail(input: ParcelOpsInput): Mail | null {
  const to = process.env.OPS_EMAIL;
  if (!to) return null;

  const block = (label: string, p: ParcelOpsParty) =>
    [
      `${label} : ${p.name}`,
      `  ${p.line1}`,
      ...(p.line2 ? [`  ${p.line2}`] : []),
      `  ${p.postalCode} ${p.city}`,
      `  ${p.phone}`,
    ].join('\n');

  return {
    to,
    subject: `Colis à préparer - ${input.demandeTitle}`,
    text: [
      'Les deux adresses sont renseignées. Deux étiquettes à acheter, aller et retour.',
      '',
      `Commande : ${input.commandeId}`,
      `Demande  : ${input.demandeTitle}`,
      '',
      block('Client (expéditeur aller)', input.client),
      '',
      block('Réparateur (destinataire aller)', input.repairer),
      '',
      "Puis saisir les deux numéros de suivi dans /colis sur l'admin.",
    ].join('\n'),
  };
}

/** Never throws - enforced, not merely documented. A failed notification must not
 *  undo a saved address, and it must not fail the request either: the client would
 *  retry, both rows would already exist, and the notification would then be skipped
 *  as "already sent" - stranding the commande with no label ever ordered. */
export async function sendParcelOpsMail(input: ParcelOpsInput): Promise<void> {
  try {
    const mail = buildParcelOpsMail(input);
    if (!mail) {
      console.error(
        '[commandes] OPS_EMAIL is unset - no label can be prepared for commande %s',
        input.commandeId,
      );
      return;
    }
    await mailSender().send(mail);
  } catch (error) {
    // Loud, because the address IS saved and nothing else will retry this.
    console.error(
      '[commandes] failed to notify ops for commande %s - no label has been ordered',
      input.commandeId,
      error,
    );
  }
}

/**
 * Livraison Boxtal (spec §8.6). The driver did the work and something went wrong; each kind
 * names what the operator must now do. `INSURANCE_NOT_APPLIED` comes from the sandbox probe
 * (spec « Amendment, 2026-09-04 »): Boxtal answers 200 with no insurance when the service
 * cannot insure the value, and the client has already paid a premium.
 */
export type ShippingOpsInput = {
  kind: 'ORDER_REFUSED' | 'LABEL_STORE_FAILED' | 'CANCEL_FAILED' | 'CARRIER_EXCEPTION' | 'INSURANCE_NOT_APPLIED';
  commandeId: string;
  demandeTitle: string;
  leg: 'OUTBOUND' | 'RETURN';
  detail: string;
};

export const SHIPPING_INCIDENT_SUBJECT: Record<ShippingOpsInput['kind'], string> = {
  ORDER_REFUSED: 'Étiquette Boxtal refusée',
  LABEL_STORE_FAILED: 'Étiquette Boxtal non enregistrée',
  CANCEL_FAILED: 'Annulation Boxtal échouée',
  CARRIER_EXCEPTION: 'Incident transporteur',
  INSURANCE_NOT_APPLIED: 'Assurance Boxtal non appliquée',
};

const ACTION_BY_KIND: Record<ShippingOpsInput['kind'], string> = {
  ORDER_REFUSED:
    "Relancer depuis /colis sur l'admin une fois la cause levée, ou acheter l'étiquette à la main et saisir le numéro de suivi dans /colis.",
  LABEL_STORE_FAILED:
    "L'ordre existe chez Boxtal ; le PDF n'a pas pu être enregistré. Relancer depuis /colis, ou télécharger l'étiquette dans l'espace Boxtal et la transmettre.",
  CANCEL_FAILED:
    "Le remboursement est fait ; l'ordre Boxtal n'a pas pu être annulé. Annuler à la main dans l'espace Boxtal avant le ramassage.",
  CARRIER_EXCEPTION:
    "Le transporteur signale un incident. Contacter les deux parties depuis /colis et suivre le colis dans l'espace Boxtal.",
  INSURANCE_NOT_APPLIED:
    "Le client a payé une assurance transport que Boxtal n'a PAS appliquée sur cette étiquette. Vérifier l'ordre dans l'espace Boxtal, souscrire l'assurance à la main si possible, sinon rembourser la ligne assurance depuis /colis.",
};

export function buildShippingOpsMail(input: ShippingOpsInput): Mail | null {
  const to = process.env.OPS_EMAIL;
  if (!to) return null;
  return {
    to,
    subject: `${SHIPPING_INCIDENT_SUBJECT[input.kind]} - ${input.demandeTitle}`,
    text: [
      `Commande : ${input.commandeId}`,
      `Demande  : ${input.demandeTitle}`,
      `Trajet   : ${input.leg === 'OUTBOUND' ? 'aller' : 'retour'}`,
      '',
      `Détail : ${input.detail}`,
      '',
      ACTION_BY_KIND[input.kind],
    ].join('\n'),
  };
}

/** Never throws - the same contract as sendParcelOpsMail, for the same reason. */
export async function sendShippingOpsMail(input: ShippingOpsInput): Promise<void> {
  try {
    const mail = buildShippingOpsMail(input);
    if (!mail) {
      console.error('[shipping] OPS_EMAIL is unset - %s on commande %s (%s) goes unreported', input.kind, input.commandeId, input.leg);
      return;
    }
    await mailSender().send(mail);
  } catch (error) {
    console.error('[shipping] failed to notify ops of %s for commande %s', input.kind, input.commandeId, error);
  }
}

/**
 * Task 3 (CF4-D, spec §D). A partial refund only reverses the CLIENT's money; it never
 * moves anything TO the réparateur. When the admin's refund decision includes a share for
 * the réparateur, someone has to pay it by hand - this mail is what tells the operator
 * that a share is owed and gives him everything he needs to act without opening the
 * database, same shape as `buildParcelOpsMail`.
 *
 * Returns null when OPS_EMAIL is unset, so the caller can log loudly rather than silently
 * dropping the work.
 */
export type RefundShareOpsInput = {
  commandeId: string;
  demandeTitle: string;
  shareCents: number;
  reason: string;
};

export function buildRefundShareOpsMail(input: RefundShareOpsInput): Mail | null {
  const to = process.env.OPS_EMAIL;
  if (!to) return null;

  return {
    to,
    subject: `Part du réparateur à verser - ${input.demandeTitle}`,
    text: [
      `Commande : ${input.commandeId}`,
      `Demande  : ${input.demandeTitle}`,
      '',
      `Montant  : ${euros(input.shareCents)}`,
      `Motif    : ${input.reason}`,
      '',
      "Verser la part depuis la page Remboursement de l'admin.",
    ].join('\n'),
  };
}

/** Never throws - the same contract as sendParcelOpsMail, for the same reason: the refund
 *  decision is already persisted, and nothing else will retry notifying ops of the share. */
export async function sendRefundShareOpsMail(input: RefundShareOpsInput): Promise<void> {
  try {
    const mail = buildRefundShareOpsMail(input);
    if (!mail) {
      console.error(
        '[commandes] OPS_EMAIL is unset - no one was told to pay the réparateur share for commande %s',
        input.commandeId,
      );
      return;
    }
    await mailSender().send(mail);
  } catch (error) {
    console.error(
      '[commandes] failed to notify ops of the réparateur share for commande %s',
      input.commandeId,
      error,
    );
  }
}
