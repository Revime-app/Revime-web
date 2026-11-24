import { z } from "zod";
import {
  notificationCopy,
  type NotificationCopyInput,
  type NotificationDto,
  type NotificationType,
} from "./notification.schemas.js";
import { modeSchema } from "./user.schemas.js";

/**
 * `CF-44`, push notifications. Spec: docs/superpowers/specs/2026-09-07-cf-44-push-notifications-design.md §6.
 *
 * The wire contract for the two token routes, and the ONE builder that turns a notification
 * into a push message. The French is NOT here: `title` and `body` are `notificationCopy()`'s
 * `title` and `sub`, so a push and its in-app row read the same words (the 2026-08-20 design's
 * rule that no French notification string exists outside that one function still holds).
 */

/** Keep in step with `enum PushPlatform` in `schema.prisma`; `push-platform-parity.spec.ts` enforces both directions. */
export const pushPlatformSchema = z.enum(["IOS", "ANDROID"]);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

/**
 * Both spellings Expo's SDK accepts (`Expo.isExpoPushToken`). No whitespace and no `]` inside
 * the brackets, and a length cap, so a malformed row can never reach a batch that would 400 the
 * whole request. The Expo sender checks `isExpoPushToken` once more before sending.
 */
export const pushTokenSchema = z
  .string()
  .max(200)
  .regex(
    /^Expo(nent)?PushToken\[[^\]\s]+\]$/,
    "Jeton de notification invalide.",
  );

export const registerPushTokenSchema = z.object({
  token: pushTokenSchema,
  platform: pushPlatformSchema,
  // CF4-36: 'revime' = builds 20-23 (placeholder), 'revime-v2' = the client's five sounds
  // (`PUSH_SOUND_CAPABILITY`). Anything else is refused, never stored and later misread.
  sound: z.enum(['revime', 'revime-v2']).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({ token: pushTokenSchema });
export type UnregisterPushTokenInput = z.infer<
  typeof unregisterPushTokenSchema
>;

/** The three routing ids, nullable, exactly as `Notification` stores them. */
export type PushRoutingIds = Pick<
  NotificationDto,
  "demandeId" | "commandeId" | "conversationId"
>;

/**
 * What the phone reads off a push. EXACTLY what `destinationFor()` needs plus `mode` (so a
 * cross-mode tap can switch first) and the row id (so a tap can mark it read). Nothing else:
 * Expo caps the payload at 4096 bytes. `notificationId` is null on the message FOLD path,
 * where `updateMany` returns no id - the conversation screen marks that row read on open.
 */
export type PushData = {
  notificationId: string | null;
  type: NotificationType;
  mode: z.infer<typeof modeSchema>;
  demandeId: string | null;
  commandeId: string | null;
  conversationId: string | null;
};

export type PushMessageContent = {
  title: string;
  body: string;
  data: PushData;
  badge?: number;
};

/** Code points, not UTF-16 units. Long enough for a sentence, short for a lock screen. */
export const PUSH_PREVIEW_MAX = 120;

/**
 * The message body as a push body. `Array.from`, NOT `.slice`: a slice counts UTF-16 units and
 * can cut an astral-plane emoji in half, leaving a lone surrogate that iOS renders as �. Code
 * points keep every emoji and every NFC-composed `é` whole. Grapheme clusters joined with ZWJ
 * may still be cut - accepted and stated in the spec §6.
 */
export function truncatePreview(
  text: string | null | undefined,
): string | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const points = Array.from(trimmed);
  if (points.length <= PUSH_PREVIEW_MAX) return trimmed;
  return (
    points
      .slice(0, PUSH_PREVIEW_MAX - 1)
      .join("")
      .trimEnd() + "…"
  );
}

export function pushMessageFor(
  input: NotificationCopyInput & PushRoutingIds,
  notificationId: string | null,
): PushMessageContent {
  const copy = notificationCopy({
    ...input,
    messagePreview: truncatePreview(input.messagePreview),
  });
  return {
    title: copy.title,
    body: copy.sub,
    data: {
      notificationId,
      type: input.type,
      mode: input.mode,
      // `?? null` at the boundary: absence has ONE representation on the wire.
      demandeId: input.demandeId ?? null,
      commandeId: input.commandeId ?? null,
      conversationId: input.conversationId ?? null,
    },
  };
}
