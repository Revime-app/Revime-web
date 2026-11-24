import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({
  Platform: platform,
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const calls = vi.hoisted(() => [] as string[]);
const perm = vi.hoisted(() => ({
  current: { status: 'denied', canAskAgain: true },
  afterRequest: { status: 'granted', canAskAgain: true },
}));
vi.mock('expo-notifications', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => {
    calls.push('get');
    return perm.current;
  },
  requestPermissionsAsync: async () => {
    calls.push('request');
    return perm.afterRequest;
  },
  setNotificationChannelAsync: async (id: string) => {
    calls.push(`channel:${id}`);
    return null;
  },
  deleteNotificationChannelAsync: async () => {},
  getExpoPushTokenAsync: async () => {
    calls.push('token');
    return { data: 'ExponentPushToken[android]' };
  },
  setBadgeCountAsync: async () => true,
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));
const putJson = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/api', () => ({ api: { putJson, get: vi.fn(), post: vi.fn() } }));

import { pushRegistrationState, registerForPush, unregisterPush } from '../src/lib/push';

/**
 * V7 `FND7-076` / `ISS7-041`. The client, 2026-11-11: « les notifications ne fonctionnent pas ».
 * Production has never held a single ANDROID push token, the owner's phone included.
 *
 * `expo-notifications` on Android 13+ (`NotificationPermissionsModule.getPermissionsWithPromiseImplApi33`)
 * answers `DENIED`, not `UNDETERMINED`, for a permission that was NEVER asked: notifications are off
 * until `POST_NOTIFICATIONS` is granted, and its `!areEnabled -> DENIED` branch wins. `registerForPush`
 * asked only on `UNDETERMINED`, so on Android it never asked and returned quietly. The emulator showed
 * it: `POST_NOTIFICATIONS granted=false`, `userSet=false`, no channel, no `[push]` log line.
 *
 * Now it asks whenever the permission is not granted and the OS still allows asking (Expo's own
 * pattern), and creates the Android channels first (Expo: the prompt « will not appear until at
 * least one notification channel is created »).
 */
describe('Android push permission (FND7-076)', () => {
  beforeEach(async () => {
    await unregisterPush();
    calls.length = 0;
    putJson.mockReset();
    putJson.mockResolvedValue(null);
    platform.OS = 'android';
    perm.current = { status: 'denied', canAskAgain: true };
    perm.afterRequest = { status: 'granted', canAskAgain: true };
  });

  it('asks on Android when Expo reports a never-asked permission as denied, then registers', async () => {
    await registerForPush('user-1');
    expect(calls).toContain('request');
    expect(pushRegistrationState()).toBe('registered');
    expect(putJson).toHaveBeenCalledWith(
      '/notifications/push-token',
      expect.objectContaining({ token: 'ExponentPushToken[android]', platform: 'ANDROID' }),
    );
  });

  it('creates the Android channels before it asks', async () => {
    await registerForPush('user-1');
    const firstChannel = calls.findIndex((c) => c.startsWith('channel:'));
    expect(firstChannel).toBeGreaterThanOrEqual(0);
    expect(firstChannel).toBeLessThan(calls.indexOf('request'));
  });

  it('does not ask when the OS no longer allows it, and stays idle', async () => {
    perm.current = { status: 'denied', canAskAgain: false };
    await registerForPush('user-1');
    expect(calls).not.toContain('request');
    expect(calls).not.toContain('token');
    expect(pushRegistrationState()).toBe('idle');
  });

  it('stays idle when the user refuses the prompt', async () => {
    perm.afterRequest = { status: 'denied', canAskAgain: true };
    await registerForPush('user-1');
    expect(calls).toContain('request');
    expect(calls).not.toContain('token');
    expect(pushRegistrationState()).toBe('idle');
  });

  it('does not ask again when already granted', async () => {
    perm.current = { status: 'granted', canAskAgain: true };
    await registerForPush('user-1');
    expect(calls).not.toContain('request');
    expect(pushRegistrationState()).toBe('registered');
  });

  it('on iOS asks only while undetermined and creates no channel', async () => {
    platform.OS = 'ios';
    perm.current = { status: 'undetermined', canAskAgain: true };
    await registerForPush('user-1');
    expect(calls).toContain('request');
    expect(calls.some((c) => c.startsWith('channel:'))).toBe(false);
    expect(putJson).toHaveBeenCalledWith(
      '/notifications/push-token',
      expect.objectContaining({ platform: 'IOS' }),
    );
  });
});
