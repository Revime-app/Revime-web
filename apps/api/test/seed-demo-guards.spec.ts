// apps/api/test/seed-demo-guards.spec.ts
import { describe, expect, it } from 'vitest';
import { assertProjectRef, parseMode, assertApiFresh } from '../scripts/seed-demo/guards.mjs';

const REAL = 'postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?ref=sixgwfsermdfppmzyuzk';

describe('assertProjectRef', () => {
  it('accepts the expected project', () => {
    expect(() => assertProjectRef(REAL)).not.toThrow();
  });

  it('refuses a different project, because a stale shell is the realistic failure', () => {
    expect(() => assertProjectRef('postgresql://u:p@host:5432/postgres?ref=someotherproject')).toThrow(
      /sixgwfsermdfppmzyuzk/,
    );
  });

  it('refuses an absent URL rather than treating it as a pass', () => {
    expect(() => assertProjectRef(undefined)).toThrow(/DATABASE_URL/);
  });
});

describe('parseMode', () => {
  it('reads each mode', () => {
    expect(parseMode(['--seed'])).toEqual({ mode: 'seed', dryRun: false });
    expect(parseMode(['--cleanup'])).toEqual({ mode: 'cleanup', dryRun: false });
    expect(parseMode(['--reset', '--dry-run'])).toEqual({ mode: 'reset', dryRun: true });
  });

  it('refuses no mode, so a bare invocation cannot write anything', () => {
    expect(() => parseMode([])).toThrow(/--seed|--cleanup|--reset/);
  });
});

/**
 * `assertApiFresh`'s second parameter defaults to `fetch`, so its type IS `typeof fetch`:
 * it takes `string | URL | Request` and answers a real `Response`. A mock narrowed to
 * `(url: string) => { status }` is not assignable to that, so the mock returns genuine
 * `Response` objects instead of a status-shaped stand-in. That also makes the mock a
 * closer model of the thing being replaced.
 */
const statusOnly = (probe: (url: string) => number) => async (input: string | URL | Request) =>
  new Response(null, { status: probe(String(input)) });

describe('assertApiFresh', () => {
  it('refuses a 404 on a route current code defines, which is the stale-orphan signature', async () => {
    const fake = statusOnly((url) => (url.endsWith('/health') ? 200 : 404));
    await expect(assertApiFresh('http://localhost:3002', fake)).rejects.toThrow(/stale/i);
  });

  it('accepts 200 on health plus 401 on the guarded route', async () => {
    const fake = statusOnly((url) => (url.endsWith('/health') ? 200 : 401));
    await expect(assertApiFresh('http://localhost:3002', fake)).resolves.toBeUndefined();
  });
});
