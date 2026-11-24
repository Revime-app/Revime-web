/**
 * `@sentry/react-native` for Node tests (aliased in vitest.config.ts). The real package loads
 * React Native's native modules at import time. Calls are recorded so specs can read them.
 */
export const calls: { init: unknown[] } = { init: [] };

export function init(options: unknown): void {
  calls.init.push(options);
}
export function captureException(): void {}
export function wrap<T>(component: T): T {
  return component;
}
