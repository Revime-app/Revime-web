// `expo-modules-core` is already evaluated in every running build, so importing it
// directly adds no new module evaluation and cannot cause the failure below.
import { requireOptionalNativeModule } from 'expo-modules-core';
// TYPE-ONLY: erased at compile time, so full typing with NO runtime require.
// Making this a value import skips the native-presence check below.
import type * as AppleAuthenticationModule from 'expo-apple-authentication';

/** From expo-apple-authentication's own requireOptionalNativeModule line -- measured, not guessed. */
const NATIVE_MODULE_NAME = 'ExpoAppleAuthentication';

/**
 * Loads `expo-apple-authentication` only when its native half is in this binary.
 *
 * 🛑 WHY. This module degrades rather than crashes. Its JS entry (expo-apple-
 * authentication/src/ExpoAppleAuthentication.ts:6) calls requireOptionalNativeModule
 * at module scope, which when the native half is missing returns a safe stub:
 *
 *   { isAvailableAsync: () => Promise.resolve(false), addListener() {}, ... }
 *
 * The stub has NO `signInAsync`, and its `isAvailableAsync()` resolves false. So a
 * static import would succeed module-graph evaluation but produce a button that cannot
 * work -- and guideline 4.8 requires a WORKING privacy-preserving option, not a
 * visible one. This probe gates what we RENDER, not just what we call.
 *
 * 🛑 CONTEXT: THE THROWING VARIANT. Some native modules DO crash the app when their
 * native half is missing. `expo-image-picker` (image-picker.ts:16) calls the throwing
 * `requireNativeModule('ExponentImagePicker')` at module scope, and on 2026-08-20 that
 * unwound the entire tab tree on device when its native half was absent from the dev
 * build. The owner's installed dev client predates BOTH dependencies, so the general
 * rule "probe any native module added after the build" applies here too -- it just
 * defends against degradation rather than a crash.
 *
 * 🛑 AND WHY IT PROBES RATHER THAN CATCHING. A try/catch around `require` is DEAD
 * CODE in React Native. Metro's loader wraps every factory (metro-runtime/src/
 * polyfills/require.js:178, guardedLoadModule) and on a throw calls global.ErrorUtils.
 * reportFatalError(e) and RETURNS `undefined` instead of rethrowing. The catch never
 * fires, the red box appears anyway, and `require` hands back `undefined`.
 *
 * Mirrors src/lib/image-picker.ts in structure. The two files face DIFFERENT failure
 * modes (degradation vs crash) but the same solution: probe the native registry before
 * loading the module. Change both together.
 */
let probed = false;
// null, never undefined: a failed Metro require RETURNS undefined, so undefined
// must never also mean « not yet probed ». That exact collision made the first
// version of image-picker.ts re-probe every call AND report the module present.
let cached: typeof AppleAuthenticationModule | null = null;

/** The module, or null when its native half is missing. Never throws, never logs. */
export function appleAuth(): typeof AppleAuthenticationModule | null {
  if (probed) return cached;
  probed = true;

  if (requireOptionalNativeModule(NATIVE_MODULE_NAME) === null) return cached;

  // A CAPABILITY check, not a presence check: `require` can return `undefined`
  // or a partial module without throwing. Assert the symbols we actually use:
  // the auth functions AND the button component that later tasks will render.
  const mod = require('expo-apple-authentication') as
    | typeof AppleAuthenticationModule
    | undefined;
  cached =
    typeof mod?.signInAsync === 'function' &&
    typeof mod?.isAvailableAsync === 'function' &&
    mod?.AppleAuthenticationButton !== undefined
      ? mod
      : null;
  return cached;
}

/**
 * True when Apple sign-in can actually run. Callers use this to decide what to
 * RENDER: a button that silently does nothing reads as a broken app, and
 * guideline 4.8 is about a real equivalent option, not a visible one.
 *
 * NOTE this is the SYNCHRONOUS half. The module also exposes an async
 * `isAvailableAsync()`, which reports whether the OS supports Apple auth at all
 * (false on Android, and on iOS below 13). Task 5 awaits that too -- both gates
 * are needed, and neither implies the other.
 */
export function isAppleAuthAvailable(): boolean {
  return appleAuth() !== null;
}
