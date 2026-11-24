import { describe, expect, it } from 'vitest';
import { getIp } from 'better-auth/api';
import { AUTH_IP_ADDRESS_OPTIONS } from '../src/auth/client-ip.js';

// CF4-02. Runs Better Auth's OWN resolver against our config, so an upgrade that changes
// how headers are read fails here rather than silently re-merging every user into one
// rate-limit bucket on Render.
const options = { advanced: { ipAddress: AUTH_IP_ADDRESS_OPTIONS } };
const resolve = (headers: Record<string, string>) =>
  getIp(new Request('https://api.example.test/api/auth/get-session', { headers }), options);

describe('AUTH_IP_ADDRESS_OPTIONS (client IP behind Render/Cloudflare)', () => {
  it('resolves the Cloudflare-set client IP even when X-Forwarded-For is a multi-hop chain', () => {
    // The Render shape that made the default resolve to null: several XFF entries.
    expect(
      resolve({
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '203.0.113.7, 172.71.0.10, 10.200.0.3',
      }),
    ).toBe('203.0.113.7');
  });

  it('ignores a client-forged X-Forwarded-For, so the limiter cannot be dodged by rotating it', () => {
    expect(
      resolve({
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.200.0.3',
      }),
    ).toBe('203.0.113.7');
  });

  it('keeps the default single-value X-Forwarded-For fallback when CF-Connecting-IP is absent', () => {
    expect(resolve({ 'x-forwarded-for': '198.51.100.20' })).toBe('198.51.100.20');
  });

  it('without CF-Connecting-IP, skips our private hops and lands on the Cloudflare edge (S1)', () => {
    // The Render shape from the first test, minus the header. Coarse by design: Render appends the
    // edge address, which is public, so the bucket is the edge's. Before S1 this resolved to null
    // and the whole user base shared one bucket.
    expect(resolve({ 'x-forwarded-for': '203.0.113.7, 172.71.0.10, 10.200.0.3' })).toBe('172.71.0.10');
  });

  it('is not fooled by private addresses a client types into X-Forwarded-For (S1)', () => {
    // Everything the client sends sits LEFT of what Render appends, and the walk starts on the right.
    expect(
      resolve({ 'x-forwarded-for': '10.0.0.1, 192.168.1.5, 1.2.3.4, 172.71.0.10, 10.200.0.3' }),
    ).toBe('172.71.0.10');
  });

  it('does not throw with no proxy header at all (local dev): falls back to localhost', () => {
    // vitest runs with NODE_ENV=test, which is the same fallback branch as development.
    expect(resolve({})).toBe('127.0.0.1');
  });
});
