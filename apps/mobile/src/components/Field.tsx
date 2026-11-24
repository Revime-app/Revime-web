import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { useState } from 'react';
import { useTheme } from '../theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  helperText?: string;
  counter?: { current: number; min?: number; max?: number } | string;
  /** Multiline fields need real height; `style` alone cannot do it because
   *  `...input` is spread before `style` is set below. */
  minHeight?: number;
};

export function Field({ label, error, helperText, counter, minHeight, ...input }: Props) {
  const { palette, radii, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? palette.red : focused ? palette.ink : palette.line;
  const backgroundColor = focused ? palette.paper : palette.mist;
  const hasSubRow = error || helperText || counter !== undefined;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5, color: palette.ink2, marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        placeholderTextColor={palette.faint}
        style={{
          paddingVertical: 15, paddingHorizontal: 14, borderWidth: 1.5, borderColor,
          borderRadius: radii.field, backgroundColor,
          fontFamily: 'GoogleSansFlex_500Medium', fontSize: type.body.size, color: palette.ink,
          ...(minHeight ? { minHeight, textAlignVertical: 'top' as const } : {}),
        }}
      />
      {hasSubRow && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
          {error ? (
            <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: type.caption.size, color: palette.red, flex: 1 }}>
              {error}
            </Text>
          ) : helperText ? (
            <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: type.caption.size, color: palette.muted, flex: 1 }}>
              {helperText}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {counter !== undefined && (
            <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: type.caption.size, color: palette.muted, marginLeft: spacing.sm }}>
              {typeof counter === 'string'
                ? counter
                : counter.max
                  ? `${counter.current} / ${counter.max}`
                  : `${counter.current}`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
