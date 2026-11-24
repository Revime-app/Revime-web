import { z } from 'zod';
import type { CommandeStatus, CommandeStep } from './commande.schemas.js';
import type { DocumentDto } from './dispute.js';
import type { BlockStateDto } from './moderation.schemas.js';

/**
 * A plan-level choice, not a measurement: high enough that no real message
 * reaches it, low enough to bound one request body. The column itself is an
 * unconstrained `String`, matching this codebase's convention of bounding in Zod
 * rather than in Postgres.
 */
export const MESSAGE_BODY_MAX = 2000;

/**
 * `.trim()` runs BEFORE `.min(1)`, which is what makes a whitespace-only body a
 * refusal rather than an empty row. Sending « Votre message est vide. » is also
 * why the composer needs no client-side emptiness check to stay honest.
 */
export const sendMessageSchema = z
  .object({
    body: z
      .string({ message: 'Message invalide.' })
      .trim()
      .max(MESSAGE_BODY_MAX, { message: 'Message trop long.' })
      .default(''),
    photoPath: z.string().trim().min(1).optional().nullable(),
    documentPath: z.string().trim().min(1).optional().nullable(),
    documentName: z.string().trim().max(120).optional().nullable(),
    documentSizeBytes: z.number().int().nonnegative().optional().nullable(),
  })
  .refine((data) => !(Boolean(data.photoPath) && Boolean(data.documentPath)), {
    message: 'Une seule pièce jointe par message.',
    path: ['photoPath'],
  })
  .refine(
    (data) =>
      data.body.length > 0 ||
      Boolean(data.photoPath) ||
      Boolean(data.documentPath),
    {
      message: 'Votre message est vide.',
      path: ['body'],
    },
  );

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const signChatPhotoSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png'], {
    message: 'Seuls les formats JPEG et PNG sont acceptés.',
  }),
});

export type SignChatPhotoInput = z.infer<typeof signChatPhotoSchema>;

/**
 * Both ids are accepted, with demandeId optional for direct profile contacts.
 * The server asserts the caller is one of the two named parties.
 */
export const createConversationSchema = z.object({
  demandeId: z.string().min(1, { message: 'Demande invalide.' }).optional().nullable(),
  repairerUserId: z
    .string({ message: 'Réparateur invalide.' })
    .min(1, { message: 'Réparateur invalide.' }),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/** One message as either party sees it. */
export type MessageDto = {
  id: string;
  body: string;
  photoUrl?: string | null;
  document?: DocumentDto | null;
  /**
   * CF-42. A SYSTEM message has no sender, so the thread must render it as a centred
   * notice rather than a side-aligned bubble.
   *
   * 🛑 `mine` is ALWAYS false when this is 'SYSTEM', and that is not a coincidence to
   * rely on: `senderUserId === userId` is false for BOTH parties on a null sender, so
   * without this discriminator a system message reads as the counterpart's message to
   * everyone.
   */
  kind: 'USER' | 'SYSTEM' | 'SUPPORT';
  /** True when the session user wrote it. The prototype's "from: 'me'". */
  mine: boolean;
  createdAt: string;
};

/**
 * The prototype's « Offre concernée » card. DERIVED per request from the
 * réparateur's current offer, never stored -- see the spec §4.2. Null when he has
 * no live or accepted offer, which is reachable: he may have withdrawn it.
 */
export type OfferRecapDto = {
  offerId: string;
  /** The demande title. The prototype's `offerRecap.object`. */
  object: string;
  priceCents: number;
  delayHours: number;
  warrantyLabel: string;
};

export type TransactionSummaryDto = {
  commandeId: string;
  orderNumber: string;
  title: string;
  totalCents: number;
  status: CommandeStatus;
  step: CommandeStep | null;
  /** True when a dispute is open on the order (CF6-V4). The server's answer, `isDisputeOpen`. */
  disputeOpen: boolean;
  updatedAt: string;
};

export type ConversationDto = {
  id: string;
  demandeId?: string | null;
  /** The other party's name, whichever side the caller is on. */
  counterpartName: string;
  /**
   * The other party's user id. Needed because `POST /blocks` and
   * `DELETE /blocks/:userId` are keyed on the USER rather than on the conversation
   * (spec §6.1), so the sheet has to know whom it is acting on. A uuid discloses
   * nothing the name beside it does not already.
   */
  counterpartUserId: string;
  /**
   * True when the counterpart is the RÉPARATEUR, i.e. the caller is the client.
   *
   * Added by Étape 4b piece C for the thread sheet's « Voir le profil », which must not
   * render on a réparateur's side of a thread: the counterpart there is the client, who
   * has no `RepairerProfile`, so `GET /repairers/:userId` answers 404 and the app would
   * be offering a link that fails for half its users.
   *
   * A boolean rather than exposing both user ids, because the sheet needs the ANSWER and
   * not the inputs. And `activeMode` cannot substitute for it: `conversations.service.ts`
   * applies no mode filter to the inbox, so a réparateur sitting in réparateur mode sees
   * threads in which he is the client.
   */
  counterpartIsRepairer: boolean;
  /** The demande title or default subject. The prototype's `objet`. */
  subject: string;
  offerRecap: OfferRecapDto | null;
  /**
   * CF3-09, CF3-10: Permanent transaction summary card post-payment.
   * Present when an active or paid commande exists between the parties.
   */
  transaction?: TransactionSummaryDto | null;
  /** Oldest first, which is the order a thread reads in. */
  messages: MessageDto[];
  /**
   * Never null. An unblocked pair is `{ active: false, byMe: false }` rather than an
   * absent object, so the composer has ONE shape to read and cannot render its
   * enabled state from a missing field.
   */
  blocked: BlockStateDto;
  dispute?: {
    commandeId: string;
    number: number;
    unread: boolean;
  } | null;
};

/**
 * One inbox row.
 */
export type ConversationListItem = {
  id: string;
  demandeId?: string | null;
  counterpartName: string;
  subject: string;
  /** The last message's body. */
  preview: string;
  lastMessageAt: string;
  /** Messages from the other party newer than the caller's own read stamp. */
  unread: number;
  /**
   * `CF-23`. The counterpart's uploaded photo, signed, or null when they have none -- which is
   * the ordinary case. The row renders initials on null.
   */
  avatarUrl: string | null;
  /**
   * CF5-14: The caller's role in this conversation ('CLIENT' or 'REPAIRER').
   * Allows the mobile inbox and unread tab badge to partition conversations by activeMode.
   */
  userRole: 'CLIENT' | 'REPAIRER';
};
