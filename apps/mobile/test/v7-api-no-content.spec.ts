import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/auth-client', () => ({ authClient: { getCookie: () => '' } }));
vi.mock('../src/lib/maintenance-signal', () => ({ signalMaintenanceAnswer: () => {} }));

import { api, ApiError } from '../src/lib/api';

/**
 * V7 `FND7-077`. Six app calls reach a route that answers `204 No Content` through `call()`
 * (`post`, `patch`, `putJson`): push register and unregister, and the four « mark as read »
 * mutations. `call()` ended in `res.json()`, which throws on an empty body, so each one REJECTED
 * after the server had done the work. Seen on the emulator with APK `0d99ec8e`:
 * `[push] registration skipped: SyntaxError: JSON Parse error: Unexpected end of input`, with the
 * token already stored, so Paramètres read « Non disponibles », sign-out never unregistered the
 * phone, and the mark-read `onSuccess` refreshes never ran. `push.ts` said `call` swallowed the
 * 204 with `res.json().catch(() => null)`; `d6bed4b8` (CF5-02) had removed that catch.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a 204 reply through call() (FND7-077)', () => {
  it('resolves putJson to null, as the push-token registration expects', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.putJson<null>('/notifications/push-token', { token: 't' })).resolves.toBeNull();
  });

  it('resolves post and patch too (unregister, the mark-read mutations)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post<void>('/notifications/push-token/unregister', { token: 't' })).resolves.toBeNull();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.patch<void>('/conversations/c1/read', {})).resolves.toBeNull();
  });

  it('still parses a JSON body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ count: 3 }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(api.get<{ count: number }>('/me/badge')).resolves.toEqual({ count: 3 });
  });

  it('still throws an ApiError on a refusal', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Introuvable.' } }), { status: 404 }),
    );
    await expect(api.post('/notifications/x/read', {})).rejects.toBeInstanceOf(ApiError);
  });
});
