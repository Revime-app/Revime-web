import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Animated, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { RevimeLottie } from './RevimeLottie';
import { splashStatusBarStyle } from '../../lib/status-bar';
import { useTheme } from '../../theme';

interface Props {
  isAppReady: boolean;
}

type SplashStage = 'INTRO' | 'WAITING_FILL' | 'FADING' | 'DONE';

/** The intro animation's length. It is played as is (client, CF6-08), then handed to the fill loop. */
export const STARTUP_SPLASH_INTRO_MS = 1_500;

/**
 * CF6-08. The longest the splash may cover the app. If fonts never load or the session never
 * settles (the auth client has no timeout of its own), an opaque full-screen layer at zIndex 9999
 * would block the whole interface with no way out. After this it fades and the app shows whatever
 * state it is in, which is better than a screen the user cannot leave.
 */
export const STARTUP_SPLASH_MAX_MS = 15_000;

/**
 * Set once the splash has faded out. MODULE state on purpose: the intro belongs to a cold launch,
 * and a remount of the layout, a client/réparateur mode switch or a re-render must not replay it.
 * It resets only when the JS context restarts (an app kill, or a reload in development).
 */
let startupSplashCompleted = false;

/** Test-only, like `__resetRefreshCooldownForTest` in `lib/session.tsx`. */
export function __resetStartupSplashForTest(): void {
  startupSplashCompleted = false;
}

export function RevimeStartupSplash({ isAppReady }: Props) {
  // Every hook runs on every render, including after completion. The early return used to sit above
  // them, so a re-render after the splash finished called no hooks at all.
  const { palette } = useTheme();
  const colorScheme = useColorScheme();
  const [stage, setStage] = useState<SplashStage>(startupSplashCompleted ? 'DONE' : 'INTRO');
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const isAppReadyRef = useRef(isAppReady);
  isAppReadyRef.current = isAppReady;

  const hasSwitchedToFillRef = useRef(false);

  useEffect(() => {
    if (stage === 'DONE') return undefined;

    // Stage 1: the intro plays for its full length, then either fades (app ready) or hands over to
    // the fill loader at frame 60 while the app finishes starting.
    const introTimer = setTimeout(() => {
      if (isAppReadyRef.current) {
        setStage('FADING');
      } else {
        hasSwitchedToFillRef.current = true;
        setStage('WAITING_FILL');
      }
    }, STARTUP_SPLASH_INTRO_MS);

    // The ceiling: never cover the interface for longer than this, ready or not.
    const ceilingTimer = setTimeout(() => {
      setStage((current) => (current === 'DONE' || current === 'FADING' ? current : 'FADING'));
    }, STARTUP_SPLASH_MAX_MS);

    return () => {
      clearTimeout(introTimer);
      clearTimeout(ceilingTimer);
    };
    // Armed once per mount: `stage` is read only to skip arming when already DONE.
  }, []);

  // When the app becomes ready during WAITING_FILL, transition to fade
  useEffect(() => {
    if (stage === 'WAITING_FILL' && isAppReady) {
      setStage('FADING');
    }
  }, [stage, isAppReady]);

  // Execute fade out
  useEffect(() => {
    if (stage === 'FADING') {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        startupSplashCompleted = true;
        setStage('DONE');
      });
    }
  }, [stage, opacityAnim]);

  if (stage === 'DONE' || startupSplashCompleted) {
    return null;
  }

  const bgColor = colorScheme === 'dark' ? '#010524' : palette.paper;

  return (
    <Animated.View
      pointerEvents={stage === 'FADING' ? 'none' : 'auto'}
      style={[
        StyleSheet.absoluteFill,
        styles.splashContainer,
        { backgroundColor: bgColor, opacity: opacityAnim },
      ]}
    >
      {/* V8 B1 (FND8-014): light icons over the navy dark-mode splash. Mounted after the root
          layout's, so it wins while the splash is up and the app's dark icons return when it unmounts. */}
      <StatusBar style={splashStatusBarStyle(colorScheme)} />
      {!hasSwitchedToFillRef.current ? (
        <RevimeLottie variant="intro" size={96} loop={false} />
      ) : (
        <RevimeLottie variant="fill" size={80} loop={true} startFrame={60} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
