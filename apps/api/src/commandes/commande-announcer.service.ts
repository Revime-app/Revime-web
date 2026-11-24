import { Injectable } from '@nestjs/common';
import { publicIdentity, type NotificationType } from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { systemMessageFor, type AnnounceEvent } from '../conversations/system-message.js';

/**
 * CF4-17 (design §E). The notification each `AnnounceEvent` fans out to both parties, or
 * `null` when the event is already notified elsewhere:
 * - `FUNDS_RELEASED`: `CommandesService.emitFundsReleased` already sent it (release path).
 * - `DISPUTE_REFUNDED`: `RefundService` already sends `COMMANDE_REFUNDED` for a refund.
 * - `REFUNDED`: same as above - `RefundService` owns `COMMANDE_REFUNDED` for a plain refund.
 * `DISPUTE_RELEASED` maps to `FUNDS_RELEASED` because a dispute resolved in the réparateur's
 * favour IS a funds release; there is no separate "dispute funds released" notification type.
 * `Record` rather than a switch so a member added to `AnnounceEvent` without a row here is a
 * compile error.
 */
const NOTIFY_FOR: Record<AnnounceEvent, NotificationType | null> = {
  FUNDS_RELEASED: null,
  DISPUTE_OPENED: 'DISPUTE_OPENED',
  DISPUTE_RELEASED: 'FUNDS_RELEASED',
  DISPUTE_REFUNDED: null,
  DISPUTE_DISMISSED: 'DISPUTE_DISMISSED',
  REFUNDED: null,
};

type CommandeParties = { clientUserId: string; repairerUserId: string; demandeId?: string | null };

/**
 * CF4-17 (design §E). The single place a commande lifecycle event becomes both a system
 * message in the parties' conversation and a notification pair. Temporary duplication of
 * `CommandesService.postSystemMessage`'s body: Task 3 removes the private original and
 * rewires its callers to this class, so both copies exist for exactly one task.
 */
@Injectable()
export class CommandeAnnouncer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * CF3-10: Post milestone updates as system messages directly into the conversation thread.
   * Copied verbatim from `CommandesService.postSystemMessage` (log prefix becomes `[announcer]`).
   */
  async postSystemMessage(parties: CommandeParties, body: string): Promise<void> {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          clientUserId: parties.clientUserId,
          repairerUserId: parties.repairerUserId,
          deletedAt: null,
          ...(parties.demandeId ? { demandeId: parties.demandeId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!conversation) return;

      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: now },
        }),
        this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderUserId: null,
            kind: 'SYSTEM',
            body,
            createdAt: now,
          },
        }),
      ]);
    } catch (e) {
      console.error('[announcer] postSystemMessage error:', e);
    }
  }

  /**
   * Loads the commande, posts the event's system message, and notifies both parties per
   * `NOTIFY_FOR` (skipping a `null` row - that event is already notified elsewhere). ONE
   * `try` around the whole method: never throws into the caller, per constraints.md. The
   * message post has its own inner try (via `postSystemMessage`) so a message failure still
   * lets the notifications go out.
   */
  async announce(
    commandeId: string,
    event: AnnounceEvent,
    partialRefundCents?: number | null,
    opts?: { openerUserId?: string },
  ): Promise<void> {
    try {
      const commande = await this.prisma.commande.findUnique({
        where: { id: commandeId },
        select: {
          id: true,
          clientUserId: true,
          repairerUserId: true,
          demandeId: true,
          repairCents: true,
          transferredCents: true,
          demande: { select: { title: true } },
          client: { select: { username: true } },
          repairer: { select: { username: true, repairerProfile: { select: { displayName: true } } } },
        },
      });
      if (!commande) return;

      await this.postSystemMessage(commande, systemMessageFor(event, partialRefundCents));

      const type = NOTIFY_FOR[event];
      if (type === null) return;

      const subject = commande.demande.title;
      // `FUNDS_RELEASED` alone carries an amount - the one field the copy needs beyond the
      // subject and the commande id.
      const amountCents =
        type === 'FUNDS_RELEASED' ? commande.transferredCents ?? commande.repairCents : undefined;

      if (event === 'DISPUTE_OPENED' && opts?.openerUserId) {
        const isClientOpener = opts.openerUserId === commande.clientUserId;
        const recipient = isClientOpener
          ? { userId: commande.repairerUserId, mode: 'REPAIRER' as const }
          : { userId: commande.clientUserId, mode: 'CLIENT' as const };
        const actorName = isClientOpener
          ? publicIdentity({ username: commande.client.username, displayName: null })
          : publicIdentity({
              username: commande.repairer.username,
              displayName: commande.repairer.repairerProfile?.displayName ?? null,
            });

        await this.notifications.emit({
          ...recipient,
          type,
          subject,
          commandeId: commande.id,
          actorName,
          ...(amountCents !== undefined ? { amountCents } : {}),
        });
        return;
      }

      for (const side of [
        { userId: commande.clientUserId, mode: 'CLIENT' as const },
        { userId: commande.repairerUserId, mode: 'REPAIRER' as const },
      ]) {
        await this.notifications.emit({
          ...side,
          type,
          subject,
          commandeId: commande.id,
          ...(amountCents !== undefined ? { amountCents } : {}),
        });
      }
    } catch (e) {
      console.error('[announcer] announce error:', e);
    }
  }
}
