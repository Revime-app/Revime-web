import { createHash, randomBytes } from 'node:crypto';
import { DEVICE_ID_HEADER, DEVICE_LABEL_HEADER } from '@revime/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * V7 A11 (U2b). Which device a password login comes from, and whether it earns a « Nouvelle
 * connexion » e-mail (CLIENT_FEEDBACK_V7.md §4 A11, U2b design round Q1, Q3, Q11, Q12):
 * - the app names itself with `x-revime-device` (from the end-of-round build; the id lives in its
 *   secure store and survives sign-out); without that header an app request has no device;
 * - a browser (the dashboard) is named by the long-lived `revime_device` cookie, which sign-out
 *   does not touch;
 * - an unknown device is mailed, except the one the account signed up on; a device unseen for
 *   180 days is unknown again; at most 3 such e-mails per account per 24 h.
 */

export const DEVICE_COOKIE = 'revime_device';
/**
 * 400 days, the most a cookie may live (RFC 6265bis; Better Auth refuses more). Sign-out keeps it, so
 * only clearing the browser, or 400 days, makes a dashboard device new.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
export const KNOWN_DEVICE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const NEW_DEVICE_MAIL_CAP = 3;
const MAIL_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;
const LABEL_MAX = 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export type ClientDevice = { id: string; label: string };

export function newBrowserDeviceId(): string {
  return randomBytes(24).toString('base64url');
}

/** The only form stored: an id a database reader could replay would let him skip the e-mail. */
export function hashDeviceId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

function cookieValue(headers: Headers, name: string): string | null {
  const raw = headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function readDevice(headers: Headers | undefined | null, isApp: boolean): ClientDevice | null {
  if (!headers) return null;
  if (isApp) {
    const id = headers.get(DEVICE_ID_HEADER);
    if (!id || !ID_PATTERN.test(id)) return null;
    const label = (headers.get(DEVICE_LABEL_HEADER) ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, LABEL_MAX);
    return { id, label: label || 'Application Revime' };
  }
  const id = cookieValue(headers, DEVICE_COOKIE);
  if (!id || !ID_PATTERN.test(id)) return null;
  return { id, label: `${labelFromUserAgent(headers.get('user-agent') ?? '')} · tableau de bord` };
}

/** « Chrome sur Windows », from the user agent. Order matters: Edge also says Chrome, Chrome also says Safari. */
export function labelFromUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'Mac'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (!browser) return 'Navigateur';
  return os ? `${browser} sur ${os}` : browser;
}

export interface DeviceStore {
  find(userId: string, deviceHash: string): Promise<{ lastSeenAt: Date } | null>;
  save(userId: string, deviceHash: string, label: string, now: Date, notified: boolean): Promise<void>;
  notifiedSince(userId: string, since: Date): Promise<number>;
  forgetAll(userId: string): Promise<void>;
}

export async function recordDevice(
  store: DeviceStore,
  args: { userId: string; device: ClientDevice; now: Date; silent: boolean },
): Promise<{ notify: boolean }> {
  const { userId, device, now, silent } = args;
  const hash = hashDeviceId(device.id);
  const known = await store.find(userId, hash);
  const isNew = !known || now.getTime() - known.lastSeenAt.getTime() >= KNOWN_DEVICE_TTL_MS;
  const notify =
    isNew &&
    !silent &&
    (await store.notifiedSince(userId, new Date(now.getTime() - MAIL_CAP_WINDOW_MS))) < NEW_DEVICE_MAIL_CAP;
  await store.save(userId, hash, device.label, now, notify);
  return { notify };
}

type PrismaLike = Pick<PrismaClient, 'knownDevice'>;

export class PrismaDeviceStore implements DeviceStore {
  constructor(private readonly prisma: PrismaLike) {}

  find(userId: string, deviceHash: string) {
    return this.prisma.knownDevice.findUnique({
      where: { userId_deviceHash: { userId, deviceHash } },
      select: { lastSeenAt: true },
    });
  }

  async save(userId: string, deviceHash: string, label: string, now: Date, notified: boolean) {
    await this.prisma.knownDevice.upsert({
      where: { userId_deviceHash: { userId, deviceHash } },
      create: { userId, deviceHash, label, firstSeenAt: now, lastSeenAt: now, notifiedAt: notified ? now : null },
      update: { label, lastSeenAt: now, ...(notified ? { notifiedAt: now } : {}) },
    });
  }

  notifiedSince(userId: string, since: Date) {
    return this.prisma.knownDevice.count({ where: { userId, notifiedAt: { gte: since } } });
  }

  async forgetAll(userId: string) {
    await this.prisma.knownDevice.deleteMany({ where: { userId } });
  }
}
