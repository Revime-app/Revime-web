import React from 'react';
import { KeyboardAvoidingView, StyleSheet, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * 🛑 V7 A1 / A2 (U3). The ONLY place this app renders a `KeyboardAvoidingView`, so its behaviour
 * cannot be forgotten on the next form. `test/v7-u3-keyboard-coverage.spec.ts` fails if a file
 * renders one directly, or holds a text input without this wrapper and without a stated reason.
 *
 * Why `padding` on Android too, when every screen used to pass `undefined` there (as Expo's keyboard
 * guide still suggests): that advice assumes Android RESIZES the window for the keyboard
 * (`adjustResize`). React Native 0.86 turns edge-to-edge on for an app targeting SDK 35+ on Android 15
 * and always on Android 16 (`WindowUtil.kt`, `updateEdgeToEdgeFeatureFlag`), which calls
 * `setDecorFitsSystemWindows(false)`, and then nothing resizes. A `KeyboardAvoidingView` with no
 * `behavior` renders a plain View, so the keyboard covered the offer's « Commentaire » and the
 * conversation's composer (the client's A1 and A2 screenshots, Android, APK `9e9d3c66`).
 *
 * With `padding`, React Native measures the overlap from `keyboardDidShow`, whose `screenY` Android
 * still reports from the IME insets (`ReactRootView.checkForKeyboardEvents`), and pads the bottom by it.
 * The ScrollView inside then shrinks, and Android's own `ScrollView.onSizeChanged` scrolls the focused
 * field back into view (A1's « faire défiler jusqu'au champ actif »): the same mechanism `adjustResize`
 * used to trigger. On an older Android that still resizes, the window shrinks first, the overlap
 * measures 0 and nothing is added twice. iOS already used `padding` everywhere.
 *
 * The overlap is measured from this view's frame RELATIVE TO ITS PARENT, so the parent must start at
 * the top of the window (every screen here is a full-screen root with `headerShown: false`); otherwise
 * pass `keyboardVerticalOffset`. `behavior` is not a prop on purpose.
 *
 * Not proven on a device: whether Android delivers keyboard events to content inside a `Modal`
 * (a separate dialog window). The three sheets use this wrapper anyway; it cannot make them worse.
 */
export type KeyboardAvoiderProps = Omit<KeyboardAvoidingViewProps, 'behavior'>;

export function KeyboardAvoider({ style, ...rest }: KeyboardAvoiderProps) {
  return <KeyboardAvoidingView {...rest} style={[styles.fill, style]} behavior="padding" />;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
