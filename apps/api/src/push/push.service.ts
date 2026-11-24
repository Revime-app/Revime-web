import { Injectable } from '@nestjs/common';
import {
  pushMessageFor,
  type CronJobResult,
  type NotificationCopyInput,
  type PushRoutingIds,
  type RegisterPushTokenInput,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { sideUserWhere } from '../review-accounts/review-account.js';
import { BadgeService } from './badge.service.js';
import { pushSender, soundFor, type PushMessage } from './sender.js';

/**
 * Everything `emit` knows about the row, plus who it is for and the row id (null on the message
 * FOLD path, where `updateMany` returns no id). Deliberately NOT in `packages/shared`: an internal
 * API between two services, not a wire contract.
 */
export type PushDispatchInput = NotificationCopyInput &
  PushRoutingIds & { userId: string; notificationId: string | null };

/**
 * `CF-44`. Spec: docs/superpowers/specs/2026-09-07-cf-44-push-notifications-design.md §5, §7, §8.
 *
 * Depends on Prisma and the sender only - NEVER on NotificationsService - so the module graph
 * stays acyclic: Prisma ← Push ← { Notifications, Cron }.
 */
@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badge?: BadgeService,
  ) {}

  /** Expo: receipts are reliably available about 15 minutes after the send … */
  static readonly RECEIPT_DELAY_MS = 15 * 60_000;
  /** … and are cleared after 24 hours. A ticket with no receipt past that is dropped as resolved. */
  static readonly RECEIPT_EXPIRY_MS = 24 * 60 * 60_000;

  /**
   * Send one notification to every enabled token of its recipient.
   *
   * **NEVER THROWS - enforced, not documented**, and called DETACHED (`void`) by `emit`, so a
   * rejection here would be an unhandled one. The whole body is inside the try for that reason.
   * A push that fails loses one banner; the in-app row it was about already exists - with ONE
   * exception: on `emitMessage`'s P2002 DROP arm (a duplicate unread row read between retries)
   * the row is dropped and the push still fires with `notificationId: null`. That is deliberate:
   * the message is real and the tap routes to the conversation where it lives; only the bell will
   * not corroborate the banner. Spec §5.2.
   */
  async dispatch(input: PushDispatchInput): Promise<number> {
    try {
      const tokens = await this.prisma.pushToken.findMany({
        // PUB-33 (DECP-23): a store-review account is never pushed, so its tokens are never read.
        where: { userId: input.userId, disabledAt: null, user: sideUserWhere(false) },
        select: { id: true, token: true, soundChannel: true },
      });
      if (tokens.length === 0) return 0;

      let badge: number | undefined;
      if (this.badge) {
        try {
          badge = await this.badge.countFor(input.userId);
        } catch (e) {
          console.error('[push] countFor failed for user %s: %s', input.userId, e);
        }
      }

      const content = pushMessageFor(input, input.notificationId);
      const messages: PushMessage[] = tokens.map((t) => {
        const sound = soundFor(t.soundChannel, input.type);
        return {
          to: t.token,
          ...content,
          ...(typeof badge === 'number' ? { badge } : {}),
          ...sound,
        };
      });
      const tickets = await pushSender().send(messages);

      const ticketRows: { id: string; tokenId: string }[] = [];
      const dead: string[] = [];
      tickets.forEach((t, i) => {
        const token = tokens[i]!;
        if (t.status === 'ok') {
          ticketRows.push({ id: t.id, tokenId: token.id });
        } else if (t.error === 'DeviceNotRegistered') {
          // Expo already knows this device is gone: disable now rather than wait for a receipt.
          dead.push(token.id);
        } else {
          console.error(
            '[push] ticket error %s for token %s: %s',
            t.error,
            token.id,
            t.message,
          );
        }
      });

      if (ticketRows.length > 0) {
        await this.prisma.pushTicket.createMany({
          data: ticketRows,
          skipDuplicates: true,
        });
      }
      if (dead.length > 0) {
        await this.prisma.pushToken.updateMany({
          where: { id: { in: dead } },
          data: { disabledAt: new Date() },
        });
      }
      // Tickets Expo accepted, so a caller that must report delivery (the admin broadcast)
      // can tell a user reached from a user whose every token was refused.
      return ticketRows.length;
    } catch (error) {
      // Loud, because nothing retries this.
      console.error(
        '[push] dispatch failed for user %s type %s',
        input.userId,
        input.type,
        error,
      );
      return 0;
    }
  }

  /**
   * Spec §7. Upsert on the TOKEN, not on [userId, token]: a push token identifies a device
   * installation, so when Bob signs in on Alice's old phone his registration takes the token
   * over. `disabledAt: null` re-enables a token Expo had reported gone. Idempotent - the app
   * calls this on every cold start.
   */
  async register(userId: string, input: RegisterPushTokenInput): Promise<void> {
    const soundChannel = input.sound ?? null;
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        soundChannel,
      },
      update: {
        userId,
        platform: input.platform,
        soundChannel,
        lastSeenAt: new Date(),
        disabledAt: null,
      },
    });
  }

  /** Ownership in the WHERE; zero rows deleted is not an error (the sign-out's intent is met). */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
  }

  /**
   * Spec §8. The cron job: fetch receipts for tickets old enough to have one, act on each,
   * and drop the ticket. `InvalidCredentials` is a `failed`, not a quiet delete - the cron
   * response is where « the client's APNs key is not uploaded yet » becomes visible.
   */
  async receipts(
    now: Date = new Date(),
  ): Promise<Omit<CronJobResult, 'job' | 'error'>> {
    const tickets = await this.prisma.pushTicket.findMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - PushService.RECEIPT_DELAY_MS),
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 1000, // Expo's per-request cap on receipt ids
      select: { id: true, tokenId: true, createdAt: true },
    });
    if (tickets.length === 0) return { scanned: 0, acted: 0, failed: 0 };

    const got = await pushSender().receipts(tickets.map((t) => t.id));

    let acted = 0;
    let failed = 0;
    let invalidCredentials = 0;
    const resolved: string[] = [];
    const dead: string[] = [];

    for (const t of tickets) {
      const r = got[t.id];
      if (r === undefined) {
        if (
          now.getTime() - t.createdAt.getTime() >
          PushService.RECEIPT_EXPIRY_MS
        ) {
          resolved.push(t.id);
          acted++;
        }
        continue;
      }
      resolved.push(t.id);
      if (r.status === 'ok') {
        acted++;
      } else if (r.error === 'DeviceNotRegistered') {
        dead.push(t.tokenId);
        acted++;
      } else if (r.error === 'InvalidCredentials') {
        failed++;
        invalidCredentials++;
      } else {
        failed++;
        console.error(
          '[push] receipt %s for ticket %s: %s',
          r.error,
          t.id,
          r.message,
        );
      }
    }

    if (invalidCredentials > 0) {
      console.error(
        '[push] %d receipt(s) InvalidCredentials - the APNs key is not uploaded to the Expo project yet (spec §10.3)',
        invalidCredentials,
      );
    }
    if (dead.length > 0) {
      await this.prisma.pushToken.updateMany({
        where: { id: { in: dead } },
        data: { disabledAt: now },
      });
    }
    if (resolved.length > 0) {
      await this.prisma.pushTicket.deleteMany({
        where: { id: { in: resolved } },
      });
    }
    return { scanned: tickets.length, acted, failed };
  }
}
