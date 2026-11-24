import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconTick } from '../icons';

type CheckboxProps = {
  checked: boolean;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  error?: boolean;
};

/**
 * Clean, accessible Checkbox conforming to the Revime design system.
 * Uses `IconTick` from `@hugeicons` in an accent disc when checked.
 */
export function Checkbox({ checked, onPress, children, disabled = false, error = false }: CheckboxProps) {
  const { palette, accent, radii } = useTheme();

  const borderColor = error
    ? palette.red
    : checked
      ? accent.accent
      : palette.line;

  const backgroundColor = checked ? accent.accent : palette.paper;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor,
            backgroundColor,
            borderRadius: radii.field ? Math.min(radii.field, 6) : 6,
          },
        ]}
      >
        {checked && <IconTick size={14} color={palette.paper} strokeWidth={2.5} />}
      </View>
      <View style={styles.labelContainer}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 6,
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 10,
  },
  labelContainer: {
    flex: 1,
  },
});
