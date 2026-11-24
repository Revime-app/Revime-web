import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@revime/tokens';

/**
 * Bottom padding that a scrollable screen inside `(tabs)` must reserve.
 *
 * The tab bar is `position: 'absolute'` at `bottom: 0` with a height of
 * `layout.navHeight + insets.bottom` (`app/(tabs)/_layout.tsx`), so it floats
 * over the scroll view instead of shrinking it. A ScrollView cannot scroll past
 * the end of its content, so whatever falls inside that band is **unreachable
 * rather than merely hidden**.
 *
 * That is not theoretical. Every tab screen reserved `spacing.xxl`, 32, against
 * a bar of roughly 112 on a device with a home indicator, leaving an 80 point
 * dead zone. The client hit it on 2026-08-16: opening a category's children made
 * the publish wizard scroll, and its « Continuer » button - 52 points tall and
 * the last element in the ScrollView - ended up entirely inside the dead zone,
 * along with the required « Titre de la demande » field above it.
 *
 * `spacing.lg` is added so the last element clears the bar with breathing room
 * rather than sitting flush against it.
 *
 * **Screens outside `(tabs)` must not use this.** Pushed routes such as
 * `app/demande/[id]/*` have no tab bar and would gain a dead gap at the bottom.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return layout.navHeight + insets.bottom + spacing.lg;
}
