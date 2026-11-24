import { describe, expect, it, vi } from 'vitest';
import { AdminStaffService } from '../src/admin/admin-staff.service.js';
import { resetTwoFactorForEmail } from '../scripts/reset-admin-2fa.js';

/**
 * CF4-40 / CF4-41, spec §4.3 - §4.4. Review Focus 3 (two Super Admins demoting each other at
 * once: one must remain, serialisation failure → 409) and 5 (a change takes effect at once:
 * the target's sessions are deleted in the same transaction).
 */

type Row = { id: string; role: string | null; profile: { deletedAt: Date | null } | null } | null;

const harness = (target: Row, superAdmins = 2) => {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue(target),
      count: vi.fn().mockResolvedValue(superAdmins),
      update: vi.fn().mockResolvedValue({}),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    twoFactor: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>, _opts?: unknown) => fn(tx)),
  };
  return { tx, prisma, service: new AdminStaffService(prisma as never) };
};

const staff = (role: string | null, deletedAt: Date | null = null): Row => ({
  id: 'target-1',
  role,
  profile: { deletedAt },
});

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { getStatus: () => number; message: string };
    return { status: err.getStatus(), message: err.message };
  }
};

describe('AdminStaffService.changeRole', () => {
  it('refuses the actor changing their own role', async () => {
    const { service, prisma } = harness(staff('super_admin'));
    expect(await failure(service.changeRole('target-1', 'target-1', { role: 'admin' }))).toEqual({
      status: 422,
      message: 'Vous ne pouvez pas modifier votre propre rôle.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s an unknown account', async () => {
    const { service } = harness(null);
    expect(await failure(service.changeRole('actor', 'target-1', { role: 'admin' }))).toEqual({
      status: 404,
      message: 'Utilisateur introuvable.',
    });
  });

  it('refuses a deleted account with the B2 message', async () => {
    const { service, tx } = harness(staff(null, new Date()));
    expect(await failure(service.changeRole('actor', 'target-1', { role: 'support' }))).toEqual({
      status: 422,
      message: "Ce compte est supprimé. Aucune modification n'est possible.",
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it.each([['admin'], [null]] as const)('refuses demoting when only 2 Super Admins remain (%s), writing nothing (CF5-01)', async (role) => {
    const { service, tx } = harness(staff('super_admin'), 2);
    expect(await failure(service.changeRole('actor', 'target-1', { role }))).toEqual({
      status: 409,
      message: 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.',
    });
    expect(tx.user.count).toHaveBeenCalledWith({ where: { role: 'super_admin', profile: { deletedAt: null } } });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it('demotes one of three Super Admins and ends their sessions, in one Serializable transaction (CF5-01)', async () => {
    const { service, tx, prisma } = harness(staff('super_admin'), 3);
    await expect(service.changeRole('actor', 'target-1', { role: 'finance' })).resolves.toEqual({ ok: true });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'target-1' }, data: { role: 'finance' } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
    expect(prisma.$transaction.mock.calls[0]![1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('turns a serialisation failure (P2034) into a 409, never a success', async () => {
    const { service, prisma } = harness(staff('super_admin'), 2);
    prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2034' }));
    const res = await failure(service.changeRole('actor', 'target-1', { role: 'admin' }));
    expect(res?.status).toBe(409);
  });

  it('lets other errors through unchanged', async () => {
    const { service, prisma } = harness(staff('super_admin'), 2);
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(service.changeRole('actor', 'target-1', { role: 'admin' })).rejects.toThrow('db down');
  });

  it('promotes a non-staff account and ends its sessions (Review Focus 5)', async () => {
    const { service, tx } = harness(staff('user'));
    await service.changeRole('actor', 'target-1', { role: 'support' });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'target-1' }, data: { role: 'support' } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
    expect(tx.user.count).not.toHaveBeenCalled();
  });

  it('removing a staff role writes null', async () => {
    const { service, tx } = harness(staff('moderation'));
    await service.changeRole('actor', 'target-1', { role: null });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'target-1' }, data: { role: null } });
  });
});

describe('AdminStaffService.resetTwoFactor', () => {
  it('refuses the actor resetting their own second factor', async () => {
    const { service } = harness(staff('super_admin'));
    expect(await failure(service.resetTwoFactor('target-1', 'target-1'))).toEqual({
      status: 422,
      message: 'Vous ne pouvez pas réinitialiser votre propre double authentification.',
    });
  });

  it('refuses a non-staff account', async () => {
    const { service, tx } = harness(staff('user'));
    expect(await failure(service.resetTwoFactor('actor', 'target-1'))).toEqual({
      status: 422,
      message: "Ce compte ne fait pas partie de l'équipe.",
    });
    expect(tx.twoFactor.deleteMany).not.toHaveBeenCalled();
  });

  it('404s an unknown account', async () => {
    const { service } = harness(null);
    expect((await failure(service.resetTwoFactor('actor', 'target-1')))?.status).toBe(404);
  });

  it('deletes the factor, clears the flag and ends every session, in one transaction', async () => {
    const { service, tx, prisma } = harness(staff('support'));
    await expect(service.resetTwoFactor('actor', 'target-1')).resolves.toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.twoFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'target-1' }, data: { twoFactorEnabled: false } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
  });
});

describe('resetTwoFactorForEmail (recovery script)', () => {
  it('performs the same three writes for the account with that e-mail', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn() },
      twoFactor: { deleteMany: vi.fn() },
      session: { deleteMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    await resetTwoFactorForEmail(prisma as never, 'boss@revime.fr');
    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: { email: 'boss@revime.fr' }, select: { id: true } });
    expect(tx.twoFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { twoFactorEnabled: false } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('throws for an unknown e-mail', async () => {
    const tx = { user: { findFirst: vi.fn().mockResolvedValue(null) } };
    const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
    await expect(resetTwoFactorForEmail(prisma as never, 'nobody@x.fr')).rejects.toThrow();
  });
});
