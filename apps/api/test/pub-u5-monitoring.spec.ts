import type { ArgumentsHost } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-31: the API's error reporting.
 *
 * - Off unless SENTRY_DSN is set, so the code ships before the client's Sentry account exists.
 * - Every event is scrubbed of personal data first (`scrubMonitoringEvent`, packages/shared).
 * - Only real server faults are reported: a 404 or a 403 is the API working, not failing.
 */
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  isInitialized: vi.fn(() => true),
}));
vi.mock('@sentry/node', () => sentry);

import { initMonitoring, reportServerError } from '../src/monitoring.js';
import { AllExceptionsFilter } from '../src/common/http-exception.filter.js';

function runFilter(exception: unknown): void {
  const res = { status: () => res, json: () => res };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
}

beforeEach(() => {
  sentry.init.mockClear();
  sentry.captureException.mockClear();
  sentry.isInitialized.mockReturnValue(true);
});

describe('initMonitoring', () => {
  it('does nothing without a DSN', () => {
    expect(initMonitoring({})).toBe(false);
    expect(initMonitoring({ SENTRY_DSN: '   ' })).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry with no default personal data and the scrubber on every event', () => {
    expect(
      initMonitoring({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', RENDER_GIT_COMMIT: 'abc123' }),
    ).toBe(true);
    const options = sentry.init.mock.calls[0]![0];
    expect(options.dsn).toBe('https://k@o1.ingest.sentry.io/1');
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
    expect(options.environment).toBe('production');
    expect(options.release).toBe('abc123');
    const event = options.beforeSend({ message: 'failed for a@b.fr', user: { id: 'u', email: 'a@b.fr' } });
    expect(event.message).toBe('failed for [email]');
    expect(event.user).toEqual({ id: 'u' });
    const crumb = options.beforeBreadcrumb({ message: 'GET ?email=a@b.fr' });
    expect(crumb.message).not.toContain('a@b.fr');
  });
});

describe('reportServerError through the exception filter', () => {
  it('reports an unexpected error', () => {
    const err = new Error('database exploded');
    runFilter(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('does not report an expected HTTP answer', () => {
    runFilter(new NotFoundException());
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('does nothing when Sentry was never started', () => {
    sentry.isInitialized.mockReturnValue(false);
    reportServerError(new Error('x'));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
