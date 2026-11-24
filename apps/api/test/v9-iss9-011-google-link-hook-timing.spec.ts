import { describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getOAuthState } from 'better-auth/api';
import { queueAfterTransactionHook, runWithAdapter, runWithEndpointContext, runWithRequestState } from '@better-auth/core/context';
import { googleStepUpAccountUpdateHooks } from '../src/security/google-step-up-link.js';

/**
 * V9 `ISS9-011` (`CLIENT_FEEDBACK_V9.md` `FND9-029`). On the live API every Google step-up confirmation
 * answered 422: the account update hook read the OAuth state with `getOAuthState()`, but Better Auth runs
 * `after` database hooks once the request state is gone. Better Auth's HTTP handler is
 * `runWithAdapter(adapter, () => handler(request))` (`auth/base.mjs`), the request state is opened inside
 * `handler(request)` (`api/to-auth-endpoints.mjs`), and `after` hooks are queued with
 * `queueAfterTransactionHook` and run by `runWithAdapter` after `handler(request)` returns.
 *
 * These tests use Better Auth's own primitives and its real hook pipeline (memory adapter), nested the way
 * the HTTP handler nests them, so the hook's timing is Better Auth's, not a mock's.
 */
const NONCE = 'n0nce_'.padEnd(32, 'x');
const LINK_STATE = { stepUpNonce: NONCE, link: { userId: 'u1', email: 'g@example.com' } };

/** Like `getOAuthState()` in production: throws outside Better Auth's request state, else returns `state`. */
const stateInRequest = (state: unknown) => async () => {
  await getOAuthState();
  return state;
};

function makeAuth(getState: () => Promise<unknown>) {
  const prisma = { verification: { deleteMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) } };
  const log = vi.fn();
  const now = new Date();
  const db = {
    user: [{ id: 'u1', name: 'U', email: 'g@example.com', emailVerified: true, createdAt: now, updatedAt: now }],
    account: [{ id: 'a1', userId: 'u1', providerId: 'google', accountId: 'g-sub-1', createdAt: now, updatedAt: now }],
    session: [],
    verification: [],
  };
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: 'test-secret-'.padEnd(40, 'x'),
    baseURL: 'http://localhost:3002',
    logger: { disabled: true },
    databaseHooks: { account: { update: googleStepUpAccountUpdateHooks(prisma as never, { getState, log }) } },
  });
  return { auth, prisma, log, db };
}

/** Better Auth's link callback, as the HTTP handler nests it: adapter scope › request state › endpoint. */
async function linkCallbackUpdate(auth: ReturnType<typeof makeAuth>['auth'], providerId: string) {
  const ctx = await auth.$context;
  return runWithAdapter(ctx.adapter, () =>
    runWithRequestState(new WeakMap(), () =>
      runWithEndpointContext({ params: { id: providerId }, path: '/callback/:id', context: ctx } as never, () =>
        ctx.internalAdapter.updateAccount('a1', { accessToken: 'fresh-token' }),
      ),
    ),
  );
}

describe('V9 ISS9-011 Better Auth hook timing (the root cause)', () => {
  it('an after-transaction hook cannot read the OAuth state: the request state is gone', async () => {
    let seen: unknown = 'not run';
    await runWithAdapter({} as never, () =>
      runWithRequestState(new WeakMap(), async () => {
        expect(await getOAuthState()).toBeNull(); // inside the request: readable
        await queueAfterTransactionHook(async () => {
          seen = await getOAuthState().catch((e: unknown) => e);
        });
      }),
    );
    expect(seen).toBeInstanceOf(Error);
    expect((seen as Error).message).toMatch(/No request state found/);
  });
});

describe('V9 ISS9-011 the Google link is recorded during the link callback', () => {
  it('records the link for this nonce when Google re-links this account', async () => {
    const { auth, prisma, log, db } = makeAuth(stateInRequest(LINK_STATE));
    await linkCallbackUpdate(auth, 'google');
    expect(db.account[0]).toMatchObject({ accessToken: 'fresh-token' });
    expect(log).not.toHaveBeenCalled();
    expect(prisma.verification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ identifier: `step-up-google-linked:${NONCE}`, value: 'u1' }),
    });
  });

  it('records nothing for another provider, a state with no nonce or no link, or no request at all', async () => {
    for (const [provider, state] of [
      ['apple', LINK_STATE],
      ['google', { link: { userId: 'u1' } }],
      ['google', { stepUpNonce: NONCE }],
      ['google', null],
    ] as const) {
      const { auth, prisma } = makeAuth(stateInRequest(state));
      await linkCallbackUpdate(auth, provider);
      expect(prisma.verification.create).not.toHaveBeenCalled();
    }
    // An account update outside any request (a token refresh, a script) still succeeds and records nothing.
    const { auth, prisma, db } = makeAuth(stateInRequest(LINK_STATE));
    const ctx = await auth.$context;
    await ctx.internalAdapter.updateAccount('a1', { accessToken: 'outside' });
    expect(db.account[0]).toMatchObject({ accessToken: 'outside' });
    expect(prisma.verification.create).not.toHaveBeenCalled();
  });

  it('a failed record never blocks the account update', async () => {
    const { auth, prisma, log, db } = makeAuth(stateInRequest(LINK_STATE));
    prisma.verification.create.mockRejectedValueOnce(new Error('db down'));
    await linkCallbackUpdate(auth, 'google');
    expect(db.account[0]).toMatchObject({ accessToken: 'fresh-token' });
    expect(log).toHaveBeenCalledWith('[step-up] could not record the Google link', { userId: 'u1', error: 'Error' });
  });
});
