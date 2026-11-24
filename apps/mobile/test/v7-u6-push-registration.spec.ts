import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({
  Platform: platform,
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const notifications = vi.hoisted(() => ({
  status: 'granted',
  token: vi.fn(),
}));
vi.mock('expo-notifications', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: notifications.status }),
  requestPermissionsAsync: async () => ({ status: notifications.status }),
  setNotificationChannelAsync: async () => null,
  deleteNotificationChannelAsync: async () => {},
  getExpoPushTokenAsync: notifications.token,
  setBadgeCountAsync: async () => true,
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));
const putJson = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/api', () => ({ api: { putJson, get: vi.fn(), post: vi.fn() } }));

import {
  onPushRegistrationChange,
  pushRegistrationState,
  registerForPush,
  unregisterPush,
} from '../src/lib/push';

/**
 * V7 A5 (U6). `registerForPush` swallowed every failure, so the Paramètres row said « Activées »
 * on the client's Android phone while no token existed. The module now remembers how its last
 * attempt ended, so the row can tell « registered » from « permission granted, nothing registered ».
 */
describe('push registration state (V7 A5)', () => {
  beforeEach(async () => {
    await unregisterPush();
    notifications.status = 'granted';
    notifications.token.mockReset();
    putJson.mockReset();
    platform.OS = 'android';
  });

  it('is « failed » when Android has no Firebase and the token request rejects', async () => {
    notifications.token.mockRejectedValue(new Error('Default FirebaseApp is not initialized'));
    await registerForPush('user-1');
    expect(pushRegistrationState()).toBe('failed');
    expect(putJson).not.toHaveBeenCalled();
  });

  it('is « registered » once the token reaches the API', async () => {
    notifications.token.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    putJson.mockResolvedValue(null);
    await registerForPush('user-1');
    expect(pushRegistrationState()).toBe('registered');
    expect(putJson).toHaveBeenCalledWith(
      '/notifications/push-token',
      expect.objectContaining({ token: 'ExponentPushToken[abc]', platform: 'ANDROID' }),
    );
  });

  it('is « failed » when the API refuses the token', async () => {
    notifications.token.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    putJson.mockRejectedValue(new Error('500'));
    await registerForPush('user-1');
    expect(pushRegistrationState()).toBe('failed');
  });

  it('stays « idle » when the permission is refused: nothing was tried', async () => {
    notifications.status = 'denied';
    await registerForPush('user-1');
    expect(pushRegistrationState()).toBe('idle');
    expect(notifications.token).not.toHaveBeenCalled();
  });

  it('tells a listener each change, and stops after it unsubscribes', async () => {
    notifications.token.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    putJson.mockResolvedValue(null);
    const seen: string[] = [];
    const off = onPushRegistrationChange((s) => seen.push(s));
    await registerForPush('user-1');
    expect(seen).toEqual(['pending', 'registered']);
    off();
    await unregisterPush();
    expect(seen).toEqual(['pending', 'registered']);
    expect(pushRegistrationState()).toBe('idle');
  });
});
