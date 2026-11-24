import { describe, expect, it, vi } from 'vitest';
import { recordAuthAdminAction } from '../src/admin/admin-audit-bridge.js';

const makeCtx = (over: Record<string, unknown> = {}) => ({
  path: '/admin/impersonate-user',
  body: { userId: 'target-1' },
  context: {
    session: { user: { id: 'admin-1', email: 'ops@revime.fr' } },
    returned: undefined,
  },
  ...over,
});

const makePrisma = (create = vi.fn().mockResolvedValue({})) => ({
  adminAuditLog: { create },
});

describe('recordAuthAdminAction', () => {
  it('writes one row naming the actor and the target', async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordAuthAdminAction(makePrisma(create), makeCtx() as never, () => {});

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]![0]!.data;
    expect(data.action).toBe('auth.admin.impersonate');
    expect(data.actorUserId).toBe('admin-1');
    expect(data.actorEmail).toBe('ops@revime.fr');
    expect(data.targetType).toBe('User');
    expect(data.targetId).toBe('target-1');
  });

  it('writes nothing for a non-admin path', async () => {
    const create = vi.fn();
    await recordAuthAdminAction(makePrisma(create), makeCtx({ path: '/sign-in/email' }) as never, () => {});
    expect(create).not.toHaveBeenCalled();
  });

  // The path is recoverable even for an endpoint this version has never seen.
  it('records an unknown admin path as auth.admin.other, keeping the path in detail', async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordAuthAdminAction(makePrisma(create), makeCtx({ path: '/admin/brand-new' }) as never, () => {});

    const data = create.mock.calls[0]![0]!.data;
    expect(data.action).toBe('auth.admin.other');
    expect(data.detail).toEqual({ path: '/admin/brand-new' });
  });

  // 🛑 Same rule as AdminAuditService: an audit write must never fail the action.
  it('never throws when the insert fails, and reports through onError', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const onError = vi.fn();
    await expect(
      recordAuthAdminAction(makePrisma(create), makeCtx() as never, onError),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  /**
   * 🛑 REVERSED after review. An earlier draft asserted the opposite - that an
   * unauthenticated caller IS recorded. The reviewer traced end-to-end that an
   * unauthenticated POST from the public internet reaches this hook and writes a row
   * carrying an attacker-supplied `targetId`, with no rate limit configured.
   *
   * The table exists because Ch.8 requires « l'ensemble des actions réalisées depuis le
   * Dashboard » be historisé, and a caller with no session took no action FROM the
   * Dashboard - it is a probe, and probes belong in the request log.
   */
  it('writes NOTHING when there is no session, so the table cannot be flooded', async () => {
    const create = vi.fn();
    const ctx = makeCtx({ context: { session: undefined } });
    await recordAuthAdminAction(makePrisma(create), ctx as never, () => {});
    expect(create).not.toHaveBeenCalled();
  });

  /**
   * 🛑 And the case the guard above must NOT swallow: a signed-in NON-admin has a
   * session, so their refusal is still recorded - with a real actor and a real 403. That
   * is exactly the gap piece A's residual #1 named (guard-layer refusals unaudited).
   */
  it('records a signed-in caller whose call was refused, with the real status', async () => {
    const create = vi.fn().mockResolvedValue({});
    const apiError = Object.assign(new Error('forbidden'), {
      name: 'APIError',
      statusCode: 403,
      status: 'FORBIDDEN',
    });
    const ctx = makeCtx({
      context: {
        session: { user: { id: 'nonadmin-1', email: 'client@example.fr' } },
        returned: apiError,
      },
    });
    await recordAuthAdminAction(makePrisma(create), ctx as never, () => {});

    const data = create.mock.calls[0]![0]!.data;
    expect(data.actorUserId).toBe('nonadmin-1');
    expect(data.statusCode).toBe(403);
  });
});
