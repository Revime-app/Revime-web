import * as Sentry from '@sentry/node';
import { scrubMonitoringEvent } from '@revime/shared';

/**
 * Error reporting to Sentry (REVIME_APP_PUBLICATION_PREPARATION.md PUB-31).
 *
 * 🛑 OFF unless `SENTRY_DSN` is set on Render. The DSN comes from the client's own Sentry account
 * (PUB-17), so this code can ship before that account exists and does nothing until then.
 *
 * Every event and breadcrumb is scrubbed of personal data by `scrubMonitoringEvent` before it leaves
 * (the stores were told crash data only). No tracing: errors are the point, and spans would carry
 * URLs and timings nobody has asked for.
 */
type Env = Record<string, string | undefined>;

export function initMonitoring(env: Env = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || 'production',
    // Render sets this to the deployed commit, so an event names the code that raised it.
    release: env.RENDER_GIT_COMMIT,
    // Sentry 11's replacement for `sendDefaultPii: false`: collect no user, cookie, header, body
    // or query data on its own. The scrubber below is the second line, for what errors carry.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubMonitoringEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubMonitoringEvent(breadcrumb),
  });
  return true;
}

/**
 * Called by `AllExceptionsFilter` for the errors it answers with `INTERNAL`, i.e. real faults. An
 * expected HTTP answer (404, 403, 429…) is the API working and is never reported.
 */
export function reportServerError(exception: unknown): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(exception);
}
