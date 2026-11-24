import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationService } from '../src/verification/verification.service.js';
import { AuthThrottle } from '../src/auth/throttle/auth-throttle.js';
import type { LockEffects, ThrottleDeps } from '../src/auth/throttle/hooks.js';
import { AppException } from '../src/common/app-exception.js';
import { MemoryThrottleStore } from './helpers/memory-throttle-store.js';

/**
 * V7 A11 (U2, Q5): wrong SMS codes count on the same code ladder as wrong e-mail codes. 5 wrong
 * codes lock code checks for 15 minutes; the user sees the lock, not a Twilio round trip.
 */
const USER = { id: 'u1', email: 'Ana@Example.com', name: 'Ana', role: 'user' };

const check = vi.fn(async (): Promise<'rejected'> => 'rejected');
vi.mock('../src/sms/otp.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sms/otp.service.js')>()),
  otpSender: () => ({ start: vi.fn(), check }),
}));

function setup() {
  check.mockClear();
  const prisma = {
    verificationAttempt: {
      findFirst: vi.fn(async () => ({ id: 'pending' })),
      create: vi.fn(async () => ({})),
    },
    user: { findUnique: vi.fn(async () => USER), update: vi.fn() },
  };
  const locked: Parameters<LockEffects['accountLocked']>[0][] = [];
  const deps: ThrottleDeps = {
    throttle: new AuthThrottle(new MemoryThrottleStore(), () => new Date('2026-10-28T10:00:00.000Z')),
    effects: {
      accountLocked: async (e) => void locked.push(e),
      ipBlocked: async () => {},
      unlockedByPasswordReset: async () => {},
      newDevice: async () => {},
    },
  };
  const service = new VerificationService(prisma as never, { me: vi.fn() } as never, deps);
  return { service, check, locked };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

const attempt = async () => {
  try {
    await t.service.checkPhone('u1', { phone: '+33612345678', code: '000000' });
    return 'ok';
  } catch (err) {
    return err as AppException;
  }
};

describe('SMS code checks and the code ladder', () => {
  it('answers « Code incorrect » for the first 4 wrong codes', async () => {
    for (let i = 0; i < 4; i++) {
      const err = (await attempt()) as AppException;
      expect(err.getStatus()).toBe(422);
    }
    expect(t.locked).toHaveLength(0);
  });

  it('locks on the 5th, and stops asking Twilio while locked', async () => {
    for (let i = 0; i < 4; i++) await attempt();
    const fifth = (await attempt()) as AppException;
    expect(fifth.getStatus()).toBe(429);
    expect(fifth.message).toContain('Trop de tentatives');
    // V9 U1 (2026-11-19, V9 B2 (3)): a code lock never talks about a password; an Apple or Google
    // account has none, and a password reset does not lift a code lock anyway.
    expect(fifth.message).not.toMatch(/mot de passe/i);
    expect(t.locked).toEqual([expect.objectContaining({ scope: 'CODE_ACCOUNT', user: USER, resetUrl: null })]);

    t.check.mockClear();
    const sixth = (await attempt()) as AppException;
    expect(sixth.getStatus()).toBe(429);
    expect(sixth.message).not.toMatch(/mot de passe/i);
    expect(t.check).not.toHaveBeenCalled();
  });
});
