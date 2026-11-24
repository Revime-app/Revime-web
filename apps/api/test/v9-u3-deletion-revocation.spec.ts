import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { AdminUsersWriteService } from '../src/admin/admin-users-write.service.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (5), `DEC9-09` (5), `DEC9-10` (2)). The revocation runs after the
 * escrow refusal and before the scrub; its outcome never stops the deletion. The app's deletion revokes
 * with the session's confirmation; the dashboard's with none.
 */
const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

function harness(blocking = 0, outcome: 'REVOKED' | 'FAILED' = 'FAILED') {
  const order: string[] = [];
  const tx = new Proxy(
    {},
    {
      get: (_t, model) =>
        new Proxy(
          {},
          {
            get: (_m, op) =>
              vi.fn(async () => {
                if (model === 'user' && op === 'findUnique') return { role: 'user' };
                if (model === 'user' && op === 'count') return 3;
                if (op === 'findUnique' || op === 'findFirst') return null;
                if (op === 'findMany') return [];
                return { count: 0 };
              }),
          },
        ),
    },
  );
  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ userId: USER, deletedAt: null }) },
    commande: { count: vi.fn().mockResolvedValue(blocking) },
    identityVerification: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<void>) => {
      order.push('scrub');
      await fn(tx);
    }),
  };
  const revocation = {
    revokeAll: vi.fn(async () => {
      order.push('revoke');
      return [{ provider: 'GOOGLE', result: outcome }];
    }),
  };
  const service = new UsersService(prisma as never, { lookup: vi.fn() } as never, revocation as never);
  return { service, prisma, revocation, order };
}

describe('V9 U3 UsersService.deleteAccount with a revocation', () => {
  it('revokes first, then scrubs', async () => {
    const t = harness();
    await t.service.deleteAccount(USER, { revoke: { source: 'SELF', confirmation: { provider: 'GOOGLE' } } });
    expect(t.order).toEqual(['revoke', 'scrub']);
    expect(t.revocation.revokeAll).toHaveBeenCalledWith({ userId: USER, source: 'SELF', confirmation: { provider: 'GOOGLE' } });
  });

  it('a refused revocation still deletes the account', async () => {
    const t = harness(0, 'FAILED');
    await t.service.deleteAccount(USER, { revoke: { source: 'SELF', confirmation: null } });
    expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('an escrow refusal revokes nothing', async () => {
    const t = harness(1);
    await expect(t.service.deleteAccount(USER, { revoke: { source: 'SELF', confirmation: null } })).rejects.toBeInstanceOf(AppException);
    expect(t.revocation.revokeAll).not.toHaveBeenCalled();
  });

  it('no revoke option: no revocation (callers that predate U3)', async () => {
    const t = harness();
    await t.service.deleteAccount(USER);
    expect(t.revocation.revokeAll).not.toHaveBeenCalled();
    expect(t.order).toEqual(['scrub']);
  });
});

describe('V9 U3 the two callers', () => {
  const session = { session: { id: 'sess-1' }, user: { id: 'u1', email: 'ana@example.com' } } as never;

  it('the app passes the consumed confirmation, source SELF', async () => {
    const users = { deleteAccount: vi.fn(async () => {}) };
    const security = { assertDeletionConfirmed: vi.fn(async () => ({ provider: 'APPLE', appleAuthorizationCode: 'c1' })) };
    await new UsersController(users as never, security as never).deleteAccount(session);
    expect(security.assertDeletionConfirmed).toHaveBeenCalledWith({ userId: 'u1', sessionId: 'sess-1' });
    expect(users.deleteAccount).toHaveBeenCalledWith('u1', {
      revoke: { source: 'SELF', confirmation: { provider: 'APPLE', appleAuthorizationCode: 'c1' } },
    });
  });

  it('a refused confirmation deletes nothing', async () => {
    const users = { deleteAccount: vi.fn(async () => {}) };
    const security = { assertDeletionConfirmed: vi.fn(async () => Promise.reject(new AppException('STEP_UP_REQUIRED', 'x'))) };
    await expect(new UsersController(users as never, security as never).deleteAccount(session)).rejects.toBeInstanceOf(AppException);
    expect(users.deleteAccount).not.toHaveBeenCalled();
  });

  it('the dashboard passes source ADMIN and no confirmation', async () => {
    const users = { deleteAccount: vi.fn(async () => {}) };
    const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'target-1', role: 'user', banned: false, profile: { deletedAt: null } })) } };
    await new AdminUsersWriteService(prisma as never, users as never).remove('actor-1', 'target-1', { reason: 'test' } as never);
    expect(users.deleteAccount).toHaveBeenCalledWith('target-1', { revoke: { source: 'ADMIN', confirmation: null } });
  });
});

describe('V9 U3 the TEMP CF4-04 diagnostic is gone (ISS9-007)', () => {
  it('social-providers.ts no longer wraps Apple with it', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/auth/social-providers.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/apple-id-token-diagnostic|withAppleRejectionDiagnostic/);
  });
});
