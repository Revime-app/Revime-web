import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ConversationDto,
  ConversationListItem,
  CreateConversationInput,
  DocumentDto,
  MessageDto,
  OfferRecapDto,
  SendMessageInput,
  SignAttachmentInput,
  SignChatPhotoInput,
  TransactionSummaryDto,
} from '@revime/shared';
import { messagingIdentity, orderNumberFor, publicIdentity, warrantyLabelFor } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { targetableByRepairerWhere } from '../demandes/demande-predicates.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide } from '../review-accounts/review-account.js';
import {
  attachmentExtension,
  bucketFor,
  checkConversationAttachment,
  cleanDocumentName,
  conversationAttachmentPath,
  signAttachmentUrls,
} from '../storage/attachment-paths.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import { assertMessagingEnabled } from './flag.js';
import { ModerationService } from './moderation.service.js';
import { checkMessageLimit } from './rate-limit.js';
import { systemMessageBody, toMessageDto } from './system-message.js';
import { unreadFor } from '../disputes/disputes.service.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';

/** Both refusals of a missing or unreachable conversation, which must not drift apart. */
const NOT_FOUND = 'Ressource introuvable.';

/** A channel an operator closed. Deliberately not revivable - see getOrCreate. */
const CONVERSATION_CLOSED = 'Cette conversation a été fermée.';

/**
 * ONE sentence for both directions, deliberately. The blocked party must not be told
 * he was blocked - that escalates - and this is true either way round: the channel is
 * closed. The blocker learns which of them did it from `BlockStateDto.byMe` on the
 * thread, not from this message.
 */
const BLOCKED = 'Vous ne pouvez plus échanger avec cette personne.';

/**
 * The two parties' name fields as ONE select fragment. Duplicated verbatim at two
 * sites before piece 2, which would have become three when block state joined the
 * thread DTO. `offers.service.ts`'s `OFFER_INCLUDE` exists for exactly this reason:
 * an inline spread of a nested select is silently OVERWRITTEN rather than merged, so
 * two copies drift without any compiler error.
 */
/** One hour, matching every other signed read URL in this API. */
const AVATAR_READ_TTL_SECONDS = 3600;

const COUNTERPART_SELECT = {
  client: { select: { username: true, profile: { select: { avatarPath: true } } } },
  repairer: {
    select: {
      username: true,
      repairerProfile: { select: { displayName: true } },
      // `CF-23`. On Profile, NOT RepairerProfile: the column is on the person, so the same photo
      // serves both modes and a client's avatar is reachable by the identical join.
      profile: { select: { avatarPath: true } },
    },
  },
} as const;

/**
 * Whichever party is not the caller. Both sides are routed through `messagingIdentity`, which
 * returns `displayName ?? username` - `publicIdentity`'s rule without the « @ », which the owner
 * asked to drop from the Messages list and the chat (CF4-50). The legal name (`User.name`) is
 * deliberately no longer selected here, per the client's CF-05 feedback of 2026-08-21.
 *
 * The decision was taken on 2026-08-21 by the client's CF-05: « Le nom et prénom ne
 * doivent pas être visibles publiquement par les autres utilisateurs. »
 */
function counterpartName(
  row: {
    clientUserId: string;
    client: { username: string };
    repairer: { username: string; repairerProfile: { displayName: string } | null };
  },
  userId: string,
): string {
  return row.clientUserId === userId
    ? messagingIdentity({
        username: row.repairer.username,
        displayName: row.repairer.repairerProfile?.displayName ?? null,
      })
    : messagingIdentity({ username: row.client.username, displayName: null });
}

/**
 * `CF-23`. The COUNTERPART's avatar path, by the same rule `counterpartName` uses - an inbox row
 * shows who you are talking to, so it must never resolve to the caller's own photo.
 *
 * A sibling of `counterpartName` rather than a second `clientUserId === userId` test written
 * inline: the two must agree about which side is which, and two copies of that comparison would
 * be free to disagree and put one party's name beside the other's face.
 */
function counterpartAvatarPath(
  row: {
    clientUserId: string;
    client: { profile: { avatarPath: string | null } | null };
    repairer: { profile: { avatarPath: string | null } | null };
  },
  userId: string,
): string | null {
  return row.clientUserId === userId
    ? (row.repairer.profile?.avatarPath ?? null)
    : (row.client.profile?.avatarPath ?? null);
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Idempotent. Returns the existing thread for this (demande, réparateur) pair or
   * creates it with `lastMessageAt` null, which keeps an opened-and-abandoned
   * conversation out of both inboxes.
   */
  async getOrCreate(userId: string, input: CreateConversationInput): Promise<{ id: string }> {
    assertMessagingEnabled();

    // CF3-07: Direct quote / contact from repairer profile without a public demande
    if (!input.demandeId) {
      if (userId === input.repairerUserId) {
        throw new AppException('NOT_FOUND', NOT_FOUND);
      }

      const repairer = await this.prisma.user.findFirst({
        where: { id: input.repairerUserId },
        select: { id: true },
      });
      if (!repairer) throw new AppException('NOT_FOUND', NOT_FOUND);
      // PUB-33 (DECP-23): across the store-review seal the réparateur does not exist (404).
      await assertSameSide(this.prisma, userId, input.repairerUserId);

      const existingDirect = await this.prisma.conversation.findFirst({
        where: {
          demandeId: null,
          clientUserId: userId,
          repairerUserId: input.repairerUserId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existingDirect) return { id: existingDirect.id };

      return await this.prisma.conversation
        .create({
          data: {
            demandeId: null,
            clientUserId: userId,
            repairerUserId: input.repairerUserId,
          },
          select: { id: true },
        })
        .catch(async (e: unknown) => {
          if (!isUniqueViolation(e)) throw e;
          const row = await this.prisma.conversation.findFirst({
            where: {
              demandeId: null,
              clientUserId: userId,
              repairerUserId: input.repairerUserId,
            },
            select: { id: true, deletedAt: true },
          });
          if (!row || row.deletedAt) {
            throw new AppException('UNPROCESSABLE_ENTITY', CONVERSATION_CLOSED);
          }
          return { id: row.id };
        });
    }

    // CF4-25: a private request only admits the conversation between its author and its
    // target; any other named réparateur gets the same 404 as a nonexistent id.
    const demande = await this.prisma.demande.findFirst({
      where: { id: input.demandeId, ...targetableByRepairerWhere(input.repairerUserId) },
      select: { id: true, authorUserId: true },
    });
    if (!demande) throw new AppException('NOT_FOUND', NOT_FOUND);
    // PUB-33 (DECP-23): the two parties must be on the same side of the store-review seal.
    await assertSameSide(this.prisma, demande.authorUserId, input.repairerUserId);

    const isClient = userId === demande.authorUserId;
    const isRepairer = userId === input.repairerUserId;
    // The caller must be one of the two named parties. A 404 rather than a 403,
    // because confirming a conversation exists between two other people is itself
    // a disclosure.
    if (!isClient && !isRepairer) throw new AppException('NOT_FOUND', NOT_FOUND);
    // The author cannot also be the réparateur: a demande's own author never
    // receives offers on it, so this pair could only arrive from a hand-made body.
    if (demande.authorUserId === input.repairerUserId) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    // The design's §3.3: an offer is the price of contact. ANY status that is not
    // soft-deleted counts -- a withdrawn offer was still a real commitment, and
    // closing the channel on withdrawal would strand a conversation mid-repair.
    const offer = await this.prisma.offer.findFirst({
      where: {
        demandeId: demande.id,
        repairerUserId: input.repairerUserId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!offer) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        isRepairer
          ? 'Envoyez une offre pour contacter ce client.'
          : "Ce réparateur ne vous a pas encore fait d'offre.",
      );
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        demandeId: demande.id,
        repairerUserId: input.repairerUserId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id };

    return await this.prisma.conversation
      .create({
        data: {
          demandeId: demande.id,
          clientUserId: demande.authorUserId,
          repairerUserId: input.repairerUserId,
        },
        select: { id: true },
      })
      .catch(async (e: unknown) => {
        // Check-then-insert, and this unique index is NOT partial - unlike Offer's,
        // which is narrowed to live offers. Two paths reach P2002 and they need
        // different answers:
        //
        // 1. A double tap: both requests miss `existing` and both insert. The loser
        //    must still get the id, because this method's contract is idempotent and
        //    a raw P2002 would surface as the generic French fallback instead.
        // 2. A conversation this pair already had, which moderation soft-deleted.
        //    `existing` filters `deletedAt: null` and the index does not, so without
        //    this branch the insert would fail forever and the pair could never
        //    message again, with no authored message to explain why.
        if (!isUniqueViolation(e)) throw e;

        // No `deletedAt` filter here, deliberately: this re-read must be able to SEE
        // the soft-deleted row, which is the whole reason the insert failed.
        const row = await this.prisma.conversation.findFirst({
          where: { demandeId: demande.id, repairerUserId: input.repairerUserId },
          select: { id: true, deletedAt: true },
        });
        // Deliberately NOT a revive: an operator closed this channel, and reopening
        // it on the next tap would undo the moderation decision. Whether an operator
        // can reopen one belongs to piece 2.
        if (!row || row.deletedAt) {
          throw new AppException('UNPROCESSABLE_ENTITY', CONVERSATION_CLOSED);
        }
        return { id: row.id };
      });
  }

  /**
   * CF-41. Paying opens the conversation, and CF-42 puts the first line in it.
   *
   * 🛑 `getOrCreate` CANNOT be reused, and that is not a style preference. It calls
   * `assertMessagingEnabled()`, it requires the caller to BE one of the two named
   * parties, and it requires an offer to exist. The caller here is a Stripe webhook: it
   * is not a user, there is nobody to authorise, and the facts arrive already validated
   * from the commande row.
   *
   * Upsert rather than check-then-insert. `Conversation` has
   * `@@unique([demandeId, repairerUserId])`, so the race `getOrCreate` recovers from with
   * a P2002 catch is simply not entered here.
   *
   * `lastMessageAt` is stamped in the SAME transaction as the message, exactly as
   * `sendMessage` does. Without it `listInbox` hides the conversation - it filters
   * `lastMessageAt: { not: null }` - and the thread this method exists to open would
   * reach neither inbox.
   */
  async openForPayment(input: {
    demandeId: string;
    clientUserId: string;
    repairerUserId: string;
  }): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: {
          demandeId_repairerUserId: {
            demandeId: input.demandeId,
            repairerUserId: input.repairerUserId,
          },
        },
        select: { id: true, deletedAt: true },
      });
      // An operator closed this channel. getOrCreate refuses to revive one; so does this.
      if (existing?.deletedAt) return;

      const conversation = await tx.conversation.upsert({
        where: {
          demandeId_repairerUserId: {
            demandeId: input.demandeId,
            repairerUserId: input.repairerUserId,
          },
        },
        create: {
          demandeId: input.demandeId,
          clientUserId: input.clientUserId,
          repairerUserId: input.repairerUserId,
          lastMessageAt: now,
        },
        update: {},
        select: { id: true },
      });

      // Idempotent: serialized upstream by claimStripeEvent and the PENDING_PAYMENT early
      // return at :354, so two concurrent transactions reading count === 0 on an existing
      // conversation cannot both proceed to create.
      const already = await tx.message.count({
        where: { conversationId: conversation.id, kind: 'SYSTEM' },
      });
      if (already > 0) return;

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderUserId: null,
          kind: 'SYSTEM',
          body: systemMessageBody(),
          createdAt: now,
        },
      });
    });
  }

  /**
   * The inbox, newest activity first.
   *
   * One `findMany` plus one `groupBy`, with the nested selects adding their own
   * round trips. With `relationJoins` off, the nested `demande` / `client` /
   * `repairer` / `repairerProfile` / `messages` selects are each a separate query,
   * so this is roughly seven round trips, not two. The cost is bounded by the inbox
   * size rather than by the message count, and the per-conversation unread cutoff is
   * why a single `groupBy` cannot express it.
   *
   * `lastMessageAt: { not: null }` is what hides an opened-and-abandoned thread.
   *
   * Known bound to revisit when the inbox gets pagination: there is no `take`, so
   * `countUnread`'s `OR` array grows with the inbox - harmless at V1 sizes, but it
   * degrades the query planner in the thousands and would meet Postgres' bind-parameter
   * cap in the tens of thousands.
   */
  async listInbox(userId: string): Promise<ConversationListItem[]> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        deletedAt: null,
        lastMessageAt: { not: null },
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        demandeId: true,
        clientUserId: true,
        repairerUserId: true,
        lastMessageAt: true,
        clientLastReadAt: true,
        repairerLastReadAt: true,
        demande: { select: { title: true } },
        ...COUNTERPART_SELECT,
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, photoPath: true, documentPath: true },
        },
      },
    });
    if (rows.length === 0) return [];

    const unreadByConversation = await this.countUnread(userId, rows);

    // ONE signing call for the whole inbox. This list has no `take` either, so a sign-per-row
    // would grow with the thread count -- and unlike the directory, both parties can have a
    // photo, so the batch is what keeps the cost one round trip rather than up to two per row.
    const avatarPaths = rows.map((row) => counterpartAvatarPath(row, userId));
    const present = avatarPaths.filter((p): p is string => p !== null);
    const signed =
      present.length === 0 || !isStorageConfigured()
        ? new Map<string, string>()
        : await storageGateway().createSignedReadUrls(present, AVATAR_READ_TTL_SECONDS);

    return rows.map((row, i) => ({
      id: row.id,
      demandeId: row.demandeId,
      counterpartName: counterpartName(row, userId),
      subject: row.demande?.title ?? 'Demande de devis',
      preview:
        row.messages[0]?.body ||
        (row.messages[0]?.photoPath ? '📷 Photo' : '') ||
        (row.messages[0]?.documentPath ? '📄 Document' : ''),
      // Non-null by the query's own filter, which the compiler cannot see.
      lastMessageAt: (row.lastMessageAt as Date).toISOString(),
      unread: unreadByConversation.get(row.id) ?? 0,
      userRole: row.clientUserId === userId ? 'CLIENT' : 'REPAIRER',
      // Indexed rather than recomputed, so the row and the signed batch cannot disagree about
      // which side the path came from.
      avatarUrl: avatarPaths[i] === null ? null : (signed.get(avatarPaths[i] as string) ?? null),
    }));
  }

  /**
   * Messages from the OTHER party newer than my own read stamp.
   *
   * "From the other party" is load-bearing, not decoration: without it my own
   * newest message counts as unread against me the moment I send one, because
   * sending does not stamp a read.
   */
  private async countUnread(
    userId: string,
    rows: {
      id: string;
      clientUserId: string;
      clientLastReadAt: Date | null;
      repairerLastReadAt: Date | null;
    }[],
  ): Promise<Map<string, number>> {
    const grouped = await this.prisma.message.groupBy({
      by: ['conversationId'],
      // 🛑 `senderUserId: { not: userId }` compiles to `<> $1`, which is NULL-not-true for
      // a SYSTEM message's null sender - so system messages are silently excluded from the
      // unread count. That IS the behaviour we want (no unread badge for an automatic
      // notice), but it is produced by SQL NULL semantics rather than by intent, and no
      // test covers it: it needs a real database, and the only suite that has one writes to
      // production. If this is ever refactored to `OR: [{ senderUserId: null }, …]`, every
      // paid conversation starts life with one unread message.
      where: {
        deletedAt: null,
        senderUserId: { not: userId },
        OR: rows.map((row) => ({
          conversationId: row.id,
          createdAt: {
            gt:
              (row.clientUserId === userId ? row.clientLastReadAt : row.repairerLastReadAt) ??
              new Date(0),
          },
        })),
      },
      _count: { _all: true },
    });

    return new Map(grouped.map((g) => [g.conversationId, g._count._all]));
  }

  /**
   * The thread. Readable with the flag OFF, deliberately: the flag gates WRITES.
   * A user whose messaging was switched off mid-conversation can still read what
   * was said to him, and no new text can enter the system either way.
   */
  async getThread(userId: string, conversationId: string): Promise<ConversationDto> {
    const row = await this.assertParticipant(userId, conversationId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        body: true,
        photoPath: true,
        documentPath: true,
        documentName: true,
        documentSizeBytes: true,
        senderUserId: true,
        kind: true,
        createdAt: true,
      },
    });

    const photoPaths = messages
      .map((m) => m.photoPath)
      .filter((p): p is string => Boolean(p));
    const documentPaths = messages
      .map((m) => m.documentPath)
      .filter((p): p is string => Boolean(p));

    const signedUrls = await signAttachmentUrls(
      { photo: photoPaths, document: documentPaths },
      AVATAR_READ_TTL_SECONDS,
    );

    const counterpartUserId =
      row.clientUserId === userId ? row.repairerUserId : row.clientUserId;

    const activeCommande = await this.prisma.commande.findFirst({
      where: {
        status: { in: ['PAID', 'REFUNDED'] },
        clientUserId: row.clientUserId,
        repairerUserId: row.repairerUserId,
        ...(row.demandeId ? { demandeId: row.demandeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        step: true,
        totalCents: true,
        updatedAt: true,
        demande: { select: { title: true } },
        dispute: {
          select: {
            id: true,
            number: true,
            status: true,
            clientLastReadAt: true,
            repairerLastReadAt: true,
            messages: {
              select: {
                space: true,
                author: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const transaction: TransactionSummaryDto | null = activeCommande
      ? {
          commandeId: activeCommande.id,
          orderNumber: orderNumberFor(activeCommande.id),
          title: activeCommande.demande.title,
          totalCents: activeCommande.totalCents,
          status: activeCommande.status,
          step: activeCommande.step,
          disputeOpen: isDisputeOpen(activeCommande.dispute),
          updatedAt: activeCommande.updatedAt.toISOString(),
        }
      : null;

    return {
      id: row.id,
      demandeId: row.demandeId,
      counterpartName: counterpartName(row, userId),
      counterpartUserId,
      // Piece C. Derived from the comparison two lines above rather than from a second
      // query, because the row already carries both sides. The thread sheet needs it to
      // decide whether « Voir le profil » has anywhere to go: on a réparateur's side the
      // counterpart is the client, who has no RepairerProfile.
      counterpartIsRepairer: row.clientUserId === userId,
      subject: row.demande?.title ?? 'Demande de devis',
      offerRecap:
        row.demandeId && row.demande
            ? await this.offerRecap(row.demandeId, row.repairerUserId, row.demande.title)
          : null,
      transaction,
      messages: messages.map((m) => {
        const photoUrl = m.photoPath ? (signedUrls.get(m.photoPath) ?? null) : null;
        const document = m.documentPath
          ? {
              url: signedUrls.get(m.documentPath) ?? '',
              name: cleanDocumentName(m.documentName),
              sizeBytes: m.documentSizeBytes ?? null,
            }
          : null;
        return toMessageDto(m, userId, photoUrl, document);
      }),
      // Readable while blocked, on purpose: the block closes WRITES. A user must be
      // able to re-read what was said to him, and the thread is also where the
      // blocker finds « Débloquer ».
      blocked: await this.moderation.blockStateFor(userId, counterpartUserId),
      dispute: activeCommande?.dispute
        ? {
            commandeId: activeCommande.id,
            number: activeCommande.dispute.number,
            unread: unreadFor(
              activeCommande.dispute,
              row.clientUserId === userId ? 'CLIENT' : 'REPAIRER',
            ),
          }
        : null,
    };
  }

  /**
   * « Offre concernée », derived per request rather than stored - see §4.2. A
   * réparateur may hold several offers on one demande, so precedence is explicit:
   * the ACCEPTED one wins, otherwise the newest live one.
   *
   * Precedence is resolved in JS rather than by `orderBy: { status: 'asc' }`,
   * because Prisma orders an enum by its `enumsortorder` and `OfferStatus` is
   * declared SENT first - so ordering by status would put the live offer ahead of
   * the accepted one, which is exactly backwards and would typecheck fine.
   *
   * Null is reachable and correct: he may have withdrawn every offer, or the client
   * accepted a competitor's offer and this one was rejected. The thread deliberately
   * stays open either way.
   */
  private async offerRecap(
    demandeId: string,
    repairerUserId: string,
    demandeTitle: string,
  ): Promise<OfferRecapDto | null> {
    const offers = await this.prisma.offer.findMany({
      where: {
        demandeId,
        repairerUserId,
        deletedAt: null,
        status: { in: ['ACCEPTED', 'SENT'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        priceCents: true,
        delayHours: true,
        warrantyLabel: true,
        // CF-31. Selected here rather than fetched separately: this recap is the ONE
        // presenter of an offer that does not go through `OffersService.present`, so
        // without the level it would be the single surface still showing a client a
        // « garantie » written by a particulier. Joined into the existing query, so
        // the rule costs no extra round trip.
        repairer: { select: { profile: { select: { verificationLevel: true } } } },
      },
    });
    const chosen = offers.find((o) => o.status === 'ACCEPTED') ?? offers[0];
    if (!chosen) return null;

    return {
      offerId: chosen.id,
      object: demandeTitle,
      priceCents: chosen.priceCents,
      delayHours: chosen.delayHours,
      // Same shared derivation `present` applies, for the reason that helper is named
      // at all: a second copy of this ternary would drift with no compiler error.
      warrantyLabel: warrantyLabelFor(
        chosen.repairer.profile?.verificationLevel ?? 'NONE',
        chosen.warrantyLabel,
      ),
    };
  }

  /**
   * Stamps the caller's own read column. Writes only the caller's side, so one
   * party reading can never mark the other's messages read.
   *
   * Deliberately NOT gated on `MESSAGING_ENABLED`, unlike `getOrCreate` and
   * `sendMessage`. A read stamp writes only the caller's own `lastReadAt` column
   * and neither introduces text nor opens a channel, so gating it would leave a
   * permanently stuck unread badge on a thread the user can still read - reads
   * are deliberately open. This is a considered deviation from the spec's §6.1
   * wording, not an omission.
   */
  async markRead(userId: string, conversationId: string): Promise<void> {
    const row = await this.assertParticipant(userId, conversationId);
    const field = row.clientUserId === userId ? 'clientLastReadAt' : 'repairerLastReadAt';
    await this.prisma.conversation.update({
      where: { id: row.id },
      data: { [field]: new Date() },
    });

    // FIX 7: Also mark the user's unread MESSAGE_RECEIVED notification for this
    // conversation as read. Without this, the notification's dot persists after the
    // user reads the thread, and because the partial unique index permits only ONE
    // unread MESSAGE_RECEIVED per conversation, no new notification can be created
    // until the stale one is marked read - so subsequent messages in that thread are
    // silent. This is a functional trap, not cosmetic.
    await this.notifications.markConversationNotificationRead(userId, conversationId);
  }

  /**
   * Loads the conversation and refuses anyone who is not one of its two parties
   * with a 404 rather than a 403 - a 403 would confirm that a conversation exists
   * between two other people, which is itself a disclosure.
   */
  private async assertParticipant(userId: string, conversationId: string) {
    const row = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      select: {
        id: true,
        demandeId: true,
        clientUserId: true,
        repairerUserId: true,
        demande: { select: { title: true } },
        ...COUNTERPART_SELECT,
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    return row;
  }

  async signAttachmentUpload(
    userId: string,
    conversationId: string,
    input: SignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    assertMessagingEnabled();
    await this.assertParticipant(userId, conversationId);

    const ext = attachmentExtension(input.contentType);
    const bucket = bucketFor(ext);
    const path = conversationAttachmentPath(conversationId, input.contentType);
    const { uploadUrl } = await storageGateway().createSignedUpload(path, input.contentType, bucket);

    return { path, uploadUrl };
  }

  async signPhotoUpload(
    userId: string,
    conversationId: string,
    input: SignChatPhotoInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.signAttachmentUpload(userId, conversationId, input);
  }

  /**
   * The one write that creates text. Ordered deliberately: flag, then participation,
   * then the rate limit. The limit is checked LAST so a non-participant probing the
   * route cannot consume his own quota to learn anything, and a user whose messaging
   * is off is told that rather than being told he has sent too many.
   *
   * The insert and the `lastMessageAt` stamp are ONE transaction. They are not
   * independent facts: a message the inbox cannot see is worse than no message,
   * because the recipient has no route to it and no indication it exists.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<MessageDto> {
    assertMessagingEnabled();
    const row = await this.assertParticipant(userId, conversationId);

    // Attachment path validation (CF4-34)
    if (input.photoPath && !checkConversationAttachment(input.photoPath, conversationId, 'photo')) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Pièce jointe invalide.');
    }
    if (input.documentPath && !checkConversationAttachment(input.documentPath, conversationId, 'document')) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Pièce jointe invalide.');
    }

    // Ordered before the rate limit and after participation, matching this method's
    // existing reasoning: a non-participant must not be able to spend his own quota to
    // learn anything, and a blocked user is told THAT rather than told he has sent too
    // many. Checked on every send rather than cached on the row, because a block is
    // created and removed by a route that never touches `Conversation`.
    const counterpartUserId =
      row.clientUserId === userId ? row.repairerUserId : row.clientUserId;
    const blocked = await this.moderation.blockStateFor(userId, counterpartUserId);
    if (blocked.active) throw new AppException('UNPROCESSABLE_ENTITY', BLOCKED);

    const verdict = await checkMessageLimit(this.prisma, { userId });
    if (!verdict.allowed) {
      throw new AppException(
        'TOO_MANY_REQUESTS',
        "Vous avez envoyé trop de messages aujourd'hui. Réessayez demain.",
      );
    }

    const documentName = input.documentPath ? cleanDocumentName(input.documentName) : null;
    const documentSizeBytes = input.documentPath ? (input.documentSizeBytes ?? null) : null;

    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderUserId: userId,
          body: input.body ?? '',
          photoPath: input.photoPath ?? null,
          documentPath: input.documentPath ?? null,
          documentName,
          documentSizeBytes,
          kind: 'USER',
          createdAt: now,
        },
        select: {
          id: true,
          body: true,
          photoPath: true,
          documentPath: true,
          documentName: true,
          documentSizeBytes: true,
          senderUserId: true,
          kind: true,
          createdAt: true,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
    ]);

    // The counterpart's mode is his ROLE IN THIS CONVERSATION, not his activeMode: the
    // inbox applies no mode filter, so a réparateur can be the client in one thread and
    // the réparateur in another. Design §3.1.
    const recipientMode = counterpartUserId === row.clientUserId ? 'CLIENT' : 'REPAIRER';

    // The sender's own name as the recipient sees him, and the demande title as the
    // subject -- the two facts the copy needs. Read here rather than snapshotted from a
    // wider select above, because `send` is a write path and this is one query on it.
    const sender = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { username: true, repairerProfile: { select: { displayName: true } } },
    });

    // After the transaction. A notification must not be able to roll back a message,
    // and emit() never throws -- so a failure here loses one row and nothing else.
    await this.notifications.emit({
      userId: counterpartUserId,
      mode: recipientMode,
      type: 'MESSAGE_RECEIVED',
      // The name the RECIPIENT knows him by, routed through publicIdentity. The
      // displayName applies only when the sender is the réparateur in this thread.
      actorName: sender
        ? publicIdentity({
            username: sender.username,
            displayName: recipientMode === 'CLIENT' ? (sender.repairerProfile?.displayName ?? null) : null,
          })
        : null,
      conversationId,
      messageId: message.id,
      demandeId: row.demandeId ?? undefined,
      subject: row.demande?.title ?? 'Demande de devis',
      // CF-44. The push body; never stored on the row (see EmitInput.messagePreview).
      messagePreview:
        message.body ||
        (message.photoPath ? '📷 Photo' : '') ||
        (message.documentPath ? '📄 Document' : ''),
    });

    let photoUrl: string | null = null;
    let document: DocumentDto | null = null;

    if (message.photoPath || message.documentPath) {
      const signed = await signAttachmentUrls(
        {
          photo: message.photoPath ? [message.photoPath] : [],
          document: message.documentPath ? [message.documentPath] : [],
        },
        AVATAR_READ_TTL_SECONDS,
      );
      if (message.photoPath) {
        photoUrl = signed.get(message.photoPath) ?? null;
      }
      if (message.documentPath) {
        document = {
          url: signed.get(message.documentPath) ?? '',
          name: message.documentName ?? 'document.pdf',
          sizeBytes: message.documentSizeBytes ?? null,
        };
      }
    }

    return {
      id: message.id,
      body: message.body,
      photoUrl,
      document,
      kind: 'USER',
      mine: true,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
