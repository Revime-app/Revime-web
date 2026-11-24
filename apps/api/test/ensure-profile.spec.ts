import { describe, expect, it, vi } from 'vitest';
import { ensureProfileForUser } from '../src/auth/ensure-profile.js';

describe('ensureProfileForUser', () => {
  it('creates a profile with correct defaults on happy path', async () => {
    const mockPrisma = {
      profile: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await ensureProfileForUser(mockPrisma, { id: 'user-123' });

    expect(mockPrisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      create: {
        userId: 'user-123',
        clientEnabled: true,
        repairerEnabled: false,
        activeMode: 'CLIENT',
      },
      update: {},
    });
  });

  it('deletes the orphaned user and rethrows when upsert fails', async () => {
    const upsertError = new Error('Profile creation failed');
    const mockPrisma = {
      profile: {
        upsert: vi.fn().mockRejectedValue(upsertError),
      },
      user: {
        delete: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(ensureProfileForUser(mockPrisma, { id: 'user-456' })).rejects.toThrow(
      'Profile creation failed',
    );

    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-456' } });
  });

  it('logs loudly and rethrows original error when both upsert and delete fail', async () => {
    const upsertError = new Error('Profile creation failed');
    const deleteError = new Error('User delete failed');
    const mockPrisma = {
      profile: {
        upsert: vi.fn().mockRejectedValue(upsertError),
      },
      user: {
        delete: vi.fn().mockRejectedValue(deleteError),
      },
    } as any;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureProfileForUser(mockPrisma, { id: 'user-789' })).rejects.toThrow(
      'Profile creation failed',
    );

    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-789' } });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'CRITICAL: Profile creation failed AND user cleanup failed for user user-789',
      ),
      expect.objectContaining({
        originalError: upsertError,
        deleteError: deleteError,
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});
