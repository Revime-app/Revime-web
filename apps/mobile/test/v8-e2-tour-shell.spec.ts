import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourState } from '@revime/shared';

/** V8 E2 (`FND8-027`): what the tour waits for, and the copy of its state kept on the device. */

const store = new Map<string, string>();
const storeFails = vi.hoisted(() => ({ get: false, set: false }));
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => {
    if (storeFails.get) throw new Error('keychain locked');
    return store.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (storeFails.set) throw new Error('keychain locked');
    store.set(k, v);
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));
const permission = vi.hoisted(() => ({ request: null as null | ((s: { status: string }) => void) }));
vi.mock('expo-notifications', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }),
  requestPermissionsAsync: () => new Promise((res) => (permission.request = res)),
  setNotificationChannelAsync: async () => null,
  deleteNotificationChannelAsync: async () => {},
  getExpoPushTokenAsync: vi.fn(),
  setBadgeCountAsync: async () => true,
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } }));
vi.mock('../src/lib/api', () => ({ api: { putJson: vi.fn(), get: vi.fn(), post: vi.fn() } }));

import { readTourCopy, writeTourCopy } from '../src/lib/tour-storage';
import { tourGateOpen } from '../src/lib/tour';

const flush = () => new Promise((r) => setTimeout(r, 0));
const STATE: TourState = { CLIENT: { offer: 'STARTED', seen: ['accueil'], updatedAt: '2026-11-17T20:00:00.000Z' }, REPAIRER: null };

describe('device copy', () => {
  beforeEach(() => {
    store.clear();
    storeFails.get = false;
    storeFails.set = false;
  });

  it('round-trips the state per user', () => {
    writeTourCopy('u1', STATE);
    expect(readTourCopy('u1')).toEqual(STATE);
    expect(readTourCopy('u2')).toBeNull();
  });

  it('device copy survives a failed save', () => {
    writeTourCopy('u1', STATE);
    storeFails.set = true;
    expect(() => writeTourCopy('u1', { CLIENT: null, REPAIRER: null })).not.toThrow();
    storeFails.set = false;
    expect(readTourCopy('u1')).toEqual(STATE);
  });

  it('reads null when the keychain throws or the value is not JSON', () => {
    storeFails.get = true;
    expect(readTourCopy('u1')).toBeNull();
    storeFails.get = false;
    store.set('tour_state_u1', '{not json');
    expect(readTourCopy('u1')).toBeNull();
  });
});

describe('tourGateOpen', () => {
  it('opens only once the platform status is known and no blocking screen is up', () => {
    expect(tourGateOpen({ view: 'none', statusKnown: true })).toBe(true);
    expect(tourGateOpen({ view: 'banner', statusKnown: true })).toBe(true);
    expect(tourGateOpen({ view: 'screen', statusKnown: true })).toBe(false);
    expect(tourGateOpen({ view: 'reaccept', statusKnown: true })).toBe(false);
    expect(tourGateOpen({ view: 'none', statusKnown: false })).toBe(false);
  });
});

describe('waitForPushPrompt', () => {
  beforeEach(() => {
    vi.resetModules();
    permission.request = null;
  });
  afterEach(() => vi.useRealTimers());

  it('resolves once the OS prompt is answered, not before', async () => {
    const push = await import('../src/lib/push');
    void push.registerForPush('u1');
    let resolved = false;
    void push.waitForPushPrompt(60_000).then(() => (resolved = true));
    for (let i = 0; i < 20 && permission.request === null; i++) await flush();
    expect(permission.request).not.toBeNull();
    await flush();
    expect(resolved).toBe(false);
    permission.request!({ status: 'denied' });
    await flush();
    await flush();
    expect(resolved).toBe(true);
  });

  it('resolves at once after a prompt already settled on this launch', async () => {
    const push = await import('../src/lib/push');
    void push.registerForPush('u1');
    for (let i = 0; i < 20 && permission.request === null; i++) await flush();
    permission.request!({ status: 'granted' });
    await flush();
    let resolved = false;
    void push.waitForPushPrompt(60_000).then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(true);
  });

  it('resolves by the timeout when no registration ever starts', async () => {
    vi.useFakeTimers();
    const push = await import('../src/lib/push');
    let resolved = false;
    void push.waitForPushPrompt(4000).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(3999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });
});

describe('MaintenanceGate wiring', () => {
  it('provides its view and whether the status is known to the tour', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/MaintenanceGate.tsx'), 'utf8');
    expect(src).toMatch(/<MaintenanceViewContext\.Provider value=\{maintenanceViewValue\}>/);
    expect(src).toMatch(/statusKnown: status !== null/);
  });
});

describe('review fix I2: the timeout never cuts an OS prompt that is still on screen', () => {
  beforeEach(() => {
    vi.resetModules();
    permission.request = null;
  });
  afterEach(() => vi.useRealTimers());

  it('waits past the timeout while the prompt is in flight, then resolves when it is answered', async () => {
    vi.useFakeTimers();
    const push = await import('../src/lib/push');
    void push.registerForPush('u1');
    for (let i = 0; i < 20 && permission.request === null; i++) await vi.advanceTimersByTimeAsync(0);
    expect(permission.request).not.toBeNull();
    let resolved = false;
    void push.waitForPushPrompt(4000).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resolved).toBe(false);
    permission.request!({ status: 'granted' });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it('the provider starts waiting only once a page is focused (the tabs have mounted)', () => {
    const src = readFileSync(resolve(__dirname, '../src/tour/TourProvider.tsx'), 'utf8');
    expect(src).toMatch(/if \(userId === null \|\| !anyPageFocused\) return;/);
  });
});
