import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  /**
   * 🛑 `'locked'` is DIMMED BUT STILL PRESSABLE, and that is the whole reason it exists rather
   * than reusing `disabled`. `disabled` sets `disabled` on the Pressable, so `onPress` never
   * fires - and `CF-10`'s locked « Faire une offre » must open the gate sheet when tapped. A
   * dimmed control that does nothing reads as a broken app.
   */
  variant?: 'primary' | 'secondary' | 'text' | 'locked';
  disabled?: boolean;
  loading?: boolean;
  /**
   * An optional glyph before the label, as the prototype's `.btn` rows carry one
   * (« Voir les demandes » on AccueilPro). Additive and off by default, so every existing
   * caller is unaffected.
   *
   * Passed as a node rather than an icon NAME on purpose: the caller already knows the
   * colour it needs against its own variant, and a name would make this component own a
   * mapping from every icon in the app.
   */
  icon?: ReactNode;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon }: Props) {
  const { accent, palette, radii, type } = useTheme();
  const inert = Boolean(disabled || loading);

  return (
    <Pressable
      /*
       * 🛑 V7 `FND7-075`. KEYED ON `inert`, so a change mounts a fresh native view. On Android a
       * Pressable that had been disabled kept its native view `enabled="false"` after `disabled`
       * went back to false (seen with uiautomator on APK `965635d2`). `disabled` reaches Android as
       * `accessibilityState.disabled` → `View.setEnabled(false)`, and React Native's
       * `TouchTargetHelper` treats a disabled view as `BOX_NONE`: the button itself can no longer
       * be hit, only its label. So the publish wizard's « Continuer », which mounts disabled on an
       * empty form, answered taps on the word « Continuer » alone. A fresh view is built in the
       * right state from the start, whatever React Native does with the flip. The key only changes
       * when `inert` does, so a press in progress is never lost to a remount.
       */
      key={inert ? 'inert' : 'live'}
      accessibilityRole="button"
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: radii.field },
        variant === 'primary' && { backgroundColor: pressed ? accent.accentDeep : accent.accent },
        variant === 'secondary' && {
          backgroundColor: pressed ? palette.mist : palette.paper,
          borderWidth: 1,
          borderColor: palette.line,
        },
        variant === 'text' && { backgroundColor: 'transparent', height: 'auto', paddingVertical: 8 },
        variant === 'locked' && { backgroundColor: accent.accentDeep, opacity: 0.72 },
        inert && { opacity: 0.45 },
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'locked' ? palette.paper : accent.accent} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_600SemiBold',
              fontSize: type.body.size,
              color:
                variant === 'primary' || variant === 'locked'
                  ? palette.paper
                  : variant === 'text'
                    ? accent.accent
                    : palette.ink,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * `flexDirection: 'row'` and a gap are here rather than only on the icon path, because a
   * single-child row lays out identically to the column this used to be - so no existing
   * caller shifts by a pixel - while an icon gets its spacing for free.
   */
  base: {
    height: 52,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
