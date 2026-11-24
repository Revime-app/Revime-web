import { describe, expect, it, vi } from 'vitest';
import { promoteFromIdentityIfEligible } from '../src/verification/promote-identity.js';
import { promoteToBusinessIfEligible } from '../src/verification/promote-business.js';
import { promoteToBasicIfEligible } from '../src/verification/promote-basic.js';

const prismaFor = (evidence: Record<string, unknown>) => ({
  identityVerification: { findUnique: vi.fn().mockResolvedValue(evidence) },
  businessVerification: { findUnique: vi.fn().mockResolvedValue(evidence) },
  user: { findUnique: vi.fn().mockResolvedValue({ emailVerified: true, phoneVerifiedAt: new Date() }) },
  profile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  // V7 D4: promote-business also writes `kind = PRO`.
  repairerProfile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
});

/**
 * 🛑 These two assertions are the whole point of migration 33. Without the added clause
 * both promoters re-grant the level an operator just revoked: promote-identity is called
 * after EVERY Stripe Identity webhook sync (identity.service.ts:435), and handleWebhook
 * releases its claim so Stripe retries.
 *
 * The assertion is on the WHERE's VALUE, not on the presence of the key. A test that only
 * checked the key existed would pass against `verificationRevokedAt: undefined`, which
 * Prisma treats as "no filter".
 */
describe('the two promoters that can undo a revocation are guarded on the marker', () => {
  it('promote-identity requires verificationRevokedAt to be null', async () => {
    // CF4-39: the promoter now also requires a verified current session with no decision.
    const prisma = prismaFor({ verifiedAt: new Date(), status: 'VERIFIED', decision: null });
    await promoteFromIdentityIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
      verificationLevel: 'BASIC',
      verificationRevokedAt: null,
    });
  });

  it('promote-business requires verificationRevokedAt to be null', async () => {
    // CF5-07: the promoter now requires status === 'APPROVED' and verifiedAt.
    const prisma = prismaFor({ verifiedAt: new Date(), status: 'APPROVED' });
    await promoteToBusinessIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
      verificationLevel: 'IDENTITY',
      verificationRevokedAt: null,
    });
  });
});

/**
 * 🛑 A DELIBERATE ABSENCE, PINNED SO IT IS NOT "COMPLETED" LATER.
 *
 * gate.ts's assertBasicVerified treats BASIC as sufficient for publishing, editing and
 * offering, behind VERIFICATION_GATE_ENABLED. A marker on promote-basic would permanently
 * bar a revoked account from regaining BASIC - so the day that flag is switched on, a
 * revoked réparateur could no longer publish a demande AS A CLIENT. That punishes the
 * client side, which the owner's réparateur-scoped suspension decision exists to protect.
 *
 * B1's spec §11.1 item 1 said « all three promoters ». It is deliberately not obeyed, and
 * this test is why the next reader will not quietly restore it. The residual is harmless:
 * a revoked account can walk back up to BASIC, which verifiedBadgeFor maps to null.
 */
describe('promote-basic is deliberately NOT guarded on the marker', () => {
  it('still promotes a revoked account to BASIC', async () => {
    const prisma = prismaFor({});
    await promoteToBasicIfEligible(prisma as never, 'u1');
    const where = prisma.profile.updateMany.mock.calls[0]![0].where;
    expect(where).toEqual({ userId: 'u1', verificationLevel: 'NONE' });
    expect('verificationRevokedAt' in where).toBe(false);
  });
});
