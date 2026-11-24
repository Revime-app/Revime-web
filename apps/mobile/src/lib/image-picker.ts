// `expo-modules-core` is already evaluated in every running build -- expo-router,
// expo-secure-store, expo-web-browser and expo-font all depend on it -- so importing it directly
// adds no new module evaluation and cannot introduce the failure described below.
import { requireOptionalNativeModule } from 'expo-modules-core';
// A TYPE-ONLY import: erased at compile time, so it gives full typing and causes NO runtime
// require. Making this a value import re-introduces the crash described below.
import type * as ImagePickerModule from 'expo-image-picker';

/** The name the native side registers, from expo-image-picker/src/ExponentImagePicker.ts:2. */
const NATIVE_MODULE_NAME = 'ExponentImagePicker';

/**
 * Loads `expo-image-picker` only when its native half is actually in this binary.
 *
 * 🛑 WHY THIS EXISTS. `expo-image-picker` is a NATIVE module whose JS entry runs
 * `requireNativeModule('ExponentImagePicker')` at **module scope**, and that throws when the
 * native half is missing. The throw lands while the module GRAPH is being evaluated, before any
 * component renders, so a plain static import unwound the ENTIRE tab tree -- not just Publier.
 * Measured on device 2026-08-20 against the installed dev client, which predates this dependency.
 *
 * 🛑 AND WHY IT PROBES THE NATIVE REGISTRY RATHER THAN CATCHING. This was got wrong once, so the
 * reason is worth stating exactly: **a try/catch around `require` is DEAD CODE in React Native.**
 * Metro's loader wraps every module factory (`metro-runtime/src/polyfills/require.js:178`,
 * `guardedLoadModule`) and on a throw it calls `global.ErrorUtils.reportFatalError(e)` and
 * **returns `undefined` instead of rethrowing**. So the catch never fires, the app's global handler
 * logs the error anyway, and `require` hands back `undefined`. Worse, the failed module keeps
 * `hasError: true` with `isInitialized: false` (`:311-313`), so line 252 rethrows on EVERY later
 * require -- meaning each probe produces a fresh console error.
 *
 * `requireOptionalNativeModule` avoids all of it: it reads the native registry directly, returns
 * `null` when the name is absent, and never loads expo-image-picker's JS entry, so Metro's loader
 * is never involved and nothing is reported.
 */
let probed = false;
// Initialised to null, not undefined: "unavailable" is the fail-safe default, and undefined is
// exactly what a failed Metro require returns, so it must never double as "not yet probed".
let cached: typeof ImagePickerModule | null = null;

/** The module, or null when its native half is missing. Never throws, never logs. */
export function imagePicker(): typeof ImagePickerModule | null {
  if (probed) return cached;
  probed = true;

  if (requireOptionalNativeModule(NATIVE_MODULE_NAME) === null) return cached;

  // A CAPABILITY check, not a presence check. `require` can hand back `undefined` or a partial
  // module without throwing (see above), and both are truthy-or-null traps: the previous version
  // of this file treated `undefined` as available, rendered the button, and died on tap. Asserting
  // the one function this app calls is what makes "available" mean "usable".
  const mod = require('expo-image-picker') as typeof ImagePickerModule | undefined;
  cached = typeof mod?.launchImageLibraryAsync === 'function' ? mod : null;
  return cached;
}

/**
 * True when the picker can actually open. Callers use this to decide what to RENDER, so the user
 * is told photos are unavailable instead of tapping a button that cannot work.
 */
export function isImagePickerAvailable(): boolean {
  return imagePicker() !== null;
}
