import { describe, expect, it, vi } from 'vitest';
import {
  demoteBasicOnContactChange,
  promoteToBasicIfEligible,
} from '../src/verification/promote-basic.js';

/**
 * `CF-03` / `CF-D1`, 2026-09-04: BASIC is a verified e-mail OR a verified phone, not both.
 *
 * The client wrote « téléphone **ou** adresse e-mail ». Stage 3b piece 4 built AND, and the
 * owner decided OR on 2026-09-04 because `+33` SMS delivery is still unproven, so an AND rule
 * would lock out every French account whose code never arrives.
 *
 * These are UNIT tests over a stubbed Prisma, so they run under `test:unit`. The integration
 * spec beside them (`promote-basic.int.spec.ts`) needs a database and is excluded from every
 * gate, which is how its AND assertions could have stood unread for a week. The assertions
 * here are on the WRITE - whether `profile.updateMany` was called and with what WHERE - because
 * that is the only observable behaviour of these two functions.
 */
const prismaFor = (user: { emailVerified: boolean; phoneVerifiedAt: Date | null } | null) => ({
  user: { findUnique: vi.fn().mockResolvedValue(user) },
  profile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
});

describe('promoteToBasicIfEligible grants BASIC ONLY when BOTH contacts are verified', () => {
  it('does NOT promote with only a verified e-mail', async () => {
    const prisma = prismaFor({ emailVerified: true, phoneVerifiedAt: null });
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('does NOT promote with only a verified phone', async () => {
    const prisma = prismaFor({ emailVerified: false, phoneVerifiedAt: new Date() });
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('promotes when BOTH email and phone are verified', async () => {
    const prisma = prismaFor({ emailVerified: true, phoneVerifiedAt: new Date() });
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.updateMany.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
      verificationLevel: 'NONE',
    });
    expect(prisma.profile.updateMany.mock.calls[0]![0].data.verificationLevel).toBe('BASIC');
  });

  it('writes nothing when neither contact is verified', async () => {
    const prisma = prismaFor({ emailVerified: false, phoneVerifiedAt: null });
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the user does not exist', async () => {
    const prisma = prismaFor(null);
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('stamps verifiedAt with the promotion', async () => {
    const prisma = prismaFor({ emailVerified: true, phoneVerifiedAt: new Date() });
    await promoteToBasicIfEligible(prisma as never, 'u1');
    expect(prisma.profile.updateMany.mock.calls[0]![0].data.verifiedAt).toBeInstanceOf(Date);
  });

  it('sends account confirmed welcome email when user is promoted to BASIC', async () => {
    const sentMails: any[] = [];
    const { __setMailSender } = await import('../src/mail/mail.service.js');
    __setMailSender({
      send: async (mail) => {
        sentMails.push(mail);
      },
    });

    try {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            email: 'client@example.com',
            name: 'Client Test',
            emailVerified: true,
            phoneVerifiedAt: new Date(),
          }),
        },
        profile: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      await promoteToBasicIfEligible(prisma as never, 'u1');
      expect(sentMails).toHaveLength(1);
      expect(sentMails[0].to).toBe('client@example.com');
      expect(sentMails[0].subject).toContain('Compte confirmé avec succès');
      expect(sentMails[0].html).toContain('Client Test');
    } finally {
      __setMailSender(undefined);
    }
  });
});

describe('demoteBasicOnContactChange demotes BASIC when a contact is changed', () => {
  it('demotes when phone changes', async () => {
    const prisma = prismaFor({ emailVerified: true, phoneVerifiedAt: new Date() });
    await demoteBasicOnContactChange(prisma as never, 'u1', 'phone');
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.updateMany.mock.calls[0]![0]).toEqual({
      where: { userId: 'u1', verificationLevel: 'BASIC' },
      data: { verificationLevel: 'NONE', verifiedAt: null },
    });
  });

  it('demotes when e-mail changes', async () => {
    const prisma = prismaFor({ emailVerified: true, phoneVerifiedAt: new Date() });
    await demoteBasicOnContactChange(prisma as never, 'u1', 'email');
    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.profile.updateMany.mock.calls[0]![0]).toEqual({
      where: { userId: 'u1', verificationLevel: 'BASIC' },
      data: { verificationLevel: 'NONE', verifiedAt: null },
    });
  });
});
