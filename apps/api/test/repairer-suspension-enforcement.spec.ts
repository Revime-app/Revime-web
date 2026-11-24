import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import { UsersService } from '../src/users/users.service.js';

/**
 * 🛑 THE BASE FIXTURE HAS `repairerEnabled: true`. That is the whole state guard 6 exists
 * for: a suspended réparateur still has the mode ON, because the suspension is a separate
 * marker so his client side keeps working. A fixture with the mode off would pass guard 6's
 * test without the guard existing.
 */
const suspendedRepairer = {
  repairerEnabled: true,
  clientEnabled: true,
  activeMode: 'REPAIRER' as const,
  repairerSuspendedAt: new Date('2026-09-03T10:00:00.000Z'),
  onboardingCompletedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  verificationLevel: 'IDENTITY' as const,
};

describe('B2 guard 6: a suspended réparateur cannot send an offer', () => {
  /**
   * assertRepairerEnabled reads `repairerEnabled` ONLY, and suspension does not change it -
   * so before this guard a suspended réparateur kept quoting on demandes he could no longer
   * be found through. The spec asserted the opposite in an earlier draft; this test is what
   * makes the correction stick.
   */
  it('refuses with the suspension sentence, not with the mode sentence', async () => {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue(suspendedRepairer) },
    };
    const service = new OffersService(prisma as never, undefined as never);
    await expect(
      (service as unknown as { assertRepairerEnabled(u: string): Promise<void> })
        .assertRepairerEnabled('u1'),
    ).rejects.toThrow(/suspendu/i);
  });

  it('still refuses an account with the mode off, with the mode sentence', async () => {
    const prisma = {
      profile: {
        findFirst: vi.fn().mockResolvedValue({ ...suspendedRepairer, repairerEnabled: false, repairerSuspendedAt: null }),
      },
    };
    const service = new OffersService(prisma as never, undefined as never);
    await expect(
      (service as unknown as { assertRepairerEnabled(u: string): Promise<void> })
        .assertRepairerEnabled('u1'),
    ).rejects.toThrow(/mode réparateur/i);
  });

  it('allows an unsuspended réparateur', async () => {
    const prisma = {
      profile: {
        findFirst: vi.fn().mockResolvedValue({ ...suspendedRepairer, repairerSuspendedAt: null }),
      },
    };
    const service = new OffersService(prisma as never, undefined as never);
    await expect(
      (service as unknown as { assertRepairerEnabled(u: string): Promise<void> })
        .assertRepairerEnabled('u1'),
    ).resolves.toBeUndefined();
  });

  it('selects repairerSuspendedAt (omitting it would refuse everyone and fail tsc)', async () => {
    const findFirst = vi.fn().mockResolvedValue({ ...suspendedRepairer, repairerSuspendedAt: null });
    const service = new OffersService({ profile: { findFirst } } as never, undefined as never);
    await (service as unknown as { assertRepairerEnabled(u: string): Promise<void> })
      .assertRepairerEnabled('u1');
    expect(findFirst.mock.calls[0]![0].select).toMatchObject({ repairerSuspendedAt: true });
  });
});

describe('B2 guard 7: a suspended réparateur cannot re-enable his own mode', () => {
  /**
   * 🛑 WITHOUT THIS THE SUSPENSION IS UNDOABLE BY ITS TARGET. He turns the mode off, turns it
   * back on, and the marker is still set but `updateModes` has just re-upserted a live
   * RepairerProfile - and the only existing guard on false -> true is
   * assertIdentityVerified, which returns immediately because IDENTITY_GATE_ENABLED is off.
   *
   * 🛑 AND IT ASSERTS THE MESSAGE, NOT MERELY A REJECTION. Two pre-existing refusals live in
   * this method - « Au moins un mode doit rester activé » and « Activez d'abord le mode
   * réparateur » - so a test expecting any throw would pass with no guard at all.
   */
  const makeUsers = (profile: Record<string, unknown>) => {
    const txMocks = {
      profileUpdate: vi.fn().mockResolvedValue({}),
      userFind: vi.fn().mockResolvedValue({ username: 'camille' }),
      repairerUpsert: vi.fn().mockResolvedValue({}),
    };
    const prisma = {
      profile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(profile),
        findFirst: vi.fn().mockResolvedValue(profile),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'camille',
          email: 'camille@example.com',
          createdAt: new Date(),
          profile: [profile],
        }),
      },
      repairerProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn((cb: (t: unknown) => Promise<unknown>) =>
        cb({
          profile: { update: txMocks.profileUpdate },
          user: { findUniqueOrThrow: txMocks.userFind },
          repairerProfile: { upsert: txMocks.repairerUpsert },
        }),
      ),
    };
    const service = new UsersService(prisma as never, undefined as never);
    // Mock the me() call that updateModes makes at the end
    vi.spyOn(service, 'me').mockResolvedValue({} as never);
    return { prisma, service, txMocks };
  };

  it('refuses false -> true while suspended, naming the suspension', async () => {
    const { service } = makeUsers({ ...suspendedRepairer, repairerEnabled: false, activeMode: 'CLIENT' });
    const error = await service.updateModes('u1', { repairerEnabled: true }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/suspendu/i);
    expect((error as { code?: string }).code).toBe('FORBIDDEN');
  });

  it('does NOT refuse a réparateur who is already enabled and suspended switching to client mode', async () => {
    // Trapping him in réparateur mode is the failure the existing code comments warn about.
    const { service, txMocks } = makeUsers({ ...suspendedRepairer, activeMode: 'REPAIRER' });
    await service.updateModes('u1', { activeMode: 'CLIENT' });
    expect(txMocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: expect.objectContaining({ activeMode: 'CLIENT' }),
    });
  });

  it('does NOT refuse a suspended réparateur turning the mode OFF', async () => {
    // The guard is only on the false -> true transition. Refusing true -> false would trap him.
    const { service, txMocks } = makeUsers({ ...suspendedRepairer, repairerEnabled: true, activeMode: 'CLIENT' });
    await service.updateModes('u1', { repairerEnabled: false, activeMode: 'CLIENT' });
    expect(txMocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: expect.objectContaining({ repairerEnabled: false, activeMode: 'CLIENT' }),
    });
  });

  it('allows false -> true when not suspended', async () => {
    const { service, txMocks } = makeUsers({
      ...suspendedRepairer,
      repairerEnabled: false,
      activeMode: 'CLIENT',
      repairerSuspendedAt: null,
    });
    await service.updateModes('u1', { repairerEnabled: true });
    expect(txMocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: expect.objectContaining({ repairerEnabled: true }),
    });
  });

  it('does not leak the operator reason to the user', async () => {
    const { service } = makeUsers({
      ...suspendedRepairer,
      repairerEnabled: false,
      activeMode: 'CLIENT',
      repairerSuspendedReason: 'Fraude signalée par trois clients',
    });
    await expect(service.updateModes('u1', { repairerEnabled: true })).rejects.toThrow(
      /^Votre compte réparateur est suspendu\.$/,
    );
  });
});
