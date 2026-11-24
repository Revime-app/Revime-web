import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { admin, emailOTP, twoFactor } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { AuthThrottle } from '../../src/auth/throttle/auth-throttle.js';
import {
  clearLockAfterPasswordReset,
  throttleAfter,
  throttleBefore,
  type LockEffects,
  type ThrottleDeps,
} from '../../src/auth/throttle/hooks.js';
import type { DeviceStore } from '../../src/auth/devices/device.js';
import { MemoryThrottleStore } from './memory-throttle-store.js';

/**
 * V7 U2 / U2b. A REAL Better Auth instance (memory adapter) running the same hook functions
 * `auth.ts` installs. V6 lesson: a spec that mocks the auth library proves nothing about it.
 */
export const PASSWORD = 'correct-horse-1';
export const IP = '203.0.113.7';

export type Recorded = {
  locked: Parameters<LockEffects['accountLocked']>[0][];
  ip: Parameters<LockEffects['ipBlocked']>[0][];
  resets: string[];
  devices: Parameters<LockEffects['newDevice']>[0][];
};

export class MemoryDeviceStore implements DeviceStore {
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

export function setupAuthHarness() {
  let now = new Date('2026-10-28T10:00:00.000Z');
  const store = new MemoryThrottleStore();
  const devices = new MemoryDeviceStore();
  const recorded: Recorded = { locked: [], ip: [], resets: [], devices: [] };
  const effects: LockEffects = {
    accountLocked: async (e) => void recorded.locked.push(e),
    ipBlocked: async (e) => void recorded.ip.push(e),
    unlockedByPasswordReset: async (e) => void recorded.resets.push(e.userId),
    newDevice: async (e) => void recorded.devices.push(e),
  };
  const deps: ThrottleDeps = { throttle: new AuthThrottle(store, () => now), effects, devices };
  const resetMails: string[] = [];
  const otps: string[] = [];
  const db = { user: [], session: [], account: [], verification: [], twoFactor: [] } as Record<string, unknown[]>;

  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: 'a-test-secret-that-is-long-enough-1234567890',
    baseURL: 'http://localhost:3000',
    trustedOrigins: ['revime://'],
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ token }) => void resetMails.push(token),
      onPasswordReset: async ({ user }) => clearLockAfterPasswordReset(user, deps),
    },
    plugins: [
      admin({ adminRoles: ['super_admin'], roles: { super_admin: adminAc, user: userAc } }),
      twoFactor({ issuer: 'test' }),
      emailOTP({ sendVerificationOTP: async ({ otp }) => void otps.push(otp) }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => throttleBefore(ctx, deps)),
      after: createAuthMiddleware(async (ctx) => throttleAfter(ctx, deps)),
    },
  });

  const headers = (ip = IP, extra: Record<string, string> = {}) => new Headers({ 'x-forwarded-for': ip, ...extra });

  async function signUp(email: string, role?: string, extra: Record<string, string> = {}) {
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'Test' }, headers: headers(IP, extra) });
    if (role) {
      const row = (db.user as Array<Record<string, unknown>>).find((u) => u.email === email)!;
      row.role = role;
    }
  }

  async function signIn(email: string, password: string, ip = IP, extra: Record<string, string> = {}) {
    try {
      const res = await auth.api.signInEmail({ body: { email, password }, headers: headers(ip, extra), returnHeaders: true });
      return { ok: true as const, res };
    } catch (err) {
      if (err instanceof APIError) return { ok: false as const, code: (err.body as { code?: string })?.code, err };
      throw err;
    }
  }

  return {
    auth,
    db,
    deps,
    store,
    devices,
    recorded,
    resetMails,
    otps,
    headers,
    signUp,
    signIn,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
  };
}
