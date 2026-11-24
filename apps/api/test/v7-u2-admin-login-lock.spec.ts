import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersWriteService } from '../src/admin/admin-users-write.service.js';
import { AppException } from '../src/common/app-exception.js';
import { detailUser, makeUsersService } from './admin-user-detail-fixture.js';

/**
 * V7 A11 (U2, Q6). The user sheet shows the lock in force and the lock history; an operator with
 * `users.moderate` lifts it, audited. A staff account's lock is lifted by a super admin only, since
 * it is the D3 protection on the dashboard itself.
 */
const NOW = new Date('2026-10-28T10:00:00.000Z');
const LATER = new Date('2026-10-28T10:15:00.000Z');

describe('the user sheet’s « Blocage de connexion » block', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('reads the locks in force by normalised e-mail, and the history by user', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ email: 'Camille@Example.com' }));
    prisma.authThrottle.findMany.mockResolvedValue([{ scope: 'LOGIN_ACCOUNT', level: 2, lockedUntil: LATER }]);
    prisma.authLockEvent.findMany.mockResolvedValue([
      {
        id: 'ev2',
        kind: 'LOCK',
        scope: 'LOGIN_ACCOUNT',
        level: 2,
        lockedUntil: LATER,
        createdAt: NOW,
        unlockedAt: null,
        unlockReason: null,
      },
      {
        id: 'ev1',
        kind: 'SECURED',
        scope: 'CODE_ACCOUNT',
        level: 1,
        lockedUntil: new Date('2026-10-27T09:15:00.000Z'),
        createdAt: new Date('2026-10-27T09:00:00.000Z'),
        unlockedAt: new Date('2026-10-27T09:05:00.000Z'),
        unlockReason: 'ADMIN',
      },
    ]);

    const { loginLock } = await service.detail('usr-1');

    expect(prisma.authThrottle.findMany).toHaveBeenCalledWith({
      where: { scope: { in: ['LOGIN_ACCOUNT', 'CODE_ACCOUNT'] }, key: 'camille@example.com', lockedUntil: { gt: NOW } },
      select: { scope: true, level: true, lockedUntil: true },
    });
    expect(prisma.authLockEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'usr-1', scope: { in: ['LOGIN_ACCOUNT', 'CODE_ACCOUNT'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, scope: true, level: true, lockedUntil: true, createdAt: true, unlockedAt: true, unlockReason: true },
    });
    expect(loginLock).toEqual({
      active: [{ scope: 'LOGIN_ACCOUNT', level: 2, lockedUntil: LATER.toISOString() }],
      history: [
        {
          id: 'ev2',
          kind: 'LOCK',
          scope: 'LOGIN_ACCOUNT',
          level: 2,
          lockedUntil: LATER.toISOString(),
          createdAt: NOW.toISOString(),
          unlockedAt: null,
          unlockReason: null,
        },
        {
          id: 'ev1',
          kind: 'SECURED',
          scope: 'CODE_ACCOUNT',
          level: 1,
          lockedUntil: '2026-10-27T09:15:00.000Z',
          createdAt: '2026-10-27T09:00:00.000Z',
          unlockedAt: '2026-10-27T09:05:00.000Z',
          unlockReason: 'ADMIN',
        },
      ],
    });
  });

  it('is null for a deleted account', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({ profile: { ...detailUser().profile!, deletedAt: new Date('2026-10-01T00:00:00Z') } }),
    );
    expect((await service.detail('usr-1')).loginLock).toBeNull();
    expect(prisma.authThrottle.findMany).not.toHaveBeenCalled();
  });
});

describe('unlockLogin', () => {
  const people: Record<string, { id: string; email: string; role: string | null; profile: { deletedAt: Date | null } }> = {
    target: { id: 'target', email: 'Camille@Example.com', role: 'user', profile: { deletedAt: null } },
    staff: { id: 'staff', email: 'ops@revime.fr', role: 'support', profile: { deletedAt: null } },
    gone: { id: 'gone', email: 'deleted_gone@revime.invalid', role: 'user', profile: { deletedAt: new Date() } },
    mod: { id: 'mod', email: 'mod@revime.fr', role: 'moderation', profile: { deletedAt: null } },
    boss: { id: 'boss', email: 'boss@revime.fr', role: 'super_admin', profile: { deletedAt: null } },
  };

  function setup(lockedRows = 1) {
    const prisma = {
      user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => people[where.id] ?? null) },
      authThrottle: {
        count: vi.fn(async () => lockedRows),
        deleteMany: vi.fn(async () => ({ count: lockedRows })),
      },
      authLockEvent: { updateMany: vi.fn(async () => ({ count: 1 })) },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new AdminUsersWriteService(prisma as never, {} as never);
    return { prisma, service };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('lifts both counters and closes the open history rows with the operator', async () => {
    const { prisma, service } = setup();
    await service.unlockLogin('mod', 'target');
    expect(prisma.authThrottle.deleteMany).toHaveBeenCalledWith({
      where: { scope: { in: ['LOGIN_ACCOUNT', 'CODE_ACCOUNT'] }, key: 'camille@example.com' },
    });
    expect(prisma.authLockEvent.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', unlockedAt: null, lockedUntil: { gt: NOW } },
      data: { unlockedAt: NOW, unlockedByUserId: 'mod', unlockReason: 'ADMIN' },
    });
  });

  it('refuses when nothing is locked', async () => {
    const { prisma, service } = setup(0);
    await expect(service.unlockLogin('mod', 'target')).rejects.toThrow(
      new AppException('UNPROCESSABLE_ENTITY', 'Aucun blocage de connexion en cours sur ce compte.'),
    );
    expect(prisma.authThrottle.deleteMany).not.toHaveBeenCalled();
  });

  it('leaves a staff account’s lock to a super admin', async () => {
    const { prisma, service } = setup();
    await expect(service.unlockLogin('mod', 'staff')).rejects.toThrow(
      new AppException('FORBIDDEN', 'Seul un Super Admin peut débloquer un compte de l’équipe.'),
    );
    expect(prisma.authThrottle.deleteMany).not.toHaveBeenCalled();
    await service.unlockLogin('boss', 'staff');
    expect(prisma.authThrottle.deleteMany).toHaveBeenCalledOnce();
  });

  it('refuses a deleted account and an unknown one', async () => {
    const { service } = setup();
    await expect(service.unlockLogin('mod', 'gone')).rejects.toBeInstanceOf(AppException);
    await expect(service.unlockLogin('mod', 'nobody')).rejects.toThrow(new AppException('NOT_FOUND', 'Utilisateur introuvable.'));
  });
});
