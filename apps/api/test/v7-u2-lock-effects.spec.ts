import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaLockEffects } from '../src/auth/throttle/effects.js';
import type { Mail } from '../src/mail/mail.service.js';
import type { CreateAdminAlertInput } from '../src/admin/admin-alerts.service.js';

/**
 * V7 A11 / D3 (U2). What a lock sets off in production: a history row (user sheet), the lock e-mail
 * with its reset link (Q9), one dashboard alert per lock (Q6), and for a staff account an e-mail to
 * every super admin (D3). IP blocks get an alert and no e-mail (Q12).
 */
const UNTIL = new Date('2026-10-28T09:45:00.000Z'); // 10:45 in Paris
const USER = { id: 'u1', email: 'Ana@Example.com', name: 'Ana', role: 'user' };
const STAFF = { id: 's1', email: 'ops@revime.fr', name: 'Ops', role: 'support' };

function setup() {
  const sent: Mail[] = [];
  const raised: CreateAdminAlertInput[] = [];
  const prisma = {
    authLockEvent: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
    user: {
      findMany: vi.fn(async () => [
        { email: 'boss1@revime.fr', name: 'Boss 1' },
        { email: 'boss2@revime.fr', name: 'Boss 2' },
      ]),
    },
  };
  const mailer = { send: vi.fn(async (m: Mail) => void sent.push(m)) };
  const alerts = { raise: vi.fn(async (a: CreateAdminAlertInput) => void raised.push(a)) };
  const effects = new PrismaLockEffects(prisma as never, () => mailer, alerts, () => new Date('2026-10-28T09:30:00.000Z'));
  return { prisma, mailer, alerts, sent, raised, effects };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe('a password lock on an ordinary account', () => {
  beforeEach(async () => {
    await t.effects.accountLocked({
      scope: 'LOGIN_ACCOUNT',
      user: USER,
      level: 2,
      lockedUntil: UNTIL,
      resetUrl: 'https://api.revime.fr/api/auth/reset-password/TOKEN?callbackURL=revime%3A%2F%2Freset-password',
      notMeUrl: 'https://api.revime.fr/api/v1/security/not-me?token=NOTME',
    });
  });

  it('records the lock for the user sheet, keyed on the normalised e-mail', () => {
    expect(t.prisma.authLockEvent.create).toHaveBeenCalledWith({
      data: { scope: 'LOGIN_ACCOUNT', key: 'ana@example.com', userId: 'u1', level: 2, lockedUntil: UNTIL },
    });
  });

  it('e-mails the account once, with the Paris unlock time and the reset link', () => {
    expect(t.sent).toHaveLength(1);
    const mail = t.sent[0]!;
    expect(mail.to).toBe('Ana@Example.com');
    expect(mail.subject).toBe('Votre compte REVIME est temporairement bloqué');
    expect(mail.text).toContain('10:45');
    expect(mail.text).toContain('https://api.revime.fr/api/auth/reset-password/TOKEN');
    expect(mail.html).toContain('https://api.revime.fr/api/auth/reset-password/TOKEN');
  });

  it('carries « Ce n’est pas moi » (U2b, Q5)', () => {
    expect(t.sent[0]!.text).toContain('Ce n’est pas moi : https://api.revime.fr/api/v1/security/not-me?token=NOTME');
    expect(t.sent[0]!.html).toContain('https://api.revime.fr/api/v1/security/not-me?token=NOTME');
  });

  it('raises one ACCOUNT_LOCKED alert pointing at the user sheet', () => {
    expect(t.raised).toEqual([
      expect.objectContaining({
        type: 'ACCOUNT_LOCKED',
        severity: 'HIGH',
        targetType: 'User',
        targetId: 'u1',
        link: '/utilisateurs/u1',
        metadata: { scope: 'LOGIN_ACCOUNT', level: 2, lockedUntil: UNTIL.toISOString() },
      }),
    ]);
  });

  it('does not alert the super admins', () => {
    expect(t.prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('D3: a password lock on a staff account', () => {
  beforeEach(async () => {
    await t.effects.accountLocked({ scope: 'LOGIN_ACCOUNT', user: STAFF, level: 1, lockedUntil: UNTIL, resetUrl: null, notMeUrl: null });
  });

  it('e-mails every active super admin, besides the account itself', () => {
    expect(t.prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'super_admin', OR: [{ banned: false }, { banned: null }] },
      select: { email: true, name: true },
    });
    expect(t.sent.map((m) => m.to)).toEqual(['ops@revime.fr', 'boss1@revime.fr', 'boss2@revime.fr']);
    const alert = t.sent[1]!;
    expect(alert.subject).toBe('Alerte sécurité : compte d’équipe bloqué');
    expect(alert.text).toContain('ops@revime.fr');
    expect(alert.text).toContain('10:45');
  });

  it('raises the alert as CRITICAL', () => {
    expect(t.raised[0]).toMatchObject({ type: 'ACCOUNT_LOCKED', severity: 'CRITICAL' });
  });
});

describe('a code lock', () => {
  it('records and alerts, but sends no e-mail', async () => {
    await t.effects.accountLocked({ scope: 'CODE_ACCOUNT', user: USER, level: 1, lockedUntil: UNTIL, resetUrl: null, notMeUrl: null });
    expect(t.prisma.authLockEvent.create).toHaveBeenCalledOnce();
    expect(t.raised[0]).toMatchObject({ type: 'ACCOUNT_LOCKED', metadata: expect.objectContaining({ scope: 'CODE_ACCOUNT' }) });
    expect(t.sent).toHaveLength(0);
  });
});

describe('one step failing', () => {
  it('still raises the alert when the e-mail cannot be sent', async () => {
    t.mailer.send.mockRejectedValueOnce(new Error('resend down'));
    await t.effects.accountLocked({ scope: 'LOGIN_ACCOUNT', user: USER, level: 1, lockedUntil: UNTIL, resetUrl: null, notMeUrl: null });
    expect(t.raised).toHaveLength(1);
  });
});

describe('an IP block (Q12)', () => {
  it('records it and raises one IP_BLOCKED alert, with no e-mail', async () => {
    await t.effects.ipBlocked({ ip: '203.0.113.7', lockedUntil: UNTIL, accountsTried: 14 });
    expect(t.prisma.authLockEvent.create).toHaveBeenCalledWith({
      data: { scope: 'IP', key: '203.0.113.7', userId: null, level: 1, lockedUntil: UNTIL },
    });
    expect(t.raised).toEqual([
      expect.objectContaining({
        type: 'IP_BLOCKED',
        targetType: 'IpAddress',
        targetId: '203.0.113.7',
        link: '/alertes',
        metadata: { accountsTried: 14, lockedUntil: UNTIL.toISOString() },
      }),
    ]);
    expect(String(t.raised[0]!.message)).toContain('14 comptes');
    expect(t.sent).toHaveLength(0);
  });
});

describe('a password reset', () => {
  it('closes the open login locks in the history', async () => {
    await t.effects.unlockedByPasswordReset({ userId: 'u1' });
    expect(t.prisma.authLockEvent.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', scope: 'LOGIN_ACCOUNT', unlockedAt: null, lockedUntil: { gt: new Date('2026-10-28T09:30:00.000Z') } },
      data: { unlockedAt: new Date('2026-10-28T09:30:00.000Z'), unlockReason: 'PASSWORD_RESET' },
    });
  });
});

describe('a new device (U2b, Q10)', () => {
  it('e-mails the device, the Paris time and « Ce n’est pas moi », and raises nothing', async () => {
    await t.effects.newDevice({
      user: USER,
      label: 'Android · application Revime',
      at: UNTIL,
      notMeUrl: 'https://api.revime.fr/api/v1/security/not-me?token=NOTME',
    });
    expect(t.sent).toHaveLength(1);
    const mail = t.sent[0]!;
    expect(mail.to).toBe('Ana@Example.com');
    expect(mail.subject).toBe('Nouvelle connexion à votre compte REVIME');
    expect(mail.text).toContain('Android · application Revime');
    expect(mail.text).toContain('10:45');
    expect(mail.text).toContain('Si c’était vous, vous n’avez rien à faire.');
    expect(mail.html).toContain('https://api.revime.fr/api/v1/security/not-me?token=NOTME');
    expect(t.raised).toHaveLength(0);
    expect(t.prisma.authLockEvent.create).not.toHaveBeenCalled();
  });
});
