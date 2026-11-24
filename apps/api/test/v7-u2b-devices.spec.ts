import { describe, expect, it } from 'vitest';
import {
  hashDeviceId,
  labelFromUserAgent,
  readDevice,
  recordDevice,
  type DeviceStore,
} from '../src/auth/devices/device.js';

/**
 * V7 A11 (U2b, Q1 / Q3 / Q11 / Q12). Recognising a device and deciding whether a password login
 * from it earns a « Nouvelle connexion » e-mail: unknown device → yes, except at sign-up; a device
 * unseen for 180 days is unknown again; at most 3 such e-mails per account per 24 h.
 */
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-10-28T10:00:00.000Z');
const ID = 'a'.repeat(32);

class MemoryDeviceStore implements DeviceStore {
  rows: Array<{ userId: string; deviceHash: string; label: string; lastSeenAt: Date; notifiedAt: Date | null }> = [];
  async find(userId: string, deviceHash: string) {
    return this.rows.find((r) => r.userId === userId && r.deviceHash === deviceHash) ?? null;
  }
  async save(userId: string, deviceHash: string, label: string, now: Date, notified: boolean) {
    const row = await this.find(userId, deviceHash);
    if (row) {
      row.lastSeenAt = now;
      row.label = label;
      if (notified) row.notifiedAt = now;
    } else this.rows.push({ userId, deviceHash, label, lastSeenAt: now, notifiedAt: notified ? now : null });
  }
  async notifiedSince(userId: string, since: Date) {
    return this.rows.filter((r) => r.userId === userId && r.notifiedAt && r.notifiedAt >= since).length;
  }
  async forgetAll(userId: string) {
    this.rows = this.rows.filter((r) => r.userId !== userId);
  }
}

describe('readDevice', () => {
  it('takes the app’s id and label from its headers', () => {
    const h = new Headers({ 'x-revime-device': ID, 'x-revime-device-label': 'iPhone · application Revime' });
    expect(readDevice(h, true)).toEqual({ id: ID, label: 'iPhone · application Revime' });
  });

  it('gives the app no device without the header, even with a cookie (today’s builds, Q1)', () => {
    expect(readDevice(new Headers({ cookie: `revime_device=${ID}` }), true)).toBeNull();
  });

  it('takes a browser’s id from its cookie and names it from the user agent', () => {
    const h = new Headers({
      cookie: `foo=1; revime_device=${ID}`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    });
    expect(readDevice(h, false)).toEqual({ id: ID, label: 'Chrome sur Windows · tableau de bord' });
  });

  it('refuses an id that is too short or carries odd characters, and trims a long label', () => {
    expect(readDevice(new Headers({ 'x-revime-device': 'short' }), true)).toBeNull();
    expect(readDevice(new Headers({ 'x-revime-device': `${'b'.repeat(31)}<` }), true)).toBeNull();
    const long = readDevice(new Headers({ 'x-revime-device': ID, 'x-revime-device-label': 'x'.repeat(200) }), true);
    expect(long!.label).toHaveLength(60);
    expect(readDevice(new Headers({ 'x-revime-device': ID }), true)!.label).toBe('Application Revime');
  });
});

describe('labelFromUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari sur Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox sur Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge sur Windows'],
    ['', 'Navigateur'],
  ])('%s', (ua, expected) => {
    expect(labelFromUserAgent(ua)).toBe(expected);
  });
});

describe('recordDevice', () => {
  const device = { id: ID, label: 'iPhone · application Revime' };

  it('mails for a device it has never seen, and not the second time', async () => {
    const store = new MemoryDeviceStore();
    expect(await recordDevice(store, { userId: 'u1', device, now: T0, silent: false })).toEqual({ notify: true });
    expect(await recordDevice(store, { userId: 'u1', device, now: new Date(T0.getTime() + DAY), silent: false })).toEqual({ notify: false });
    expect(store.rows[0]!.deviceHash).toBe(hashDeviceId(ID));
    expect(store.rows[0]!.deviceHash).not.toContain(ID);
  });

  it('records the sign-up device silently', async () => {
    const store = new MemoryDeviceStore();
    expect(await recordDevice(store, { userId: 'u1', device, now: T0, silent: true })).toEqual({ notify: false });
    expect(await recordDevice(store, { userId: 'u1', device, now: T0, silent: false })).toEqual({ notify: false });
  });

  it('treats a device unseen for 180 days as new again', async () => {
    const store = new MemoryDeviceStore();
    await recordDevice(store, { userId: 'u1', device, now: T0, silent: true });
    expect(await recordDevice(store, { userId: 'u1', device, now: new Date(T0.getTime() + 179 * DAY), silent: false })).toEqual({ notify: false });
    expect(await recordDevice(store, { userId: 'u1', device, now: new Date(T0.getTime() + 360 * DAY), silent: false })).toEqual({ notify: true });
  });

  it('mails at most 3 new devices per 24 h, and still records the rest', async () => {
    const store = new MemoryDeviceStore();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        (await recordDevice(store, { userId: 'u1', device: { id: `${i}`.repeat(32), label: 'x' }, now: T0, silent: false })).notify,
      );
    }
    expect(results).toEqual([true, true, true, false, false]);
    expect(store.rows).toHaveLength(5);
    expect(
      (await recordDevice(store, { userId: 'u1', device: { id: '9'.repeat(32), label: 'x' }, now: new Date(T0.getTime() + DAY + 1), silent: false })).notify,
    ).toBe(true);
  });

  it('keeps each account’s devices apart', async () => {
    const store = new MemoryDeviceStore();
    await recordDevice(store, { userId: 'u1', device, now: T0, silent: true });
    expect(await recordDevice(store, { userId: 'u2', device, now: T0, silent: false })).toEqual({ notify: true });
  });
});
