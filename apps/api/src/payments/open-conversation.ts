import type { ConversationsService } from '../conversations/conversations.service.js';

/**
 * CF-41's call site, extracted so the swallow and the flag check are testable without a
 * webhook, a database or Stripe.
 *
 * 🛑 THIS RUNS AFTER THE MONEY TRANSACTION AND MUST NEVER THROW. `completeBySessionId`
 * is a Stripe webhook handler: a throw releases Stripe's claim on the event and
 * re-enters the compensation path, on a payment that has already succeeded. That is the
 * same reasoning the `emit()` comment in payments.service.ts gives for living outside
 * the transaction.
 *
 * RESIDUAL, recorded rather than hidden: on failure the payment is correct and coherent
 * but the conversation is missing, and nothing retries it - `completeBySessionId`
 * returns early once the commande leaves PENDING_PAYMENT. Accepted because the fallback
 * is already shipped: the winning offer exists, so « Contacter » → `getOrCreate` lands
 * on the very same row, guaranteed by @@unique([demandeId, repairerUserId]).
 * 🛑 The fallback does NOT apply to a moderated pair: `openForPayment` refuses to revive
 * a closed conversation, and `getOrCreate` throws CONVERSATION_CLOSED on one.
 */
export async function openConversationForPaidCommande(
  conversations: Pick<ConversationsService, 'openForPayment'>,
  commande: { demandeId: string; clientUserId: string; repairerUserId: string },
  messagingEnabled: boolean,
): Promise<void> {
  if (!messagingEnabled) return;

  try {
    await conversations.openForPayment({
      demandeId: commande.demandeId,
      clientUserId: commande.clientUserId,
      repairerUserId: commande.repairerUserId,
    });
  } catch (e) {
    // Logged loudly, because a silent miss here is invisible until a client asks why
    // his conversation never opened.
    console.error('[payments] could not open the conversation for a paid commande', {
      demandeId: commande.demandeId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
