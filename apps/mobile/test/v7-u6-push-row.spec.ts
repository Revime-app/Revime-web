import { describe, expect, it } from 'vitest';
import { pushRowState } from '../src/lib/push-row';

/**
 * V7 A5 (U6). The « Notifications push » row in Paramètres → Notifications. Before U6 it read the
 * permission alone, so a granted permission with no registered token said « Activées », and its
 * refusal hint named « Réglages iOS » on Android too.
 */
describe('pushRowState (V7 A5)', () => {
  it('names the Android settings after a refusal on Android, and opens them', () => {
    const row = pushRowState({ permission: 'denied', registration: 'idle', platform: 'android' });
    expect(row).toMatchObject({ value: 'Désactivées', action: 'settings', tone: 'warn' });
    expect(row.sub).toContain('paramètres de votre téléphone');
    expect(row.sub).not.toContain('iOS');
  });

  it('keeps the iOS wording on iOS', () => {
    const row = pushRowState({ permission: 'denied', registration: 'idle', platform: 'ios' });
    expect(row.sub).toContain('Réglages iOS');
    expect(row.action).toBe('settings');
  });

  it('offers to ask when the permission was never asked', () => {
    expect(pushRowState({ permission: 'undetermined', registration: 'idle', platform: 'android' })).toMatchObject({
      value: 'Activer',
      action: 'register',
      sub: null,
    });
  });

  it('says « Activées » only once this phone is registered', () => {
    expect(pushRowState({ permission: 'granted', registration: 'registered', platform: 'android' })).toMatchObject({
      value: 'Activées',
      action: null,
      sub: null,
    });
  });

  it('says the phone could not be registered, and retries on a tap', () => {
    const row = pushRowState({ permission: 'granted', registration: 'failed', platform: 'android' });
    expect(row).toMatchObject({ value: 'Non disponibles', action: 'register', tone: 'warn' });
    expect(row.sub).toBeTruthy();
  });

  it('shows no value while the registration is running', () => {
    expect(pushRowState({ permission: 'granted', registration: 'pending', platform: 'android' })).toMatchObject({
      value: null,
      action: null,
    });
  });

  it('registers on a tap when the permission is granted but nothing was tried yet', () => {
    expect(pushRowState({ permission: 'granted', registration: 'idle', platform: 'ios' })).toMatchObject({
      value: null,
      action: 'register',
    });
  });

  it('shows nothing before the permission is read', () => {
    expect(pushRowState({ permission: null, registration: 'idle', platform: 'ios' })).toMatchObject({
      value: null,
      action: null,
      sub: null,
    });
  });
});
