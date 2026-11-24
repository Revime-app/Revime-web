import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const store = new Map<string, string>();
let getItemThrows = false;
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => {
    if (getItemThrows) throw new Error('keystore unavailable');
    return store.get(k) ?? null;
  },
  setItem: (k: string, v: string) => void store.set(k, v),
}));

/**
 * V7 `FND7-072` / `ISS7-040`. The client's Android APK could not sign anyone in: the device label
 * « Android · application Revime » carries U+00B7, and Expo's native `fetch` on Android (OkHttp)
 * throws on any header value outside printable ASCII, so every Better Auth request failed before it
 * left the phone. iOS accepts the byte, which is why only Android broke.
 *
 * OkHttp's rule (`Headers.checkValue`): each char is `\t` or 0x20..0x7E. These specs hold every
 * header the app adds to that rule on every platform, and make sure a header problem can never
 * stop an auth request again.
 */
const OKHTTP_VALUE = /^[\t\x20-\x7E]*$/;

async function freshHeaders(os: string, isPad = false) {
  // A fresh device-id module (its header cache is per launch), and the `react-native` mock instance
  // that fresh module will import, so the platform set here is the one it reads.
  vi.resetModules();
  const rn = (await import('react-native')) as unknown as { Platform: { OS: string; isPad?: boolean } };
  rn.Platform.OS = os;
  rn.Platform.isPad = isPad;
  return import('../src/lib/device-id');
}

describe('device headers on Android (FND7-072)', () => {
  beforeEach(() => {
    store.clear();
    getItemThrows = false;
  });

  it.each([
    ['android', false],
    ['ios', false],
    ['ios', true],
    ['web', false],
  ])('every header value is one OkHttp accepts (%s, iPad %s)', async (os, isPad) => {
    const { deviceHeaders } = await freshHeaders(os, isPad);
    for (const [name, value] of Object.entries(deviceHeaders())) {
      expect(name, name).toMatch(OKHTTP_VALUE);
      expect(value, `${name}: ${value}`).toMatch(OKHTTP_VALUE);
    }
  });

  it('still names the phone in the label', async () => {
    const { deviceHeaders } = await freshHeaders('android');
    expect(deviceHeaders()['x-revime-device-label']).toMatch(/^Android .*application Revime$/);
  });

  it('never throws when the secure store fails on a later call', async () => {
    const { deviceHeaders } = await freshHeaders('android');
    deviceHeaders();
    getItemThrows = true;
    expect(() => deviceHeaders()).not.toThrow();
  });

  it('applyDeviceHeaders never lets a header failure block the request', async () => {
    const { applyDeviceHeaders } = await freshHeaders('android');
    const refusing = {
      set: () => {
        throw new TypeError('Unexpected char 0xb7');
      },
    };
    expect(() => applyDeviceHeaders(refusing)).not.toThrow();
  });

  it('applyDeviceHeaders sets both headers when it can', async () => {
    const { applyDeviceHeaders } = await freshHeaders('android');
    const set = new Map<string, string>();
    applyDeviceHeaders({ set: (n: string, v: string) => void set.set(n, v) });
    expect([...set.keys()].sort()).toEqual(['x-revime-device', 'x-revime-device-label']);
  });

  it('the auth client adds the headers only through applyDeviceHeaders', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/lib/auth-client.ts'), 'utf8');
    expect(src).toMatch(/applyDeviceHeaders\(context\.headers\)/);
    expect(src).not.toMatch(/deviceHeaders\(\)/);
  });
});
