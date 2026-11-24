/**
 * V8 B1 (FND8-013). The Android status bar's icon colour.
 *
 * `app.json`'s `userInterfaceStyle: "light"` never reaches Android: Expo applies it there only
 * through `expo-system-ui`, which this app does not install (FND8-011). So without an explicit
 * `<StatusBar>`, Android draws the clock and icons for the PHONE's theme, and in dark mode that is
 * white icons on the app's white headers, i.e. an invisible status bar on every screen.
 *
 * Every app screen paints its own light background, so the icons are always dark. The one surface
 * that follows the phone's theme on purpose is the startup splash (navy `#010524` in dark mode,
 * `RevimeStartupSplash.tsx`); it renders its own `<StatusBar>` while it is on screen, and
 * `expo-status-bar` lets the most recently mounted one win, so the app's comes back when it unmounts.
 *
 * Pinning Android light with `expo-system-ui` was considered and not chosen (V8 `DEC8-03`): it is a
 * new native module at the end of the project, and whether it reaches third-party activities such as
 * Stripe's PaymentSheet was not verified. Explicit colours work whatever the phone's theme is.
 */
export type StatusBarIconStyle = 'light' | 'dark';

export const APP_STATUS_BAR_STYLE: StatusBarIconStyle = 'dark';

export function splashStatusBarStyle(scheme: string | null | undefined): StatusBarIconStyle {
  return scheme === 'dark' ? 'light' : 'dark';
}
