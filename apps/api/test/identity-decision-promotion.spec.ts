import { describe, expect, it, vi } from 'vitest';
import { promoteFromIdentityIfEligible } from '../src/verification/promote-identity.js';

/**
 * CF4-39 (sub-project M, spec §4.2). The promoter grants BASIC → IDENTITY on an operator's
 * ACCEPTED, or on a verified CURRENT session with no decision - never while REFUSED or
 * DOCUMENTS_REQUESTED.
 *
 * Review Focus 1: `verifiedAt` is a person fact never cleared, so after a refusal and a new
 * (unverified) session it is still set. Every webhook on that new session calls this; reading
 * `verifiedAt` alone would re-grant IDENTITY before Stripe verified anything.
 */

type Evidence = {
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  verifiedAt: Date | null;
  decision: 'ACCEPTED' | 'REFUSED' | 'DOCUMENTS_REQUESTED' | null;
} | null;

const prismaFor = (evidence: Evidence) => ({
  identityVerification: { findUnique: vi.fn().mockResolvedValue(evidence) },
  profile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
});

const WHERE = { userId: 'u1', verificationLevel: 'BASIC', verificationRevokedAt: null };

describe('promoteFromIdentityIfEligible honours identity decisions', () => {
  it('grants on a verified current session with no decision', async () => {
    const prisma = prismaFor({ status: 'VERIFIED', verifiedAt: new Date(), decision: null });
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual(WHERE);
  });

  it('grants on ACCEPTED even with no verifiedAt and an unverified session', async () => {
    const prisma = prismaFor({ status: 'REQUIRES_INPUT', verifiedAt: null, decision: 'ACCEPTED' });
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual(WHERE);
  });

  it.each(['REFUSED', 'DOCUMENTS_REQUESTED'] as const)(
    'never grants while %s, even on a verified session',
    async (decision) => {
      const prisma = prismaFor({ status: 'VERIFIED', verifiedAt: new Date(), decision });
      await promoteFromIdentityIfEligible(prisma as never, 'u1');
      expect(prisma.profile.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(['REQUIRES_INPUT', 'PROCESSING', 'CANCELED'] as const)(
    'does not grant on a stale verifiedAt when the current session is %s (Review Focus 1)',
    async (status) => {
      const prisma = prismaFor({ status, verifiedAt: new Date('2026-01-01'), decision: null });
      await promoteFromIdentityIfEligible(prisma as never, 'u1');
      expect(prisma.profile.updateMany).not.toHaveBeenCalled();
    },
  );

  it('does not grant on a VERIFIED status with no verifiedAt', async () => {
    const prisma = prismaFor({ status: 'VERIFIED', verifiedAt: null, decision: null });
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing without an identity row', async () => {
    const prisma = prismaFor(null);
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('selects the three fields it decides on', async () => {
    const prisma = prismaFor({ status: 'VERIFIED', verifiedAt: new Date(), decision: null });
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.identityVerification.findUnique.mock.calls[0]![0].select).toEqual({
      verifiedAt: true,
      status: true,
      decision: true,
    });
  });
});
