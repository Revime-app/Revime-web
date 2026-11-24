import { Injectable } from '@nestjs/common';
import type {
  CommandeStep,
  MeResponse,
  NotificationDto,
  NotificationType,
} from '@revime/shared';
import { NOTIFICATION_GROUP_BY_TYPE } from '@revime/shared';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';

type Mode = MeResponse['profile']['activeMode'];

/**
 * What a caller supplies to raise a notification. Deliberately NOT in
 * `packages/shared`: this is an internal API between services, not a wire contract, and
 * putting it in shared would imply the app can construct one.
 *
 * Every optional field is normalised to `null` on the way in - see `emit`.
 */
export type EmitInput = {
  userId: string;
  /** The RECIPIENT's role for this event, not the app's current mode. Design §3.1. */
  mode: Mode;
  type: NotificationType;
  actorName?: string | null;
  subject?: string | null;
  amountCents?: number | null;
  step?: CommandeStep | null;
  demandeId?: string | null;
  commandeId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  /**
   * `CF-44`. The message body, for the PUSH body only. Passed by the one MESSAGE_RECEIVED emit
   * site, consumed by `pushMessageFor`, NEVER written to `Notification` - the row still joins
   * the body at read time so a moderation soft-delete reaches the in-app surface (design §3.5).
   * A push is a transient banner shown the instant the message exists; nothing about it persists.
   */
  messagePreview?: string | null;
};

/**
 * A cap with no pagination. Stated rather than left implicit: a user with more than this
 * many notifications cannot reach the next one, which is accepted for V1 because nothing
 * in production is within two orders of magnitude of it. Design §5.1.
 */
const LIST_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Raise one notification. **NEVER THROWS - enforced, not merely documented**, exactly as
   * `commandes/ops-mail.ts` states for the same reason.
   *
   * The load-bearing call site is the Stripe webhook: `payments.service.ts` emits inside
   * `checkout.session.completed`, where a throw releases Stripe's claim and re-enters the
   * compensation path. A notification that could not be written must never cause a payment
   * to be reprocessed. So it logs loudly - nothing will retry this - and returns.
   */
  async emit(input: EmitInput): Promise<void> {
    try {
      // CF-47. One check for all notification types: this is the single entry point, and
      // MESSAGE_RECEIVED branches BELOW this line, so the fold path is covered too. CF-44's
      // push dispatch is also below it, so a muted group sends no push either.
      if (!(await this.wants(input.userId, input.type))) return;

      if (input.type === 'MESSAGE_RECEIVED') {
        const id = await this.emitMessage(input);
        this.dispatch(input, id);
        return;
      }
      const created = await this.prisma.notification.create({
        data: this.row(input),
        select: { id: true },
      });
      this.dispatch(input, created?.id ?? null);
    } catch (error) {
      // Loud, because there is no retry and no queue behind this.
      console.error(
        '[notifications] failed to emit %s for user %s',
        input.type,
        input.userId,
        error,
      );
    }
  }

  /**
   * Absent and null collapse to ONE representation, and it is `null`. The rule
   * `apps/mobile/AGENTS.md` records twice as load-bearing, applied at the boundary rather
   * than at each of the 11 call sites.
   */
  private row(input: EmitInput) {
    return {
      userId: input.userId,
      mode: input.mode,
      type: input.type,
      actorName: input.actorName ?? null,
      subject: input.subject ?? null,
      amountCents: input.amountCents ?? null,
      step: input.step ?? null,
      demandeId: input.demandeId ?? null,
      commandeId: input.commandeId ?? null,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
    };
  }

  /**
   * `CF-44`. Hand the row to the push path DETACHED: not awaited, so every write path keeps the
   * latency it has today and the Stripe webhook never waits on Expo. `PushService.dispatch`
   * never throws (enforced there), so the `void` promise cannot become an unhandled rejection.
   * Tokens are resolved inside dispatch, so a recipient with none costs one indexed read.
   */
  private dispatch(input: EmitInput, notificationId: string | null): void {
    void this.push.dispatch({
      ...this.row(input),
      notificationId,
      messagePreview: input.messagePreview ?? null,
    });
  }

  /**
   * `CF-47`. Whether this recipient still wants this group.
   *
   * 🛑 FAILS OPEN, and that is the load-bearing half. This runs inside `emit()`'s try,
   * which is called from the Stripe webhook - so a database hiccup here must not be
   * able to silently mute a payment notification. Returning true on failure means the
   * worst case is a notification the user muted, not a missing one about money.
   *
   * One indexed read per emit. Stated rather than hidden: `emit` already writes, so
   * this is one extra round trip on a path that was never a single query.
   */
  private async wants(
    userId: string,
    type: EmitInput['type'],
  ): Promise<boolean> {
    try {
      const prefs = await this.prisma.profile.findFirst({
        where: { userId, deletedAt: null },
        select: {
          notifyOffers: true,
          notifyMessages: true,
          notifyCommandes: true,
        },
      });
      // No profile row is not a reason to drop a notification either.
      if (!prefs) return true;

      switch (NOTIFICATION_GROUP_BY_TYPE[type]) {
        case 'offers':
          return prefs.notifyOffers;
        case 'messages':
          return prefs.notifyMessages;
        case 'commandes':
          return prefs.notifyCommandes;
        // CF4-E §5 (E5). Verification outcomes decide whether a réparateur can work at all,
        // so there is no preference to silence them by - unlike the other three groups,
        // `account` has no `notify*` column and this always returns true.
        case 'account':
          return true;
        default:
          // Unreachable while NOTIFICATION_GROUP_BY_TYPE stays total over NotificationType.
          // Exists to guard against runtime drift: if someone later adds a notification type but
          // forgets to map it, this throws, the outer catch logs it, and we fail open rather
          // than silently suppressing.
          throw new Error(`Unmapped notification group for type: ${type}`);
      }
    } catch (error) {
      console.warn(
        '[notifications] preference read failed for user %s; sending anyway',
        userId,
        error,
      );
      return true;
    }
  }

  /**
   * The one type whose emit is not a plain insert. The partial unique index permits at most
   * one UNREAD row per conversation, so a twentieth message must fold into the row already
   * there rather than add a twentieth. Design §3.3 and §5.3.
   *
   * Update-then-insert, with a P2002 arm on the insert: two sends arriving together can
   * both see `count: 0`, and the index - not this code - is what decides which one wins.
   * Étape 5 piece 1 shipped `getOrCreate` without such an arm and that is recorded as the
   * cause of a bug, which is why this is not optional.
   */
  private async emitMessage(input: EmitInput): Promise<string | null> {
    if ((await this.foldIntoUnread(input)) > 0) return null;

    try {
      const created = await this.prisma.notification.create({
        data: this.row(input),
        select: { id: true },
      });
      return created?.id ?? null;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent send inserted between the update above and this create. Its row is
      // now the one to fold into; if THAT update also finds nothing the row was read in
      // the same instant, and dropping this notification is the correct outcome.
      const folded = await this.foldIntoUnread(input);
      // FIX 5: Log when a notification is dropped on the P2002 path, so an operator
      // can tell it apart from a message that never notified.
      if (folded === 0) {
        console.warn(
          '[notifications] dropped MESSAGE_RECEIVED for conversation %s message %s: row was read between retries',
          input.conversationId,
          input.messageId,
        );
      }
      return null;
    }
  }

  /** Returns the number of rows folded into: 1 when one existed, 0 otherwise. */
  private async foldIntoUnread(input: EmitInput): Promise<number> {
    // FIX 6: Guard against undefined conversationId. Prisma treats `conversationId:
    // undefined` in a where as NO FILTER, so the updateMany would match ANY of that
    // user's unread MESSAGE_RECEIVED rows and overwrite the wrong conversation's
    // messageId. Unreachable today because the one caller always passes it, but the
    // type permits the mistake.
    if (input.conversationId === undefined) {
      return 0;
    }

    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId: input.userId,
        conversationId: input.conversationId,
        type: 'MESSAGE_RECEIVED',
        readAt: null,
      },
      data: {
        messageId: input.messageId ?? null,
        actorName: input.actorName ?? null,
        subject: input.subject ?? null,
        // Re-stamped so the row sorts as new activity. The whole point of collapsing is
        // that the thread reads as one recent event, not one stale one.
        createdAt: new Date(),
      },
    });
    return count;
  }

  /**
   * The list, newest first, capped at LIST_LIMIT.
   *
   * Two queries rather than one: the rows, then the bodies for whichever of them are
   * message rows. The body is JOINED rather than snapshotted so that a moderation
   * soft-delete takes effect here too - design §3.5 - and `deletedAt: null` in the second
   * query is the whole of that mechanism.
   */
  async list(userId: string, mode: Mode): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, mode },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    if (rows.length === 0) return [];

    const messageIds = rows
      .map((r) => r.messageId)
      .filter((id): id is string => id !== null);

    const bodies = new Map<string, string>();
    if (messageIds.length > 0) {
      const messages = await this.prisma.message.findMany({
        // deletedAt: null is NOT tidying. It is what makes an operator's soft-delete
        // reach this surface, which has no operator page of its own.
        where: { id: { in: messageIds }, deletedAt: null },
        select: { id: true, body: true },
      });
      for (const m of messages) bodies.set(m.id, m.body);
    }

    return rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      type: r.type,
      actorName: r.actorName,
      subject: r.subject,
      amountCents: r.amountCents,
      step: r.step,
      // Null both when there is no message and when one was removed. The copy builder
      // treats the two alike, which is correct: neither has a body to show.
      messagePreview:
        r.messageId === null ? null : (bodies.get(r.messageId) ?? null),
      demandeId: r.demandeId,
      commandeId: r.commandeId,
      conversationId: r.conversationId,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** What the bell reads. One count, served by the [userId, mode, readAt] index. */
  async unreadCount(userId: string, mode: Mode): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, mode, readAt: null },
    });
  }

  /**
   * Ownership is in the WHERE, so another user's id changes nothing and discloses nothing -
   * the pattern `offers.service.ts` uses for the same reason.
   *
   * `updateMany` and NOT `update`: zero rows updated is **not an error**. An already-read
   * row, or an id that never existed, both mean the tap's intent is satisfied. The same
   * reasoning `commandes.service.ts` gives for its own step write.
   */
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Scoped to ONE mode: clearing the client's bell must not clear the réparateur's. */
  async markAllRead(userId: string, mode: Mode): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, mode, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * FIX 7: Mark a user's unread MESSAGE_RECEIVED notification for a conversation as
   * read. Non-throwing, matching `emit`'s contract. Used by `markRead` in
   * conversations.service.ts so that opening a thread clears its notification.
   */
  async markConversationNotificationRead(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          conversationId,
          type: 'MESSAGE_RECEIVED',
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    } catch (error) {
      console.error(
        '[notifications] failed to mark conversation notification read for user %s conversation %s',
        userId,
        conversationId,
        error,
      );
    }
  }
}
