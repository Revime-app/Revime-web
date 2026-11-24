import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * V8 E1, mockups 1 and 2: the setup progress bar, `completed/total` filled in the mode's accent (navy in repairer
 * mode) on a Platinum track (`palette.line`, one value with `platinum`). The bar only: each parent renders its own
 * « ≈ X min » beside it, so the texts stay in the parent's tree.
 */
export function JourneyProgressBar({ completed, total }: { completed: number; total: number }) {
  const { palette, accent } = useTheme();
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  return (
    <View
      style={[styles.track, { backgroundColor: palette.line }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: completed }}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: accent.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
