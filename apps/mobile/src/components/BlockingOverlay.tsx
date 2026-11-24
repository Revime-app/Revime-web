import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { RevimeLoader } from './lottie/RevimeLoader';

/**
 * A full-screen scrim with a spinner, for a wait the user must not be able to interrupt.
 *
 * Built for the Profil mode switch, where two sequential round trips to Paris left the screen
 * looking frozen: `switching` disabled the two segments and nothing else, so taps stopped
 * working and nothing moved.
 *
 * 🛑 **A SCRIM, NOT A BLUR, AND THAT IS NOT A STYLE PREFERENCE.** A real blur needs `expo-blur`,
 * which is a NATIVE module and is not installed. Adding one after the installed dev build is
 * **fatal at import** - `requireNativeModule` throws during module evaluation, the global handler
 * in `app/_layout.tsx` catches it and React unwinds the whole tree. That is the
 * `expo-image-picker` incident recorded in `AGENTS.md`, and it would cost a build to recover
 * from. Paper at 92% reads the same way: content visibly inert, something in progress. The
 * prototype makes this trade twice already - see `DemandeCard` and `ProfileStats`, both of which
 * note there is no `backdrop-filter` here without a blur dependency.
 *
 * 🛑 **A `Modal` rather than an absolutely-positioned `View`**, because a view inside a tab screen
 * cannot cover the **tab bar** - that lives in `app/(tabs)/_layout.tsx`, outside this tree - and a
 * switch that leaves the tab bar tappable invites a second navigation mid-flight. `Modal` is
 * already used in `app/conversation/[id].tsx`; its warning there is about NESTING modals, which
 * this does not do.
 *
 * **Not dismissible.** `onRequestClose` is deliberately a no-op: Android's back gesture must not
 * take the scrim away while the request is still running, because the thing it is covering is
 * mid-change. The caller's `finally` is what takes it down, on success and on failure alike.
 */
type Props = {
  visible: boolean;
  /** What is happening, in the interface's voice. « Changement de mode… ». */
  label: string;
  /** Optional second line naming the destination, so the wait says which direction it is going. */
  detail?: string;
};

export function BlockingOverlay({ visible, label, detail }: Props) {
  const { palette, radii } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      // `fade`, not `slide`: this is a state the screen enters, not a surface arriving from
      // somewhere. Slide would read as a sheet the user could push back.
      animationType="fade"
      onRequestClose={() => {}}
      // Announced as an alert so a screen reader says what is happening instead of reading the
      // scrim as an empty container.
      accessibilityViewIsModal
    >
      <View style={[styles.scrim, { backgroundColor: `${palette.paper}EB` }]}>
        <View
          style={[
            styles.panel,
            { backgroundColor: palette.paper, borderColor: palette.line, borderRadius: radii.card },
          ]}
        >
          <RevimeLoader variant="fill" size={80} centered={false} />
          <Text
            style={[styles.label, { color: palette.ink }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {label}
          </Text>
          {detail !== undefined && (
            <Text style={[styles.detail, { color: palette.muted }]}>{detail}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  /**
   * A small card under the spinner rather than a bare spinner on the scrim. At 92% the scrim is
   * still slightly transparent, so text sitting directly on it would compete with whatever shows
   * through; an opaque panel keeps the label legible over any screen.
   */
  panel: {
    minWidth: 200,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderCurve: 'continuous',
    alignItems: 'center',
    gap: 14,
  },
  label: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, textAlign: 'center' },
  detail: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, textAlign: 'center' },
});
