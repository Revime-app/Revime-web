import type { DocumentDto, MessageDto } from '@revime/shared';
import { euros } from '@revime/shared';

type Row = {
  id: string;
  body: string;
  photoPath?: string | null;
  documentPath?: string | null;
  documentName?: string | null;
  documentSizeBytes?: number | null;
  senderUserId: string | null;
  kind: 'USER' | 'SYSTEM' | 'SUPPORT';
  createdAt: Date;
};

/**
 * CF-42's copy. The client proposed:
 *
 *   « Paiement effectué ✅ - Le paiement de votre réparation a bien été effectué. Vous
 *     pouvez maintenant échanger avec VOTRE RÉPARATEUR pour organiser la suite de la
 *     réparation. »
 *
 * 🛑 It cannot ship verbatim. It is written from the client's side, and the réparateur
 * reads the same persisted row -- one message cannot address two readers. Neutralised
 * while keeping his structure and his ✅. A per-reader body would need a stored template
 * key and two renders, which is a second representation of one fact.
 *
 * This divergence travels in the end-of-round client message; it is not a silent change.
 */
export function systemMessageBody(): string {
  return 'Paiement effectué ✅ - Le paiement de la réparation a bien été effectué. Vous pouvez maintenant échanger pour organiser la suite de la réparation.';
}

/**
 * CF6-12. System message posted when a client cancels a private quote request.
 * Read by both parties: neutral phrasing.
 */
export function quoteCancelledSystemMessage(): string {
  return 'Demande de devis annulée par le client.';
}

/**
 * CF4-17 (design §E). The lifecycle events `CommandeAnnouncer.announce` posts as system
 * messages. `DISPUTE_RELEASED` / `DISPUTE_REFUNDED` are distinct from `FUNDS_RELEASED` /
 * `REFUNDED` because the copy names the dispute as the cause - the same underlying money
 * movement reads differently depending on whether a dispute preceded it.
 */
export type AnnounceEvent =
  | 'FUNDS_RELEASED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RELEASED'
  | 'DISPUTE_REFUNDED'
  | 'DISPUTE_DISMISSED'
  | 'REFUNDED';

/**
 * One row per `AnnounceEvent`, read by BOTH parties - same rule as `systemMessageBody`:
 * neither party is addressed by name or role, so one string serves the client and the
 * réparateur alike. `Record` rather than a switch so a member added to `AnnounceEvent`
 * without a row here is a compile error, not a silent `undefined` in a message body.
 */
const SYSTEM_MESSAGE_FOR: Record<AnnounceEvent, string> = {
  FUNDS_RELEASED: '🎉 Réparation validée ! Les fonds ont été débloqués.',
  DISPUTE_OPENED:
    "⚠️ Litige ouvert : REVIME examine la situation. Les fonds sont conservés jusqu'à la résolution.",
  DISPUTE_RELEASED: '⚖️ Litige résolu : les fonds ont été versés au réparateur.',
  DISPUTE_REFUNDED: '⚖️ Litige résolu : la commande a été remboursée au client.',
  DISPUTE_DISMISSED: '⚖️ Litige clos : la commande reprend son cours normal.',
  REFUNDED: '↩️ Commande remboursée : le client a été remboursé.',
};

export function systemMessageFor(event: AnnounceEvent, partialRefundCents?: number | null): string {
  // Task 3 (CF4-D, spec §D). A partial refund reads differently from a full one - only
  // for the two events a refund can actually produce. `REFUNDED` / `DISPUTE_REFUNDED`
  // alone branch on the amount; every other event's line does not mention money at all,
  // so it ignores a stray amount rather than branching on it.
  if (partialRefundCents != null) {
    if (event === 'REFUNDED') {
      return `↩️ Remboursement partiel : ${euros(partialRefundCents)} remboursés au client.`;
    }
    if (event === 'DISPUTE_REFUNDED') {
      return `⚖️ Litige résolu : remboursement partiel de ${euros(partialRefundCents)} au client.`;
    }
  }
  return SYSTEM_MESSAGE_FOR[event];
}

/**
 * The ONLY place a Message row becomes a MessageDto. Extracted from `getThread` so the
 * SYSTEM branch is testable without a database.
 *
 * `mine` is computed from `kind` FIRST. Deriving it from `senderUserId === userId` alone
 * returns false for both parties on a null sender, which renders a system notice as the
 * counterpart's bubble -- the bug this function exists to make impossible.
 */
export function toMessageDto(
  row: Row,
  viewerUserId: string,
  photoUrl?: string | null,
  document?: DocumentDto | null,
): MessageDto {
  return {
    id: row.id,
    body: row.body,
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    ...(document !== undefined ? { document } : {}),
    kind: row.kind,
    mine: row.kind === 'SYSTEM' ? false : row.senderUserId === viewerUserId,
    createdAt: row.createdAt.toISOString(),
  };
}
