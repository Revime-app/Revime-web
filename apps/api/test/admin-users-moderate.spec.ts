import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersWriteService } from '../src/admin/admin-users-write.service.js';
import { AppException } from '../src/common/app-exception.js';

const TARGET = {
  id: 'u1',
  role: 'user',
  profile: { deletedAt: null },
};

const makePrisma = () => ({
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  user: {
    findUnique: vi.fn().mockResolvedValue(TARGET),
    update: vi.fn().mockResolvedValue(TARGET),
  },
  profile: {
    update: vi.fn().mockResolvedValue({ avatarPath: null }),
  },
});

const makeUsersService = () => ({
  deleteAccount: vi.fn().mockResolvedValue(undefined),
});

describe('AdminUsersWriteService.moderate', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let usersService: ReturnType<typeof makeUsersService>;
  let service: AdminUsersWriteService;

  beforeEach(() => {
    prisma = makePrisma();
    usersService = makeUsersService();
    service = new AdminUsersWriteService(prisma as never, usersService as never);
  });

  it('returns a French 409 on a username collision', async () => {
    prisma.user.update = vi.fn().mockRejectedValue({
      code: 'P2002',
      meta: { target: ['username'] },
    });

    await expect(
      service.moderate('admin1', 'u1', { username: 'taken' }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Ce nom d'utilisateur est déjà pris.",
    });
  });

  it('throws on removeAvatar when the target has no profile', async () => {
    prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1',
      role: 'user',
      profile: null,
    });

    await expect(
      service.moderate('admin1', 'u1', { removeAvatar: true }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Aucun profil à modifier.',
    });
  });

  it('succeeds on removeAvatar when the target has a profile', async () => {
    await service.moderate('admin1', 'u1', { removeAvatar: true });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { avatarPath: null },
    });
  });

  it('updates username and name in a single transaction', async () => {
    await service.moderate('admin1', 'u1', { username: 'newname', name: 'New Name' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { username: 'newname', name: 'New Name' },
    });
  });
});
