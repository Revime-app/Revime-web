import type { NotificationType } from './notification.schemas.js';

/**
 * `CF4-36`. The client's five REVIME notification sounds, one per kind of event.
 * Spec: docs/superpowers/specs/2026-10-02-cf4-36-notification-sounds-design.md §2-§3.
 *
 * The server picks the sound per push (the OS plays it while the app is closed or locked), the app
 * bundles the files and creates one Android channel per sound. Both read this module, so they
 * cannot disagree on a file name or channel id.
 *
 * 🛑 Never edit a shipped sound file in place: an Android channel's sound is fixed once created, and
 * installed builds bundle the old file. A different sound needs a NEW file name AND a NEW channel id
 * (and a new capability value, so old builds are never sent a file they lack).
 */
export type PushSoundKey =
  | 'notification'
  | 'message'
  | 'offre_recue'
  | 'offre_acceptee'
  | 'litige';

export const PUSH_SOUND_KEYS: readonly PushSoundKey[] = [
  'notification',
  'message',
  'offre_recue',
  'offre_acceptee',
  'litige',
];

/** Sent by builds that bundle the five files. Builds 20-23 send `'revime'` (the placeholder). */
export const PUSH_SOUND_CAPABILITY = 'revime-v2' as const;

export type PushSoundFile = `revime_${PushSoundKey}.wav`;
export type PushSoundChannelId = `revime_${PushSoundKey}`;

export function pushSoundFile(key: PushSoundKey): PushSoundFile {
  return `revime_${key}.wav`;
}

export function pushSoundChannelId(key: PushSoundKey): PushSoundChannelId {
  return `revime_${key}`;
}

/** Shown to the user in Android's notification settings. */
export const PUSH_SOUND_CHANNEL_NAME: Record<PushSoundKey, string> = {
  notification: 'Notifications',
  message: 'Messages',
  offre_recue: 'Offres reçues',
  offre_acceptee: 'Offre acceptée',
  litige: 'Litiges',
};

/**
 * A specific sound means exactly one kind of event; everything else is the general sound. No
 * catch-all branch: a new `NotificationType` does not compile until someone chooses its sound.
 */
export function soundKeyFor(type: NotificationType): PushSoundKey {
  switch (type) {
    // Also a réparateur's answer to a private quote: it is an ordinary offer.
    case 'OFFER_RECEIVED':
      return 'offre_recue';
    case 'OFFER_ACCEPTED':
      return 'offre_acceptee';
    case 'MESSAGE_RECEIVED':
      return 'message';
    // DISPUTE_MESSAGE is REVIME writing in a confidential dispute space: more urgent than a chat.
    case 'DISPUTE_OPENED':
    case 'DISPUTE_DISMISSED':
    case 'DISPUTE_MESSAGE':
      return 'litige';
    case 'OFFER_DECLINED':
    case 'COMMANDE_STEP':
    case 'FUNDS_RELEASED':
    case 'PAYOUT_WAITING':
    case 'COMMANDE_REFUNDED':
    case 'PAYMENT_ABANDONED':
    case 'DEMANDE_UPDATED':
    case 'DEMANDE_WITHDRAWN':
    case 'DEMANDE_MODERATED':
    case 'PARCEL_LABEL_READY':
    case 'PARCEL_SHIPPED':
    case 'PARCEL_OUT_FOR_DELIVERY':
    case 'PARCEL_AT_PICKUP_POINT':
    case 'PARCEL_DELIVERED':
    case 'PARCEL_INCIDENT':
    case 'IDENTITY_VERIFIED':
    case 'IDENTITY_DOCUMENTS_REQUIRED':
    case 'VERIFICATION_REVOKED':
    case 'COMMANDE_PARTIALLY_REFUNDED':
    case 'QUOTE_REQUESTED':
    case 'QUOTE_DECLINED':
    case 'QUOTE_EXPIRED':
    case 'QUOTE_REFUSED':
    case 'CANCELLATION_REQUESTED':
    case 'CANCELLATION_WITHDRAWN':
    case 'CANCELLATION_REFUSED':
    case 'BUSINESS_VERIFIED':
    case 'BUSINESS_REFUSED':
    case 'BUSINESS_DOCUMENTS_REQUIRED':
    case 'FISCAL_DECLARATION_REQUIRED':
    case 'DAC7_ANNUAL_RECAP_SENT':
    // V8 E1. A setup nudge, the same quiet sound as the other setup notices.
    case 'SETUP_REMINDER':
      return 'notification';
    default: {
      const unhandled: never = type;
      throw new Error(`No push sound for notification type ${String(unhandled)}`);
    }
  }
}
