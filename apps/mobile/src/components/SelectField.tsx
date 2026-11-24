import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { IconChevronRight } from '../icons';

type Props = {
  label: string;
  value?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function SelectField({
  label,
  value,
  placeholder = 'Sélectionner...',
  error,
  helperText,
  disabled = false,
  onPress,
}: Props) {
  const { palette, radii, spacing, type } = useTheme();
  const borderColor = error ? palette.red : palette.line;
  const backgroundColor = disabled ? palette.page : palette.mist;
  const hasSubRow = error || helperText;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_600SemiBold',
          fontSize: 12.5,
          color: palette.ink2,
          marginBottom: spacing.xs,
        }}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          paddingVertical: 15,
          paddingHorizontal: 14,
          borderWidth: 1.5,
          borderColor,
          borderRadius: radii.field,
          backgroundColor: pressed ? palette.paper : backgroundColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: type.body.size,
            color: value ? palette.ink : palette.faint,
            flex: 1,
            marginRight: spacing.xs,
          }}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <IconChevronRight size={18} color={palette.muted} strokeWidth={2} />
      </Pressable>
      {hasSubRow && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: spacing.xs,
          }}
        >
          {error ? (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: type.caption.size,
                color: palette.red,
                flex: 1,
              }}
            >
              {error}
            </Text>
          ) : helperText ? (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.caption.size,
                color: palette.muted,
                flex: 1,
              }}
            >
              {helperText}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
