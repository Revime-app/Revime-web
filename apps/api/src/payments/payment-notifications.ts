import type { NotificationsService } from '../notifications/notifications.service.js';

/**
 * CF-43's two client-facing payment notifications, extracted for the reason
 * `open-conversation.ts` states: `completeBySessionId` and `abandonBySessionId` are Stripe
 * webhook handlers that cannot be reached from a unit test without a database, Stripe and a
 * webhook - and `test:unit` excludes all 30 int specs, while the int suite writes to the
 * PRODUCTION database. An emit left inline in the service therefore has no gate that can
 * ever run on it. Here, the recipient and the field mapping are both testable.
 *
 * No try/catch, deliberately, and it is not an omission: `emit()` already swallows and logs
 * every failure - pinned by `notifications-emit.spec.ts`'s « RESOLVES when the insert
 * rejects » case - precisely so a webhook caller cannot throw. Wrapping it again would add a
 * second, weaker copy of that guarantee.
 */

/** Just the one method, so a test needs no Nest container. */
type Emitter = Pick<NotificationsService, 'emit'>;

/**
 * The client has paid and the money path has committed.
 *
 * 🛑 Addressed to the CLIENT. Until CF-43 this event notified the winning réparateur
 * (`OFFER_ACCEPTED`) and every loser (`OFFER_DECLINED`), and told the person who actually
 * paid nothing at all - so the client's list ran « Nouvelle offre reçue » straight to
 * « Colis reçu » with the payment invisible between them. CF-46 named « les notifications »
 * as one of the five surfaces that must reflect the paid state, and for the client it did not.
 *
 * `actorName` is null: this tells the client about his OWN act, so there is no other party to
 * name, and the PAID copy interpolates no actor at all.
 */
export async function notifyClientOfPaidCommande(
  notifications: Emitter,
  commande: { id: string; demandeId: string; clientUserId: string; repairCents: number },
  subject: string | null,
): Promise<void> {
  await notifications.emit({
    userId: commande.clientUserId,
    mode: 'CLIENT',
    type: 'COMMANDE_STEP',
    step: 'PAID',
    actorName: null,
    subject,
    amountCents: commande.repairCents,
    demandeId: commande.demandeId,
    // The COMMANDE as well as the demande: the client's next action is the conversation and
    // the tracking chain, both of which hang off the commande. Same reasoning as the
    // réparateur's OFFER_ACCEPTED emit.
    commandeId: commande.id,
  });
}

/**
 * A checkout session expired with the commande still unpaid.
 *
 * This is CF-43's answer to « paiement refusé », which is an event that cannot exist - see
 * the `PAYMENT_ABANDONED` copy branch in `packages/shared` for why. Retry is genuinely
 * available afterwards, which is what makes the notification actionable rather than a dead
 * end: the unique index on `Commande.demandeId` is PARTIAL (`WHERE status =
 * 'PENDING_PAYMENT'`, migration `20260816020000`), so an ABANDONED row vacates the slot,
 * `pick-commande.ts` skips it, and `demande-progress.ts` returns the chain to position 0.
 *
 * @param subject the demande title, or null. SUPPLIED rather than merely supported: the
 *   copy has a subject arm, and CF-30 is this repo's example of the cost of a field that
 *   nothing feeds - `partsLabel` shipped to the client's app with zero read sites.
 * @param changedCount rows actually moved to ABANDONED by the caller's `updateMany`.
 *
 * 🛑 The count guard is the whole reason this takes that parameter. `abandonBySessionId` uses
 * `updateMany` and has TWO callers - the `checkout.session.expired` webhook and P5's
 * orphan-session job - and `updateMany` matching nothing is a success, not an error. Emitting
 * unconditionally would notify a second time about one lapse, or notify about a commande that
 * had already been paid or refunded.
 */
export async function notifyClientOfAbandonedPayment(
  notifications: Emitter,
  commande: { id: string; demandeId: string; clientUserId: string },
  subject: string | null,
  changedCount: number,
): Promise<void> {
  if (changedCount < 1) return;

  await notifications.emit({
    userId: commande.clientUserId,
    mode: 'CLIENT',
    type: 'PAYMENT_ABANDONED',
    // No actor: an expiry is nobody's act, least of all the réparateur's.
    actorName: null,
    subject,
    // No amount: nothing was ever charged, and a figure beside « Paiement non finalisé »
    // reads as a debit the client should look for on his statement.
    demandeId: commande.demandeId,
    commandeId: commande.id,
  });
}
