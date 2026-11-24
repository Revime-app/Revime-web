import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { createHash } from 'node:crypto';
import { SecurityService } from '../src/security/security.service.js';
import { AuthThrottle } from '../src/auth/throttle/auth-throttle.js';
import type { LockEffects } from '../src/auth/throttle/hooks.js';
import { AppException } from '../src/common/app-exception.js';
import { MemoryThrottleStore } from './helpers/memory-throttle-store.js';

/**
 * V7 A11 (U2b). « Ce n'est pas moi » (Q4, Q5, Q13, Q14) and the step-up (Q6, Q7): what each does to
 * the account, and the 10-minute window.
 */
const NOW = new Date('2026-10-28T10:00:00.000Z');
/** Real tokens are 32 base64url characters (links.ts). */
const TOKEN = 'Tok3n_'.padEnd(32, 'x');
const USER = { id: 'u1', email: 'Ana@Example.com', name: 'Ana', role: 'user' };
const STAFF = { id: 's1', email: 'ops@revime.fr', name: 'Ops', role: 'support' };

async function setup(opts: { user?: typeof USER; hasPassword?: boolean; token?: { value: string; expiresAt: Date } | null } = {}) {
  const user = opts.user ?? USER;
  const passwordHash = await hashPassword('correct-horse-1');
  const verifications: Array<{ id: string; identifier: string; value: string; expiresAt: Date }> = [];
  if (opts.token !== null) {
    verifications.push({
      id: 'v1',
      identifier: `not-me:${TOKEN}`,
      value: opts.token?.value ?? user.id,
      expiresAt: opts.token?.expiresAt ?? new Date(NOW.getTime() + 60_000),
    });
  }
  const sessions: Record<string, { stepUpAt: Date | null }> = { s1: { stepUpAt: null } };
  const prisma = {
    verification: {
      findFirst: vi.fn(async ({ where }: { where: { identifier: string } }) => verifications.find((v) => v.identifier === where.identifier) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
        const before = verifications.length;
        for (let i = verifications.length - 1; i >= 0; i--) if (verifications[i]!.identifier === where.identifier) verifications.splice(i, 1);
        return { count: before - verifications.length };
      }),
      create: vi.fn(async ({ data }: { data: (typeof verifications)[number] }) => void verifications.push(data)),
    },
    user: {
      findUnique: vi.fn(async () => user),
      findMany: vi.fn(async () => [{ email: 'boss@revime.fr', name: 'Boss' }]),
    },
    account: {
      findFirst: vi.fn(async () => (opts.hasPassword === false ? null : { password: passwordHash })),
      updateMany: vi.fn(async () => ({ count: opts.hasPassword === false ? 0 : 1 })),
    },
    session: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => sessions[where.id] ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { stepUpAt: Date } }) => {
        sessions[where.id] = { stepUpAt: data.stepUpAt };
      }),
    },
    knownDevice: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    pushToken: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    authLockEvent: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const raised: Array<Record<string, unknown>> = [];
  const resetRequested: string[] = [];
  const locked: Parameters<LockEffects['accountLocked']>[0][] = [];
  let now = NOW;
  const throttle = new AuthThrottle(new MemoryThrottleStore(), () => now);
  const service = new SecurityService(prisma as never, {
    throttle: {
      throttle,
      effects: {
        accountLocked: async (e) => void locked.push(e),
        ipBlocked: async () => {},
        unlockedByPasswordReset: async () => {},
        newDevice: async () => {},
      },
    },
    alerts: { raise: async (a) => void raised.push(a as never) },
    mailer: () => ({ send: async (m) => void sent.push(m) }),
    requestPasswordReset: async (email) => void resetRequested.push(email),
    clock: () => now,
    apiOrigin: 'https://api.revime.fr',
    authBaseURL: 'https://api.revime.fr/api/auth',
  });
  return {
    service,
    prisma,
    verifications,
    sessions,
    sent,
    raised,
    resetRequested,
    locked,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('« Ce n’est pas moi »', () => {
  it('only reads the token on the confirmation page (a mail scanner opening the link changes nothing)', async () => {
    const t = await setup();
    expect(await t.service.checkNotMeToken(TOKEN)).toBe(true);
    expect(await t.service.checkNotMeToken('nope')).toBe(false);
    expect(t.prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(t.verifications).toHaveLength(1);
  });

  it('signs out everywhere, forgets devices and push tokens, voids the password and sends a reset', async () => {
    const t = await setup();
    expect(await t.service.notMe(TOKEN)).toEqual({ ok: true, hadPassword: true });
    expect(t.prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(t.prisma.knownDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(t.prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    const [{ where, data }] = t.prisma.account.updateMany.mock.calls[0] as unknown as [{ where: object; data: { password: string } }];
    expect(where).toEqual({ userId: 'u1', providerId: 'credential' });
    expect(data.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // a real scrypt hash nobody knows the password of
    expect(t.resetRequested).toEqual(['Ana@Example.com']);
  });

  it('records the history line and raises one ACCOUNT_SECURED alert', async () => {
    const t = await setup();
    await t.service.notMe(TOKEN);
    expect(t.prisma.authLockEvent.create).toHaveBeenCalledWith({
      data: { kind: 'SECURED', scope: 'LOGIN_ACCOUNT', key: 'ana@example.com', userId: 'u1', level: 0, lockedUntil: NOW },
    });
    expect(t.raised).toEqual([
      expect.objectContaining({ type: 'ACCOUNT_SECURED', targetType: 'User', targetId: 'u1', link: '/utilisateurs/u1' }),
    ]);
    expect(t.sent).toHaveLength(0);
  });

  it('works once: the token is gone after use', async () => {
    const t = await setup();
    await t.service.notMe(TOKEN);
    expect(await t.service.notMe(TOKEN)).toEqual({ ok: false });
    expect(t.prisma.session.deleteMany).toHaveBeenCalledOnce();
  });

  it('refuses an expired token', async () => {
    const t = await setup({ token: { value: 'u1', expiresAt: new Date(NOW.getTime() - 1) } });
    expect(await t.service.checkNotMeToken(TOKEN)).toBe(false);
    expect(await t.service.notMe(TOKEN)).toEqual({ ok: false });
  });

  it('for a Google / Apple-only account, signs out but sends no reset', async () => {
    const t = await setup({ hasPassword: false });
    expect(await t.service.notMe(TOKEN)).toEqual({ ok: true, hadPassword: false });
    expect(t.resetRequested).toEqual([]);
  });

  it('e-mails every super admin when the account is staff (Q14)', async () => {
    const t = await setup({ user: STAFF });
    await t.service.notMe(TOKEN);
    expect(t.sent.map((m) => m.to)).toEqual(['boss@revime.fr']);
    expect(t.sent[0]!.subject).toBe('Alerte sécurité : un compte d’équipe a été sécurisé');
    expect(t.raised[0]).toMatchObject({ severity: 'CRITICAL' });
  });
});

describe('the step-up', () => {
  const session = { userId: 'u1', sessionId: 's1', email: 'Ana@Example.com' };

  it('asks for the password when there is one, a code otherwise', async () => {
    expect(await (await setup()).service.method('u1')).toBe('PASSWORD');
    expect(await (await setup({ hasPassword: false })).service.method('u1')).toBe('EMAIL_CODE');
  });

  it('stamps the session on the right password, and the stamp holds 10 minutes', async () => {
    const t = await setup();
    await expect(t.service.assertSteppedUp('s1')).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    await t.service.withPassword(session, 'correct-horse-1');
    expect(t.sessions.s1!.stepUpAt).toEqual(NOW);
    await expect(t.service.assertSteppedUp('s1')).resolves.toBeUndefined();
    t.advance(10 * 60 * 1000);
    await expect(t.service.assertSteppedUp('s1')).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('counts a wrong password on the login lock, and locks on the 5th', async () => {
    const t = await setup();
    for (let i = 0; i < 4; i++) {
      await expect(t.service.withPassword(session, 'nope')).rejects.toThrow(new AppException('UNPROCESSABLE_ENTITY', 'Mot de passe incorrect.'));
    }
    await expect(t.service.withPassword(session, 'nope')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(t.locked).toEqual([expect.objectContaining({ scope: 'LOGIN_ACCOUNT', user: expect.objectContaining({ id: 'u1' }) })]);
    expect(t.locked[0]!.notMeUrl).toMatch(/^https:\/\/api\.revime\.fr\/api\/v1\/security\/not-me\?token=/);
    // even the right one is refused now
    await expect(t.service.withPassword(session, 'correct-horse-1')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(t.sessions.s1!.stepUpAt).toBeNull();
  });

  it('e-mails a 6-digit code, accepts it once, and stamps the session', async () => {
    const t = await setup({ hasPassword: false });
    await t.service.sendCode(session);
    expect(t.sent).toHaveLength(1);
    const code = /\b(\d{6})\b/.exec(t.sent[0]!.text)![1]!;
    const stored = t.verifications.find((v) => v.identifier === 'step-up:u1')!;
    expect(stored.value).toBe(createHash('sha256').update(code).digest('hex'));
    await t.service.withCode(session, code);
    expect(t.sessions.s1!.stepUpAt).toEqual(NOW);
    await expect(t.service.withCode(session, code)).rejects.toBeInstanceOf(AppException);
  });

  it('counts a wrong code on the code lock', async () => {
    const t = await setup({ hasPassword: false });
    await t.service.sendCode(session);
    for (let i = 0; i < 4; i++) {
      await expect(t.service.withCode(session, '000000')).rejects.toThrow(new AppException('UNPROCESSABLE_ENTITY', 'Code incorrect.'));
    }
    await expect(t.service.withCode(session, '000000')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  // V9 U1 (2026-11-19, the client's V9 B2 (4)): was « sends at most 3 codes an hour ». The client
  // raised the send limit to 5 an hour, kept apart from the wrong-code lock; see the V9 block below.
  it('sends at most 5 codes an hour', async () => {
    const t = await setup({ hasPassword: false });
    for (let i = 0; i < 5; i++) await t.service.sendCode(session);
    await expect(t.service.sendCode(session)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(t.sent).toHaveLength(5);
  });
});

/**
 * V9 U1 (V9 B2 (3), (4); `CLIENT_FEEDBACK_V9.md` `FND9-006`). An Apple account asking for its deletion
 * code three times was refused with the login lock's sentence, « Votre compte est temporairement bloqué
 * … réinitialisez votre mot de passe », although no code was wrong and the account has no password.
 * Code sends have their own limit and sentence; a wrong-code lock never talks about a password.
 */
describe('V9 U1: code sends and wrong codes, apart, with no password wording', () => {
  const session = { userId: 'u1', sessionId: 's1', email: 'Ana@Example.com' };
  const message = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as AppException).message;

  it('refuses the 6th send in an hour with « Trop de demandes de code, réessayez dans X min. », the real minutes', async () => {
    const t = await setup({ hasPassword: false });
    for (let i = 0; i < 5; i++) await t.service.sendCode(session);
    expect(await message(t.service.sendCode(session))).toBe('Trop de demandes de code, réessayez dans 60 min.');
    t.advance(45 * 60 * 1000);
    expect(await message(t.service.sendCode(session))).toBe('Trop de demandes de code, réessayez dans 15 min.');
    t.advance(15 * 60 * 1000);
    await expect(t.service.sendCode(session)).resolves.toBeUndefined();
    expect(t.sent).toHaveLength(6);
  });

  it('counts sends apart from wrong codes: five sends leave the last code usable', async () => {
    const t = await setup({ hasPassword: false });
    for (let i = 0; i < 5; i++) await t.service.sendCode(session);
    const code = /\b(\d{6})\b/.exec(t.sent[4]!.text)![1]!;
    await t.service.withCode(session, code);
    expect(t.sessions.s1!.stepUpAt).toEqual(NOW);
  });

  it('counts wrong codes apart from sends: four wrong codes do not stop a new send', async () => {
    const t = await setup({ hasPassword: false });
    await t.service.sendCode(session);
    for (let i = 0; i < 4; i++) await expect(t.service.withCode(session, '000000')).rejects.toBeInstanceOf(AppException);
    await expect(t.service.sendCode(session)).resolves.toBeUndefined();
  });

  it('locks on the 5th wrong code with a sentence about codes, never a password, and keeps it while locked', async () => {
    const t = await setup({ hasPassword: false });
    await t.service.sendCode(session);
    for (let i = 0; i < 4; i++) await expect(t.service.withCode(session, '000000')).rejects.toBeInstanceOf(AppException);
    const fifth = await message(t.service.withCode(session, '000000'));
    const sixth = await message(t.service.withCode(session, '000000'));
    for (const text of [fifth, sixth]) {
      expect(text).toMatch(/^Trop de tentatives avec un code incorrect\. Réessayez à partir de \d{2}:\d{2}\.$/);
      expect(text).not.toMatch(/mot de passe/i);
    }
  });
});
