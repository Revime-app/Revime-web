import { randomUUID } from 'node:crypto';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import {
  PUSH_SOUND_CAPABILITY,
  pushSoundChannelId,
  pushSoundFile,
  soundKeyFor,
  type NotificationType,
  type PushData,
  type PushSoundChannelId,
  type PushSoundFile,
} from '@revime/shared';

/**
 * `CF-44`. The push driver, the repo's driver shape (`sms/otp.service.ts`, `mail/mail.service.ts`,
 * `shipping/gateway.ts`). Spec: docs/superpowers/specs/2026-09-07-cf-44-push-notifications-design.md §4.
 *
 * PUSH_DRIVER absent or unrecognised selects `console`, which logs and sends nothing - the safe
 * direction, as for STRIPE_DRIVER, SMS_DRIVER, STORAGE_DRIVER and SHIPPING_DRIVER. `expo` is the
 * only sender that leaves the process. `fake` records for the unit suite.
 *
 * Unlike `otpSender()`, `expo` needs NO credential here and presence-checks nothing: the APNs key
 * is uploaded to the Expo project, not to Render. `EXPO_ACCESS_TOKEN` is optional (Expo's
 * « enhanced push security »), unset today (spec §12).
 */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: PushData;
  badge?: number;
  sound?: PushSound;
  channelId?: PushChannel;
};

/** `'revime.wav'` / `'revime'` = the builds-20-23 placeholder; the rest are the client's files. */
export type PushSound = 'default' | 'revime.wav' | PushSoundFile;
export type PushChannel = 'default' | 'revime' | PushSoundChannelId;

/**
 * `CF4-36`. The notification sound (iOS) and Android channel for one push, from what the token's
 * build bundles (`PushToken.soundChannel`) and the notification type. Spec
 * docs/superpowers/specs/2026-10-02-cf4-36-notification-sounds-design.md §4:
 * - `'revime-v2'` → the client's sound for this type (`soundKeyFor`);
 * - `'revime'` → builds 20-23, which bundle only the placeholder, whatever the type;
 * - anything else → the system default (older builds).
 */
export function soundFor(
  soundChannel: string | null | undefined,
  type: NotificationType,
): { sound: PushSound; channelId: PushChannel } {
  if (soundChannel === PUSH_SOUND_CAPABILITY) {
    const key = soundKeyFor(type);
    return { sound: pushSoundFile(key), channelId: pushSoundChannelId(key) };
  }
  return soundChannel === 'revime'
    ? { sound: 'revime.wav', channelId: 'revime' }
    : { sound: 'default', channelId: 'default' };
}

export type PushTicketResult =
  | { status: 'ok'; id: string }
  | { status: 'error'; error: string | null; message: string };

export type PushReceipt =
  { status: 'ok' } | { status: 'error'; error: string | null; message: string };

export interface PushSender {
  /**
   * One result per message, in order. A per-message problem is a `status: 'error'` result;
   * a whole-request problem (network, 429, 5xx) THROWS, and the caller decides.
   */
  send(messages: PushMessage[]): Promise<PushTicketResult[]>;
  /** Ids Expo has no receipt for are simply absent from the map, as Expo returns them. */
  receipts(ids: string[]): Promise<Record<string, PushReceipt>>;
}

export type PushDriver = 'console' | 'expo' | 'fake';

/** The single reader of PUSH_DRIVER. */
export function pushDriver(): PushDriver {
  const v = process.env.PUSH_DRIVER;
  return v === 'expo' || v === 'fake' ? v : 'console';
}

class ConsolePushSender implements PushSender {
  async send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    return messages.map((m) => {
      console.log('[push:console] → %s · %s · %s', m.to, m.title, m.body);
      return { status: 'ok' as const, id: `console:${randomUUID()}` };
    });
  }

  async receipts(): Promise<Record<string, PushReceipt>> {
    return {};
  }
}

/**
 * Test-only recorder. `calls` is appended SYNCHRONOUSLY inside `send`, before any await, so a
 * test can assert a DETACHED dispatch without flushing the event loop. `tickets` scripts the
 * per-message answer; `rejectWith` makes the whole request reject, for the never-throws tests.
 */
export const fakePush = {
  calls: [] as PushMessage[][],
  receipts: {} as Record<string, PushReceipt>,
  tickets: null as ((m: PushMessage, i: number) => PushTicketResult) | null,
  rejectWith: null as Error | null,
  reset(): void {
    this.calls = [];
    this.receipts = {};
    this.tickets = null;
    this.rejectWith = null;
  },
};

class FakePushSender implements PushSender {
  send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    fakePush.calls.push(messages);
    if (fakePush.rejectWith) return Promise.reject(fakePush.rejectWith);
    return Promise.resolve(
      messages.map(
        (m, i) =>
          fakePush.tickets?.(m, i) ?? {
            status: 'ok' as const,
            id: `fake:${i}:${m.to}`,
          },
      ),
    );
  }

  async receipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    const out: Record<string, PushReceipt> = {};
    for (const id of ids) {
      const r = fakePush.receipts[id];
      if (r !== undefined) out[id] = r;
    }
    return out;
  }
}

class ExpoPushSender implements PushSender {
  private readonly client = new Expo(
    process.env.EXPO_ACCESS_TOKEN
      ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
      : {},
  );

  async send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    // Filled by index below. `forEach` over a sparse array skips holes, so a missing ticket would be
    // silently dropped - unreachable today only because expo-server-sdk throws on a ticket-count
    // mismatch (build/ExpoClient.js). Vendor behaviour props up this loop; hence the note.
    const results: PushTicketResult[] = new Array(messages.length);
    const valid: { index: number; message: ExpoPushMessage }[] = [];

    messages.forEach((m, index) => {
      // The zod schema on the route makes this unreachable for stored tokens; kept so a
      // malformed row can never 400 a whole batch. Reported as DeviceNotRegistered so the
      // caller disables it once instead of re-logging it on every emit.
      if (!Expo.isExpoPushToken(m.to)) {
        results[index] = {
          status: 'error',
          error: 'DeviceNotRegistered',
          message: 'not an Expo push token',
        };
        return;
      }
      valid.push({
        index,
        // sound and channelId per spec §4 and CF4-36. Badge per CF4-35 (§4.8).
        message: {
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          ...(typeof m.badge === 'number' ? { badge: m.badge } : {}),
          sound: m.sound ?? 'default',
          channelId: m.channelId ?? 'default',
          // Android: 'revime' channel created on SDK 57 app launch (spec §4.9).
        },
      });
    });

    // Chunked by hand rather than through chunkPushNotifications, so each ticket maps back to
    // its message index: Expo answers tickets in request order.
    const size = Expo.pushNotificationChunkSizeLimit;
    for (let i = 0; i < valid.length; i += size) {
      const slice = valid.slice(i, i + size);
      const tickets = await this.client.sendPushNotificationsAsync(
        slice.map((v) => v.message),
      );
      tickets.forEach((t, j) => {
        results[slice[j]!.index] =
          t.status === 'ok'
            ? { status: 'ok', id: t.id }
            : {
                status: 'error',
                error: t.details?.error ?? null,
                message: t.message,
              };
      });
    }
    return results;
  }

  async receipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    const out: Record<string, PushReceipt> = {};
    for (const chunk of this.client.chunkPushNotificationReceiptIds(ids)) {
      const got = await this.client.getPushNotificationReceiptsAsync(chunk);
      for (const [id, r] of Object.entries(got)) {
        out[id] =
          r.status === 'ok'
            ? { status: 'ok' }
            : {
                status: 'error',
                error: r.details?.error ?? null,
                message: r.message,
              };
      }
    }
    return out;
  }
}

let instance: PushSender | undefined;

export function pushSender(): PushSender {
  if (instance === undefined) {
    const driver = pushDriver();
    instance =
      driver === 'expo'
        ? new ExpoPushSender()
        : driver === 'fake'
          ? new FakePushSender()
          : new ConsolePushSender();
  }
  return instance;
}

/** Test-only. The factory memoises, so a test changing PUSH_DRIVER must clear it. */
export function __resetPushSender(): void {
  instance = undefined;
}
