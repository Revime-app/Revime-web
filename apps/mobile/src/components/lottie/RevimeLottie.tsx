import React, { useEffect, useRef } from 'react';
import { View, useColorScheme, StyleSheet, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import LottieView from 'lottie-react-native';
import { LOTTIE_ASSETS, LottieAnimationType, LottieColorMode } from '../../lib/lottie-assets';
import { useTheme } from '../../theme';

export interface RevimeLottieProps {
  variant: LottieAnimationType;
  mode?: LottieColorMode;
  size?: number; // clamped to [64, 96], default 72
  loop?: boolean;
  startFrame?: number;
  speed?: number;
  style?: StyleProp<ViewStyle>;
}

export function RevimeLottie({
  variant,
  mode: explicitMode,
  size = 72,
  loop = true,
  startFrame,
  speed = 1,
  style,
}: RevimeLottieProps) {
  const systemScheme = useColorScheme();
  const { accent } = useTheme();
  const animationRef = useRef<LottieView>(null);

  const activeMode: LottieColorMode = explicitMode ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const clampedSize = Math.min(96, Math.max(36, size));
  const source = LOTTIE_ASSETS[variant]?.[activeMode] ?? LOTTIE_ASSETS[variant]?.light;

  useEffect(() => {
    if (animationRef.current && startFrame !== undefined) {
      animationRef.current.play(startFrame);
    }
  }, [startFrame]);

  if (!source) {
    return (
      <View style={[styles.container, { width: clampedSize, height: clampedSize }, style]}>
        <ActivityIndicator size="small" color={accent.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: clampedSize, height: clampedSize }, style]}>
      <LottieView
        ref={animationRef}
        source={source}
        autoPlay={startFrame === undefined}
        loop={loop}
        speed={speed}
        style={{ width: clampedSize, height: clampedSize }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
