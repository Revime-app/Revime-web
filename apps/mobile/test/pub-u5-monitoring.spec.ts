import { readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { calls } from './sentry-mock';
import { initMonitoring, monitoringOptions } from '../src/lib/monitoring';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-31: crash reporting in the app.
 *
 * Off unless the build carries EXPO_PUBLIC_SENTRY_DSN (the client's Sentry project, PUB-17), off in
 * development, and every event goes through the shared scrubber so no personal data leaves.
 */
const mobile = path.resolve(__dirname, '..');

beforeEach(() => {
  calls.init.length = 0;
});

describe('monitoringOptions', () => {
  it('is null without a DSN, and in development', () => {
    expect(monitoringOptions(undefined, false)).toBeNull();
    expect(monitoringOptions('  ', false)).toBeNull();
    expect(monitoringOptions('https://k@o1.ingest.sentry.io/1', true)).toBeNull();
  });

  it('sends no default personal data and scrubs every event and breadcrumb', () => {
    const o = monitoringOptions('https://k@o1.ingest.sentry.io/1', false)!;
    expect(o.dsn).toBe('https://k@o1.ingest.sentry.io/1');
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
    const e = o.beforeSend!({ message: 'x a@b.fr', user: { id: 'u', email: 'a@b.fr' } } as never, {} as never) as {
      message: string;
      user: unknown;
    };
    expect(e.message).toBe('x [email]');
    expect(e.user).toEqual({ id: 'u' });
    const b = o.beforeBreadcrumb!({ message: 'tel 06 12 34 56 78' } as never, {} as never) as { message: string };
    expect(b.message).toBe('tel [phone]');
  });
});

describe('initMonitoring', () => {
  it('starts Sentry only when options exist', () => {
    expect(initMonitoring(undefined, false)).toBe(false);
    expect(calls.init).toHaveLength(0);
    expect(initMonitoring('https://k@o1.ingest.sentry.io/1', false)).toBe(true);
    expect(calls.init).toHaveLength(1);
  });
});

describe('wiring', () => {
  it('the root layout starts monitoring before it installs its own global error handler', () => {
    const src = readFileSync(path.join(mobile, 'app/_layout.tsx'), 'utf8');
    const init = src.indexOf('initMonitoring(');
    const handler = src.indexOf('setGlobalHandler');
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(handler);
  });

  it('reads the DSN through the literal EXPO_PUBLIC_ name Expo inlines at build time', () => {
    const src = readFileSync(path.join(mobile, 'src/lib/monitoring.ts'), 'utf8');
    expect(src).toContain('process.env.EXPO_PUBLIC_SENTRY_DSN');
  });

  it('has the Sentry config plugin and the Sentry Metro serializer (debug ids for source maps)', () => {
    const app = JSON.parse(readFileSync(path.join(mobile, 'app.json'), 'utf8')).expo;
    const names = (app.plugins as unknown[]).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain('@sentry/react-native');
    const metro = readFileSync(path.join(mobile, 'metro.config.js'), 'utf8');
    expect(metro).toContain('getSentryExpoConfig');
  });

  it('a store build without a Sentry DSN also skips the source-map upload, so it cannot fail on a missing token', () => {
    const eas = JSON.parse(readFileSync(path.join(mobile, 'eas.json'), 'utf8'));
    for (const profile of ['production', 'preview']) {
      const env = eas.build[profile]?.env ?? {};
      if (!env.EXPO_PUBLIC_SENTRY_DSN) {
        expect(env.SENTRY_DISABLE_AUTO_UPLOAD, profile).toBe('true');
      }
    }
  });
});
