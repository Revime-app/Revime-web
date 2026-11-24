import { describe, expect, it, vi } from 'vitest';
import {
  revokeVerification,
  clearVerificationRevocation,
  REVOKE_RACED,
} from '../src/verification/revoke.js';

/**
 * NO `$transaction` MOCK, deliberately. The marker and the level must be written TOGETHER
 * (spec §4.1), and `revokeVerification` does that in a SINGLE `profile.updateMany`. One
 * statement is already atomic, so a transaction wrapped around it would be ceremony rather
 * than a guarantee - and a mock that only proved `$transaction` was called would say nothing
 * about how many writes happened inside it.
 *
 * What is pinned instead is the SHAPE of that one write: exactly one call, carrying all three
 * columns. An implementation that wrote the level and the marker separately fails on the call
 * count, which is the property that actually matters.
 */
const makeDeps = (level: string | null, revokedAt: Date | null = null) => {
  const prisma = {
    profile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          level === null ? null : { verificationLevel: level, verificationRevokedAt: revokedAt },
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma };
};

describe('revokeVerification lowers exactly one rung', () => {
  it('IDENTITY becomes BASIC', async () => {
    const { prisma } = makeDeps('IDENTITY');
    const out = await revokeVerification(prisma as never, { userId: 'u1', reason: 'Faux document' });
    expect(out).toEqual({ from: 'IDENTITY', to: 'BASIC' });
    expect(prisma.profile.updateMany.mock.calls[0]![0].data.verificationLevel).toBe('BASIC');
  });

  it('BUSINESS becomes IDENTITY, not BASIC and not NONE', async () => {
    const { prisma } = makeDeps('BUSINESS');
    const out = await revokeVerification(prisma as never, { userId: 'u1', reason: 'SIREN radié' });
    expect(out).toEqual({ from: 'BUSINESS', to: 'IDENTITY' });
    expect(prisma.profile.updateMany.mock.calls[0]![0].data.verificationLevel).toBe('IDENTITY');
  });

  /**
   * 🛑 The marker and the level in ONE statement. Two separate writes would let
   * identity.service.ts:435's post-webhook promotion land between them and re-promote the
   * account just revoked - spec §4.1. The call-count assertion is the load-bearing one: it is
   * what fails if a later change splits the write in two.
   */
  it('writes the marker and the level in the same, single statement', async () => {
    const { prisma } = makeDeps('IDENTITY');
    await revokeVerification(prisma as never, { userId: 'u1', reason: 'Faux document' });
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    const data = prisma.profile.updateMany.mock.calls[0]![0].data;
    expect(data.verificationLevel).toBe('BASIC');
    expect(data.verificationRevokedReason).toBe('Faux document');
    expect(data.verificationRevokedAt).toBeInstanceOf(Date);
  });

  /**
   * 🛑 B2 GUARD 1. NONE and BASIC both render NO public badge - verifiedBadgeFor
   * (offer.schemas.ts:245) returns null for both - so there is nothing to withdraw,
   * and BASIC's own withdrawal path is demoteBasicOnContactChange.
   */
  it('refuses NONE and BASIC', async () => {
    for (const level of ['NONE', 'BASIC']) {
      const { prisma } = makeDeps(level);
      await expect(
        revokeVerification(prisma as never, { userId: 'u1', reason: 'x' }),
      ).rejects.toThrow(/vérification/i);
    }
  });

  it('refuses an account with no profile row', async () => {
    const { prisma } = makeDeps(null);
    await expect(
      revokeVerification(prisma as never, { userId: 'u1', reason: 'x' }),
    ).rejects.toThrow();
  });

  /**
   * 🛑 THE RACE MUST BE REPORTED, NOT RETURNED AS SUCCESS. `count === 0` means a concurrent
   * promotion moved the level between the findUnique and the updateMany, so nothing was
   * revoked. Returning `{ from, to }` there would make the route answer success and let Task
   * 3's `@Audit('repairer.verification_revoke')` write a revocation that never happened.
   *
   * This test is what stops that regressing: the WHERE-pin below protects the ROW, and this
   * protects the CALLER. Both are needed, which is why they are two tests.
   */
  it('throws CONFLICT when the write matches no row, instead of reporting success', async () => {
    const { prisma } = makeDeps('IDENTITY');
    prisma.profile.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      revokeVerification(prisma as never, { userId: 'u1', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: REVOKE_RACED });
  });

  /**
   * The WHERE pins the level being revoked, so a concurrent promotion cannot make the
   * write land on a rung it was not computed for. Spec §6 refused an expected-level parameter
   * supplied by the CALLER; the 409 above is different, being a no-op the function detected
   * itself from state it read itself.
   */
  it('pins the observed level in the WHERE clause', async () => {
    const { prisma } = makeDeps('IDENTITY');
    await revokeVerification(prisma as never, { userId: 'u1', reason: 'x' });
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
      verificationLevel: 'IDENTITY',
    });
  });
});

describe('clearVerificationRevocation grants nothing', () => {
  it('clears both marker columns and writes NO verificationLevel', async () => {
    const { prisma } = makeDeps('BASIC', new Date('2026-09-03T10:00:00.000Z'));
    await clearVerificationRevocation(prisma as never, 'u1');
    const data = prisma.profile.updateMany.mock.calls[0]![0].data;
    expect(data).toEqual({ verificationRevokedAt: null, verificationRevokedReason: null });
    expect('verificationLevel' in data).toBe(false);
  });

  it('refuses an account carrying no marker, rather than succeeding silently', async () => {
    const { prisma } = makeDeps('BASIC', null);
    await expect(clearVerificationRevocation(prisma as never, 'u1')).rejects.toThrow();
  });
});
