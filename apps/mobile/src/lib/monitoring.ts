import * as Sentry from '@sentry/react-native';
import type { ReactNativeOptions } from '@sentry/react-native';
import { scrubMonitoringEvent } from '@revime/shared';

/**
 * Crash and error reporting (REVIME_APP_PUBLICATION_PREPARATION.md PUB-31).
 *
 * 🛑 OFF unless the build carries `EXPO_PUBLIC_SENTRY_DSN`, the client's own Sentry project
 * (PUB-17), and always off in development. Expo inlines `EXPO_PUBLIC_*` at build time, so the DSN is
 * an `eas.json` env value of the launch build, read through its literal name below.
 *
 * Every event and breadcrumb goes through `scrubMonitoringEvent` (packages/shared): the App Privacy
 * and Data safety answers declare crash data only, never who it happened to.
 *
 * A native module (`@sentry/react-native`). No installed binary predates it that could load this JS:
 * there is no dev client and no `expo-updates` (`apps/mobile/AGENTS.md`, the `CF-44` argument), so it
 * carries no native probe. It reaches a phone only with the launch build (§6 LB-3).
 */
export function monitoringOptions(dsn: string | undefined, dev: boolean): ReactNativeOptions | null {
  const value = dsn?.trim();
  if (!value || dev) return null;
  return {
    dsn: value,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubMonitoringEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubMonitoringEvent(breadcrumb),
  };
}

export function initMonitoring(
  dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN,
  dev: boolean = __DEV__,
): boolean {
  const options = monitoringOptions(dsn, dev);
  if (!options) return false;
  Sentry.init(options);
  return true;
}
