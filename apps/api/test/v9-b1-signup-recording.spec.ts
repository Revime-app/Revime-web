import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
  CURRENT_PRIVACY_VERSION,
  verifyConsentProofChecksum,
} from '@revime/shared';
import { activePrivacyVersion } from '../src/legal/privacy-version.js';
import {
  applySignupMethod,
  recordUserPrivacyConsentProof,
  signupConsentFields,
  signupMethodForProvider,
} from '../src/auth/signup-consent.js';
import { auth } from '../src/auth/auth.js';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04` (2), (6), `DEC9-05` (1), (4)): what sign-up records. The
 * logic lives in `signup-consent.ts` so it runs without the database `auth.ts`'s hooks call.
 */
const NOW = new Date('2026-11-19T10:00:00.000Z');
const versions = { cgu: async () => '2026-10-10', privacy: async () => '2026-11-19' };

describe('signupConsentFields (the user.create.before half)', () => {
  it('stamps both acceptances when both boxes are ticked', async () => {
    expect(await signupConsentFields({ cguAccepted: true, privacyAccepted: true }, NOW, versions)).toEqual({
      cguAccepted: true,
      privacyAccepted: true,
      cguAcceptedAt: NOW,
      cguVersion: '2026-10-10',
      privacyAcceptedAt: NOW,
      privacyVersion: '2026-11-19',
    });
  });

  it('refuses an unticked privacy box', async () => {
    await expect(signupConsentFields({ cguAccepted: true, privacyAccepted: false }, NOW, versions)).rejects.toMatchObject({
      body: {
        code: 'PRIVACY_REQUIRED',
        message: 'Vous devez accepter la Politique de confidentialité pour créer un compte.',
      },
    });
  });

  it('still refuses an unticked CGU box with its existing code', async () => {
    await expect(signupConsentFields({ cguAccepted: false }, NOW, versions)).rejects.toMatchObject({
      body: { code: 'CGU_REQUIRED' },
    });
  });

  it('lets an installed build sign up by e-mail without the privacy field (Review Focus 3)', async () => {
    expect(await signupConsentFields({ cguAccepted: true }, NOW, versions)).toEqual({
      cguAccepted: true,
      privacyAccepted: false,
      cguAcceptedAt: NOW,
      cguVersion: '2026-10-10',
    });
  });

  it('records nothing for a social sign-up (no box sent)', async () => {
    expect(await signupConsentFields({}, NOW, versions)).toEqual({ cguAccepted: false, privacyAccepted: false });
  });
});

describe('recordUserPrivacyConsentProof (the user.create.after half)', () => {
  const create = () => {
    const rows: Array<Record<string, unknown>> = [];
    return { rows, prisma: { consentProof: { create: vi.fn(async ({ data }) => (rows.push(data), data)) } } };
  };
  const context = { context: { request: { headers: { 'cf-connecting-ip': '203.0.113.50', 'user-agent': 'UA/1' } } } };

  it('writes a sealed PRIVACY_ACCEPTANCE proof with its version', async () => {
    const t = create();
    await recordUserPrivacyConsentProof(
      t.prisma as never,
      { id: 'u1', email: 'a@example.com', privacyAcceptedAt: NOW, privacyVersion: '2026-11-19' },
      context,
    );
    expect(t.rows).toHaveLength(1);
    const row = t.rows[0]!;
    expect(row).toMatchObject({
      userId: 'u1',
      kind: 'PRIVACY_ACCEPTANCE',
      privacyVersion: '2026-11-19',
      legalTextSnapshot: CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
      actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
      ipAddress: '203.0.113.50',
    });
    expect(verifyConsentProofChecksum(row as never).valid).toBe(true);
  });

  it('writes nothing when the privacy box was not part of the sign-up', async () => {
    const t = create();
    await recordUserPrivacyConsentProof(t.prisma as never, { id: 'u1', email: 'a@example.com' }, context);
    expect(t.rows).toHaveLength(0);
  });
});

describe('the sign-up method (account.create.after)', () => {
  it('maps the three providers and nothing else', () => {
    expect(signupMethodForProvider('credential')).toBe('EMAIL');
    expect(signupMethodForProvider('apple')).toBe('APPLE');
    expect(signupMethodForProvider('google')).toBe('GOOGLE');
    expect(signupMethodForProvider('github')).toBeNull();
  });

  const prismaWith = () => ({ user: { updateMany: vi.fn(async () => ({ count: 1 })) } });

  it('records GOOGLE only where no method is set yet, and leaves the username unconfirmed', async () => {
    const prisma = prismaWith();
    await applySignupMethod(prisma as never, { userId: 'u1', providerId: 'google' }, NOW);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', signupMethod: null },
      data: { signupMethod: 'GOOGLE' },
    });
  });

  it('records EMAIL and confirms the handle chosen on the form', async () => {
    const prisma = prismaWith();
    await applySignupMethod(prisma as never, { userId: 'u1', providerId: 'credential' }, NOW);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', signupMethod: null },
      data: { signupMethod: 'EMAIL', usernameConfirmedAt: NOW },
    });
  });

  it('never touches the row of a provider it does not know', async () => {
    const prisma = prismaWith();
    await applySignupMethod(prisma as never, { userId: 'u1', providerId: 'github' }, NOW);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('is wired as account.create.after, so a provider linked later cannot overwrite (Review Focus 5: the where clause)', () => {
    expect(typeof auth.options.databaseHooks?.account?.create?.after).toBe('function');
  });

  it('declares the privacy box as a sign-up field and the rest as server-written', () => {
    const fields = auth.options.user?.additionalFields as Record<string, { input?: boolean }>;
    expect(fields.privacyAccepted).toBeDefined();
    expect(fields.privacyAccepted!.input).not.toBe(false);
    for (const k of ['privacyAcceptedAt', 'privacyVersion', 'signupMethod', 'usernameConfirmedAt']) {
      expect(fields[k]?.input).toBe(false);
    }
  });
});

describe('activePrivacyVersion', () => {
  it('reads the dashboard setting, falling back to the compiled version', async () => {
    const read = (row: unknown) => ({ platformSettings: { findUnique: async () => row } });
    expect(await activePrivacyVersion(read({ privacyCurrentVersion: '2027-01-01' }))).toBe('2027-01-01');
    expect(await activePrivacyVersion(read(null))).toBe(CURRENT_PRIVACY_VERSION);
  });
});
