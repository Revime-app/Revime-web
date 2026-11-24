import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { RevimeLottie } from './RevimeLottie';
import { useLottieLoaderState } from '../../lib/use-lottie-loader-state';
import { useTheme } from '../../theme';

export interface RevimeLoaderProps {
  /**
   * REQUIRED (CF6-08 review). Every call site names it, and a default of `fill` was wrong as a
   * default: `REVIME_LOTTIE_ANIMATIONS.md` §6.1 assigns the two variants to different waits. The
   * client asked for the continuous `fill` animation everywhere (CF6-08), so today every caller
   * passes `fill`; `wire` is kept as an asset, not as a live loader.
   */
  variant: 'fill' | 'wire';
  text?: string;
  size?: number;
  isLoading?: boolean;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RevimeLoader({
  variant,
  text,
  size = 72,
  isLoading,
  centered = true,
  style,
}: RevimeLoaderProps) {
  const { palette } = useTheme();
  const shouldRender = isLoading === undefined ? true : useLottieLoaderState(isLoading);

  if (!shouldRender) {
    return null;
  }

  return (
    <View style={[centered && styles.centeredContainer, style]}>
      <RevimeLottie variant={variant} size={size} loop={true} />
      {Boolean(text) && (
        <Text style={[styles.text, { color: palette.muted }]}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  text: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
});
