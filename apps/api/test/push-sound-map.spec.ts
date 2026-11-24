import { describe, expect, it } from 'vitest';
import {
  notificationTypeSchema,
  PUSH_SOUND_CAPABILITY,
  PUSH_SOUND_CHANNEL_NAME,
  PUSH_SOUND_KEYS,
  pushSoundChannelId,
  pushSoundFile,
  registerPushTokenSchema,
  soundKeyFor,
  type NotificationType,
} from '@revime/shared';

/**
 * `CF4-36`. Spec docs/superpowers/specs/2026-10-02-cf4-36-notification-sounds-design.md §2-§3.
 * The client's five sounds, one per kind of event; the mapping is the owner's (2026-10-02).
 */
describe('push sound map (CF4-36)', () => {
  const SPECIFIC: Partial<Record<NotificationType, string>> = {
    OFFER_RECEIVED: 'offre_recue',
    OFFER_ACCEPTED: 'offre_acceptee',
    MESSAGE_RECEIVED: 'message',
    DISPUTE_OPENED: 'litige',
    DISPUTE_DISMISSED: 'litige',
    DISPUTE_MESSAGE: 'litige',
  };

  it('maps every NotificationType to a known key', () => {
    for (const t of notificationTypeSchema.options) {
      expect(PUSH_SOUND_KEYS).toContain(soundKeyFor(t));
    }
  });

  it('pins the name-based mappings', () => {
    expect(soundKeyFor('OFFER_RECEIVED')).toBe('offre_recue');
    expect(soundKeyFor('OFFER_ACCEPTED')).toBe('offre_acceptee');
    expect(soundKeyFor('MESSAGE_RECEIVED')).toBe('message');
    expect(soundKeyFor('DISPUTE_OPENED')).toBe('litige');
    expect(soundKeyFor('DISPUTE_DISMISSED')).toBe('litige');
  });

  it('pins the three judgement calls', () => {
    expect(soundKeyFor('DISPUTE_MESSAGE')).toBe('litige');
    expect(soundKeyFor('QUOTE_REQUESTED')).toBe('notification');
    expect(soundKeyFor('FUNDS_RELEASED')).toBe('notification');
  });

  it('everything else is notification', () => {
    for (const t of notificationTypeSchema.options) {
      if (SPECIFIC[t] !== undefined) continue;
      expect(soundKeyFor(t), t).toBe('notification');
    }
  });

  it('keys in order', () => {
    expect(PUSH_SOUND_KEYS).toEqual([
      'notification',
      'message',
      'offre_recue',
      'offre_acceptee',
      'litige',
    ]);
  });

  it('file and channel shapes', () => {
    expect(pushSoundFile('litige')).toBe('revime_litige.wav');
    expect(pushSoundChannelId('litige')).toBe('revime_litige');
    for (const k of PUSH_SOUND_KEYS) {
      // Android res/raw: lower case, digits and underscore only, starting with a letter.
      expect(pushSoundFile(k).replace(/\.wav$/, '')).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(pushSoundChannelId(k)).toBe(`revime_${k}`);
    }
  });

  it('channel names', () => {
    expect(PUSH_SOUND_CHANNEL_NAME).toEqual({
      notification: 'Notifications',
      message: 'Messages',
      offre_recue: 'Offres reçues',
      offre_acceptee: 'Offre acceptée',
      litige: 'Litiges',
    });
    expect(new Set(Object.values(PUSH_SOUND_CHANNEL_NAME)).size).toBe(5);
  });

  it('capability', () => {
    expect(PUSH_SOUND_CAPABILITY).toBe('revime-v2');
  });

  it('schema accepts revime-v2 and revime, omitted, rejects others', () => {
    const base = { token: 'ExponentPushToken[abc]', platform: 'IOS' as const };
    expect(registerPushTokenSchema.safeParse({ ...base, sound: 'revime-v2' }).success).toBe(true);
    expect(registerPushTokenSchema.safeParse({ ...base, sound: 'revime' }).success).toBe(true);
    expect(registerPushTokenSchema.safeParse(base).success).toBe(true);
    expect(registerPushTokenSchema.safeParse({ ...base, sound: 'revime-v3' }).success).toBe(false);
    expect(registerPushTokenSchema.safeParse({ ...base, sound: '' }).success).toBe(false);
  });
});
