import { describe, expect, it, vi } from 'vitest';
import { AdminRepairersWriteService } from '../src/admin/admin-repairers-write.service.js';

const target = (over: Record<string, unknown> = {}) => {
  const { profile, ...rest } = over as { profile?: object };
  return {
    id: 'target-1', role: 'user', ...rest,
    profile: {
      deletedAt: null, repairerEnabled: true, verificationLevel: 'IDENTITY',
      verificationRevokedAt: null, repairerSuspendedAt: null,
      ...profile,
    },
  };
};

const makeDeps = (row: unknown = target()) => {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(row) },
    profile: {
      findUnique: vi.fn().mockResolvedValue(
        (row as { profile: unknown } | null)?.profile ?? null,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const emit = vi.fn().mockResolvedValue(undefined);
  return { prisma, emit, service: new AdminRepairersWriteService(prisma as never, { emit } as never) };
};

describe('B2 guard 3: no self-action, and admin accounts are protected', () => {
  /**
   * The same reasoning as B1's guard 1: there is exactly ONE admin account and
   * /admin/unban-user is disabled by the lockdown. Revoking your own verification is less
   * catastrophic than a self-ban, but suspending your own réparateur mode is still a state
   * only hand-written SQL could undo if the dashboard is what you would use to undo it.
   */
  it('refuses every action on your own account', async () => {
    const { service } = makeDeps(target({ id: 'admin-1' }));
    await expect(service.revokeVerification('admin-1', 'admin-1', { reason: 'x' })).rejects.toThrow();
    await expect(service.suspend('admin-1', 'admin-1', { reason: 'x' })).rejects.toThrow();
  });

  it('refuses every action on another admin account', async () => {
    const { service } = makeDeps(target({ role: 'admin' }));
    await expect(service.revokeVerification('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow();
    await expect(service.suspend('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow();
  });

  // CF4-40, Review Focus 4.
  it.each(['super_admin', 'moderation', 'support', 'finance', 'read_only'])(
    'refuses every action on a %s account',
    async (role) => {
      const { service } = makeDeps(target({ role }));
      const msg = "Ce compte est un compte administrateur. L'action est refusée.";
      await expect(service.revokeVerification('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow(msg);
      await expect(service.suspend('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow(msg);
    },
  );

  /**
   * Reactivation and restore are the RECOVERY paths, so they must not be blocked by the
   * guard that exists to prevent a lockout - the identical reasoning to B1's
   * `reactivate` deliberately skipping assertActionable.
   */
  it('ALLOWS reactivate and restore on an admin account', async () => {
    const { service } = makeDeps(
      target({ role: 'admin', profile: { repairerSuspendedAt: new Date(), verificationRevokedAt: new Date() } }),
    );
    await expect(service.reactivate('operator-1', 'target-1')).resolves.toBeUndefined();
    await expect(service.restoreVerification('operator-1', 'target-1')).resolves.toBeUndefined();
  });
});

describe('B2 guard 2: suspension needs a réparateur', () => {
  it('refuses an account whose repairerEnabled is false', async () => {
    const { service } = makeDeps(target({ profile: { repairerEnabled: false } }));
    await expect(service.suspend('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow(/réparateur/i);
  });

  it('writes the three suspension columns together', async () => {
    const { service, prisma } = makeDeps();
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await service.suspend('admin-1', 'target-1', { reason: 'Propos abusifs', until });
    expect(prisma.profile.update.mock.calls[0]![0].data).toEqual({
      repairerSuspendedAt: expect.any(Date),
      repairerSuspendedUntil: new Date(until),
      repairerSuspendedReason: 'Propos abusifs',
    });
  });

  it('writes a null until for an indefinite suspension', async () => {
    const { service, prisma } = makeDeps();
    await service.suspend('admin-1', 'target-1', { reason: 'Propos abusifs' });
    expect(prisma.profile.update.mock.calls[0]![0].data.repairerSuspendedUntil).toBeNull();
  });

  it('refuses to suspend an already-suspended réparateur rather than re-stamping', async () => {
    const { service } = makeDeps(target({ profile: { repairerSuspendedAt: new Date() } }));
    await expect(service.suspend('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow(/déjà suspendu/);
  });

  it('clears all three columns on reactivate', async () => {
    const { service, prisma } = makeDeps(target({ profile: { repairerSuspendedAt: new Date() } }));
    await service.reactivate('admin-1', 'target-1');
    expect(prisma.profile.update.mock.calls[0]![0].data).toEqual({
      repairerSuspendedAt: null,
      repairerSuspendedUntil: null,
      repairerSuspendedReason: null,
    });
  });

  it('refuses to reactivate a réparateur who is not suspended', async () => {
    const { service } = makeDeps();
    await expect(service.reactivate('admin-1', 'target-1')).rejects.toThrow();
  });
});

describe('B2 guard 5: revocation and suspension are independent', () => {
  /**
   * Neither implies the other, so an operator can suspend a VERIFIED réparateur for conduct
   * without touching his identity claim, and revoke a claim without stopping him trading.
   * Asserted on the write shapes because coupling them is the kind of "helpful" change a
   * later reader makes.
   */
  it('revoking writes no suspension column', async () => {
    const { service, prisma } = makeDeps();
    await service.revokeVerification('admin-1', 'target-1', { reason: 'Faux document' });
    expect(prisma.profile.updateMany.mock.calls[0]![0].data).toEqual({
      verificationLevel: expect.any(String),
      verificationRevokedAt: expect.any(Date),
      verificationRevokedReason: 'Faux document',
    });
  });

  it('suspending writes no verification column', async () => {
    const { service, prisma } = makeDeps();
    await service.suspend('admin-1', 'target-1', { reason: 'Propos abusifs' });
    const data = prisma.profile.update.mock.calls[0]![0].data;
    expect('verificationLevel' in data).toBe(false);
    expect('verificationRevokedAt' in data).toBe(false);
  });
});

describe('a tombstone is not actionable', () => {
  it('refuses all four actions on a deleted account', async () => {
    const { service } = makeDeps(target({ profile: { deletedAt: new Date() } }));
    await expect(service.revokeVerification('a', 'target-1', { reason: 'x' })).rejects.toThrow(/supprimé/);
    await expect(service.restoreVerification('a', 'target-1')).rejects.toThrow(/supprimé/);
    await expect(service.suspend('a', 'target-1', { reason: 'x' })).rejects.toThrow(/supprimé/);
    await expect(service.reactivate('a', 'target-1')).rejects.toThrow(/supprimé/);
  });
});

describe('revokeVerification notifies VERIFICATION_REVOKED (CF4-E §3)', () => {
  it('emits after a successful revoke', async () => {
    const { service, emit } = makeDeps();
    await service.revokeVerification('admin-1', 'target-1', { reason: 'Faux document' });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      userId: 'target-1',
      mode: 'REPAIRER',
      type: 'VERIFICATION_REVOKED',
    });
  });

  /**
   * `writeRevocation` (aliased `revokeVerification` from `verification/revoke.js`) THROWS on
   * refusal or a race - a raced revocation matches no row - so a throw is the signal that
   * nothing was written and there is nothing to notify about.
   */
  it.each([
    ['self', () => makeDeps(target({ id: 'admin-1' })), 'admin-1', 'admin-1'],
    ['another admin', () => makeDeps(target({ role: 'admin' })), 'admin-1', 'target-1'],
    ['a deleted account', () => makeDeps(target({ profile: { deletedAt: new Date() } })), 'a', 'target-1'],
  ] as const)('does not emit on a refused revoke (%s)', async (_label, build, actorId, targetId) => {
    const { service, emit } = build();
    await expect(service.revokeVerification(actorId, targetId, { reason: 'x' })).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });
});
