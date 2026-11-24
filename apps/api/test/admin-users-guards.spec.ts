import { describe, expect, it, vi } from 'vitest';
import { AdminUsersWriteService } from '../src/admin/admin-users-write.service.js';

/** Amended 2026-11-20 (V9 U3): the dashboard's deletion also says it revokes as ADMIN, with no confirmation. */
const ADMIN_REVOKE = { revoke: { source: 'ADMIN', confirmation: null } };

const target = (over: Record<string, unknown> = {}) => ({
  id: 'target-1',
  role: 'user',
  profile: { deletedAt: null },
  ...over,
});

const makeDeps = (
  targetRow: unknown = target(),
  actorRow: unknown = target({ id: 'actor-1', role: 'super_admin' }),
) => {
  const prisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === (targetRow as { id?: string })?.id) return Promise.resolve(targetRow);
        if (where.id === (actorRow as { id?: string })?.id) return Promise.resolve(actorRow);
        return Promise.resolve(null);
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    profile: { update: vi.fn().mockResolvedValue({}) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  };
  const users = { deleteAccount: vi.fn().mockResolvedValue(undefined) };
  return { prisma, users, service: new AdminUsersWriteService(prisma as never, users as never) };
};

describe('guard 1: an operator cannot lock himself or another admin out', () => {
  /**
   * 🛑 THE MOST EXPENSIVE MISTAKE THIS PIECE CAN MAKE.
   * Self-suspension and self-deletion are always refused.
   */
  it('refuses to suspend yourself', async () => {
    const { service } = makeDeps(target({ id: 'admin-1' }), target({ id: 'admin-1', role: 'super_admin' }));
    await expect(service.suspend('admin-1', 'admin-1', { reason: 'oops' })).rejects.toThrow();
  });

  it('refuses to delete yourself', async () => {
    const { service } = makeDeps(target({ id: 'admin-1' }), target({ id: 'admin-1', role: 'super_admin' }));
    await expect(service.remove('admin-1', 'admin-1', { reason: 'oops' })).rejects.toThrow();
  });

  it('refuses non-super_admin actors from deleting staff accounts', async () => {
    const nonSuperAdmin = target({ id: 'admin-actor', role: 'admin' });
    const staffTarget = target({ id: 'staff-target', role: 'moderation' });
    const { service } = makeDeps(staffTarget, nonSuperAdmin);
    await expect(service.remove('admin-actor', 'staff-target', { reason: 'x' })).rejects.toThrow(
      "Seul un Super Admin peut supprimer un compte administrateur.",
    );
  });

  // CF5-08: A Super Admin CAN delete staff accounts (moderation, support, finance, read_only, admin)
  it.each(['admin', 'moderation', 'support', 'finance', 'read_only'])(
    'allows a super_admin to delete a %s staff account',
    async (role) => {
      const superAdmin = target({ id: 'super-1', role: 'super_admin' });
      const staffTarget = target({ id: 'staff-target', role });
      const { service, users } = makeDeps(staffTarget, superAdmin);
      await service.remove('super-1', 'staff-target', { reason: 'Compte employé révoqué' });
      expect(users.deleteAccount).toHaveBeenCalledWith('staff-target', ADMIN_REVOKE);
    },
  );

  it('allows a super_admin to delete another super_admin (delegating to deleteAccount threshold check)', async () => {
    const superAdmin = target({ id: 'super-1', role: 'super_admin' });
    const otherSuperAdmin = target({ id: 'super-2', role: 'super_admin' });
    const { service, users } = makeDeps(otherSuperAdmin, superAdmin);
    await service.remove('super-1', 'super-2', { reason: 'Départ du super admin' });
    expect(users.deleteAccount).toHaveBeenCalledWith('super-2', ADMIN_REVOKE);
  });

  it('propagates the <= 2 Super Admin threshold conflict from UsersService.deleteAccount', async () => {
    const superAdmin = target({ id: 'super-1', role: 'super_admin' });
    const otherSuperAdmin = target({ id: 'super-2', role: 'super_admin' });
    const { service, users } = makeDeps(otherSuperAdmin, superAdmin);
    users.deleteAccount = vi.fn().mockRejectedValue(
      new Error('Ce compte est Super Admin. La plateforme doit conserver au moins 2 Super Admins actifs en permanence.'),
    );
    await expect(service.remove('super-1', 'super-2', { reason: 'x' })).rejects.toThrow(
      'Ce compte est Super Admin. La plateforme doit conserver au moins 2 Super Admins actifs en permanence.',
    );
  });

  it('refuses to suspend staff accounts', async () => {
    const { service } = makeDeps(
      target({ id: 'staff-1', role: 'admin' }),
      target({ id: 'super-1', role: 'super_admin' }),
    );
    await expect(service.suspend('super-1', 'staff-1', { reason: 'x' })).rejects.toThrow(
      "Ce compte est un compte administrateur. L'action est refusée.",
    );
  });

  it('still allows suspending an account whose role is null', async () => {
    const { service, prisma } = makeDeps(target({ id: 'plain-1', role: null }));
    await service.suspend('admin-1', 'plain-1', { reason: 'x' });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('allows suspending an ordinary account', async () => {
    const { service, prisma } = makeDeps();
    await service.suspend('admin-1', 'target-1', { reason: 'Propos abusifs' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-1' },
      data: { banned: true, banReason: 'Propos abusifs', banExpires: null },
    });
  });

  it('ALLOWS reactivating an admin account, because that is the recovery path', async () => {
    const { service, prisma } = makeDeps(target({ id: 'admin-1', role: 'admin' }));
    await service.reactivate('operator-1', 'admin-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { banned: false, banReason: null, banExpires: null },
    });
  });
});

describe('guard 3: suspending ends the sessions already open', () => {
  /**
   * 🛑 Better Auth enforces the ban in databaseHooks.session.create.before, so it blocks
   * a NEW sign-in and does nothing to a live session. deleteAccount already knows this.
   * Without this the suspended user stays signed in until their token expires.
   */
  it('deletes the target sessions', async () => {
    const { service, prisma } = makeDeps();
    await service.suspend('admin-1', 'target-1', { reason: 'Propos abusifs' });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
  });

  it('writes banExpires when an expiry is given, and null when it is not', async () => {
    const { service, prisma } = makeDeps();
    await service.suspend('admin-1', 'target-1', {
      reason: 'x',
      until: '2026-09-12T00:00:00.000Z',
    });
    expect(prisma.user.update.mock.calls[0]![0].data.banExpires).toEqual(
      new Date('2026-09-12T00:00:00.000Z'),
    );

    await service.suspend('admin-1', 'target-1', { reason: 'x' });
    expect(prisma.user.update.mock.calls[1]![0].data.banExpires).toBeNull();
  });
});

describe('guard 4: a tombstone is not editable', () => {
  const deleted = target({ profile: { deletedAt: new Date('2026-08-30T00:00:00.000Z') } });

  it('refuses suspend, reactivate and moderate on a deleted account', async () => {
    const { service } = makeDeps(deleted);
    await expect(service.suspend('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow();
    await expect(service.reactivate('admin-1', 'target-1')).rejects.toThrow();
    await expect(service.moderate('admin-1', 'target-1', { username: 'ok' })).rejects.toThrow();
  });
});

describe('reactivate clears all three ban columns', () => {
  it('clears banned, banReason and banExpires together', async () => {
    const { service, prisma } = makeDeps();
    await service.reactivate('admin-1', 'target-1');
    expect(prisma.user.update.mock.calls[0]![0].data).toEqual({
      banned: false,
      banReason: null,
      banExpires: null,
    });
  });
});

describe('moderate writes only the fields it was given', () => {
  it('writes a username without touching the display name', async () => {
    const { service, prisma } = makeDeps();
    await service.moderate('admin-1', 'target-1', { username: 'camille' });
    expect(prisma.user.update.mock.calls[0]![0].data).toEqual({ username: 'camille' });
  });

  it('writes a display name without touching the username', async () => {
    const { service, prisma } = makeDeps();
    await service.moderate('admin-1', 'target-1', { name: 'Camille Dupont' });
    expect(prisma.user.update.mock.calls[0]![0].data).toEqual({ name: 'Camille Dupont' });
  });

  it('clears the avatar path on Profile when asked', async () => {
    const { service, prisma } = makeDeps();
    await service.moderate('admin-1', 'target-1', { removeAvatar: true });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: 'target-1' },
      data: { avatarPath: null },
    });
  });
});

describe('remove delegates to the existing soft delete', () => {
  /**
   * Reusing deleteAccount rather than reimplementing it: it already handles eleven
   * tables, a Stripe redaction and storage cleanup, and it honours the roadmap's
   * anonymise-in-place constraint. Its escrow refusal applies to an admin too, which
   * is correct - the platform is holding that pair's money.
   */
  it('calls UsersService.deleteAccount and never prisma.user.delete', async () => {
    const { service, users } = makeDeps();
    await service.remove('admin-1', 'target-1', { reason: 'Compte non conforme' });
    expect(users.deleteAccount).toHaveBeenCalledWith('target-1', ADMIN_REVOKE);
  });

  it('lets the escrow refusal propagate rather than swallowing it', async () => {
    const { service, users } = makeDeps();
    users.deleteAccount = vi.fn().mockRejectedValue(new Error('réparation en cours'));
    await expect(service.remove('admin-1', 'target-1', { reason: 'x' })).rejects.toThrow(
      'réparation en cours',
    );
  });

  it('is idempotent on an already-deleted account (Guard 4 deliberately absent)', async () => {
    const deleted = target({ profile: { deletedAt: new Date('2026-08-30T00:00:00.000Z') } });
    const { service, users } = makeDeps(deleted);
    await service.remove('admin-1', 'target-1', { reason: 'retry' });
    expect(users.deleteAccount).toHaveBeenCalledWith('target-1', ADMIN_REVOKE);
  });
});
