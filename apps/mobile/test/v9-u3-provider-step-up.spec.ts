import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { STEP_UP_COPY } from '@revime/shared';

// api.ts imports the auth client, which loads Expo's native modules; Node cannot.
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));
vi.mock('../src/lib/apple-auth', () => ({ appleAuth: () => null, isAppleAuthAvailable: () => false }));

import { confirmWithApple, confirmWithGoogle } from '../src/lib/provider-step-up';
import { ApiError } from '../src/lib/api';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (1), `DEC9-09` (1), (8)). The app half of « reconnectez-vous avec
 * Apple / Google »: Apple's native sheet, then the server's check; Google through Better Auth's
 * `linkSocial` between a start and a confirm.
 */
const unprocessable = (message: string) => new ApiError('UNPROCESSABLE_ENTITY', message, undefined, 422);

function appleModule(result: unknown | Error) {
  return {
    signInAsync: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('V9 U3 confirmWithApple', () => {
  it('a closed sheet is a cancel: nothing shown, nothing sent', async () => {
    const api = { post: vi.fn() };
    const cancel = Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' });
    await expect(confirmWithApple({ api, appleAuth: () => appleModule(cancel) as never })).resolves.toEqual({ ok: false, cancelled: true });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends the token and the authorization code, asking Apple for no name or e-mail', async () => {
    const api = { post: vi.fn(async () => ({ ok: true })) };
    const mod = appleModule({ identityToken: 'id.tok.en', authorizationCode: 'code-1' });
    await expect(confirmWithApple({ api, appleAuth: () => mod as never })).resolves.toEqual({ ok: true });
    expect(mod.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(api.post).toHaveBeenCalledWith('/security/step-up/apple', { identityToken: 'id.tok.en', authorizationCode: 'code-1' });
  });

  it('shows the server\'s sentence for another Apple account', async () => {
    const api = { post: vi.fn(async () => Promise.reject(unprocessable(STEP_UP_COPY.appleMismatch))) };
    const mod = appleModule({ identityToken: 'id.tok.en', authorizationCode: 'code-1' });
    await expect(confirmWithApple({ api, appleAuth: () => mod as never })).resolves.toEqual({
      ok: false,
      cancelled: false,
      messageFr: STEP_UP_COPY.appleMismatch,
    });
  });

  it('no Apple module or no token: a failure, never a call', async () => {
    const api = { post: vi.fn() };
    expect((await confirmWithApple({ api, appleAuth: () => null })).ok).toBe(false);
    expect((await confirmWithApple({ api, appleAuth: () => appleModule({ identityToken: null }) as never })).ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('V9 U3 confirmWithGoogle', () => {
  // Amended 2026-11-20 (V9 U3 final review, Important 1): the start returns this session's nonce and the
  // link carries it, so the server confirms only the session that started.
  it('start, linkSocial with this session\'s nonce, then confirm, in that order', async () => {
    const calls: string[] = [];
    const api = {
      post: vi.fn(async (path: string) => {
        calls.push(path);
        return path.endsWith('/start') ? { ok: true, nonce: 'n0nce_xxxxxxxxxxxxxxxxxxxxxxxxxx' } : { ok: true };
      }),
    };
    const authClient = {
      linkSocial: vi.fn(async (opts: unknown) => {
        calls.push('linkSocial');
        expect(opts).toEqual({
          provider: 'google',
          callbackURL: 'revime://',
          errorCallbackURL: 'revime://',
          additionalData: { stepUpNonce: 'n0nce_xxxxxxxxxxxxxxxxxxxxxxxxxx' },
        });
        return { data: { url: 'x', redirect: true }, error: null };
      }),
    };
    await expect(confirmWithGoogle({ api, authClient })).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['/security/step-up/google/start', 'linkSocial', '/security/step-up/google/confirm']);
  });

  it('a refused confirm (another account, or the page closed) shows the server\'s sentence', async () => {
    const api = {
      post: vi.fn(async (path: string) => {
        if (path.endsWith('/confirm')) throw unprocessable(STEP_UP_COPY.googleNotConfirmed);
        return { ok: true, nonce: 'n0nce_xxxxxxxxxxxxxxxxxxxxxxxxxx' };
      }),
    };
    const authClient = { linkSocial: vi.fn(async () => ({ data: {}, error: null })) };
    await expect(confirmWithGoogle({ api, authClient })).resolves.toEqual({
      ok: false,
      cancelled: false,
      messageFr: STEP_UP_COPY.googleNotConfirmed,
    });
  });

  it('a linkSocial error or throw is a failure and never reaches the confirm', async () => {
    for (const linkSocial of [
      vi.fn(async () => ({ data: null, error: { code: 'X', message: 'nope' } })),
      vi.fn(async () => Promise.reject(new Error('network'))),
    ]) {
      const api = { post: vi.fn(async () => ({ ok: true, nonce: 'n0nce_xxxxxxxxxxxxxxxxxxxxxxxxxx' })) };
      await expect(confirmWithGoogle({ api, authClient: { linkSocial } })).resolves.toEqual({
        ok: false,
        cancelled: false,
        messageFr: STEP_UP_COPY.googleNotConfirmed,
      });
      expect(api.post).toHaveBeenCalledTimes(1);
    }
  });
});

describe('V9 U3 an API without the nonce', () => {
  it('a start that returns no nonce never opens the browser', async () => {
    const api = { post: vi.fn(async () => ({ ok: true })) };
    const linkSocial = vi.fn();
    await expect(confirmWithGoogle({ api, authClient: { linkSocial } })).resolves.toEqual({
      ok: false,
      cancelled: false,
      messageFr: STEP_UP_COPY.googleNotConfirmed,
    });
    expect(linkSocial).not.toHaveBeenCalled();
  });
});

describe('V9 U3 the deletion screen asks with the DELETE purpose', () => {
  it('supprimer.tsx passes DELETE to withStepUp', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/parametres/supprimer.tsx', import.meta.url)), 'utf8');
    expect(src).toContain("withStepUp(() => api.del('/users/me'), 'DELETE')");
  });
});
