import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureStorageBuckets, requiredBuckets } from '../src/storage/ensure-buckets.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('ensureStorageBuckets', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists the five private buckets', () => {
    expect(requiredBuckets()).toEqual(['demande-photos', 'attachments', 'business-documents', 'legal-documents', 'shipping-labels']);
  });

  it('does nothing without Supabase storage', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'local');
    const f = vi.fn();
    expect(await ensureStorageBuckets(f as unknown as typeof fetch)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('creates only the missing ones, private', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'supabase');
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_k');
    const f = vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ name: 'ok' }) : json([{ id: 'demande-photos' }, { id: 'attachments' }]),
    );
    expect(await ensureStorageBuckets(f as unknown as typeof fetch)).toEqual(['business-documents', 'legal-documents', 'shipping-labels']);
    const body = JSON.parse(String(f.mock.calls.find(([, i]) => i?.method === 'POST')![1]!.body));
    expect(body).toEqual({ id: 'business-documents', name: 'business-documents', public: false });
  });
});
