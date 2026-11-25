import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureBoxtalSubscriptions } from '../src/shipping/boxtal-subscriptions.js';

const ENV = {
  SHIPPING_DRIVER: 'boxtal',
  BOXTAL_V3_ACCESS_KEY: 'k',
  BOXTAL_V3_SECRET_KEY: 's',
  BOXTAL_WEBHOOK_SECRET: 'w',
  PUBLIC_API_URL: 'https://api.revime.fr/',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('ensureBoxtalSubscriptions', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing unless Boxtal is fully configured', async () => {
    vi.stubEnv('SHIPPING_DRIVER', 'manual');
    const f = vi.fn();
    expect(await ensureBoxtalSubscriptions(f as unknown as typeof fetch)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('creates only the missing subscription, with our callback and secret', async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const cb = 'https://api.revime.fr/api/v1/shipping/webhook';
    const f = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ id: '1' }, 201) : json([{ eventType: 'DOCUMENT_CREATED', callbackUrl: cb }]),
    );
    expect(await ensureBoxtalSubscriptions(f as unknown as typeof fetch)).toEqual(['TRACKING_CHANGED']);
    const post = f.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(post[0]).toBe('https://api.boxtal.com/shipping/v3.1/subscription');
    expect(JSON.parse(String(post[1]!.body))).toEqual({ eventType: 'TRACKING_CHANGED', callbackUrl: cb, webhookSecret: 'w' });
  });

  it('never throws when Boxtal is down', async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const f = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await ensureBoxtalSubscriptions(f as unknown as typeof fetch)).toEqual([]);
  });
});
