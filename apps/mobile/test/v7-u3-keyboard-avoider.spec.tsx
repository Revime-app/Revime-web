import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from 'react-native';

import { KeyboardAvoider } from '../src/components/KeyboardAvoider';
import { findNodesByType } from './render-tree';

/**
 * V7 A1 / A2 (U3). Under Android edge-to-edge (React Native 0.86, target SDK 36) the window no
 * longer resizes for the keyboard, and a `KeyboardAvoidingView` whose `behavior` is `undefined`
 * renders a plain View. So the behaviour must be `padding` on Android too, and no screen may pass
 * its own.
 */
describe('KeyboardAvoider', () => {
  const os = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = os;
  });

  function avoidingViewFor(platform: 'ios' | 'android', props: Record<string, unknown> = {}) {
    (Platform as { OS: string }).OS = platform;
    const tree = (KeyboardAvoider as (p: Record<string, unknown>) => React.ReactElement)({
      children: React.createElement('Text', null, 'form'),
      ...props,
    });
    const found = findNodesByType(tree, 'KeyboardAvoidingView');
    expect(found).toHaveLength(1);
    return found[0];
  }

  it('pads on Android, where `undefined` did nothing (the client’s A1 and A2)', () => {
    expect(avoidingViewFor('android').props.behavior).toBe('padding');
  });

  it('pads on iOS, as every screen already did', () => {
    expect(avoidingViewFor('ios').props.behavior).toBe('padding');
  });

  it('fills its parent by default and passes the rest through', () => {
    const view = avoidingViewFor('android', { keyboardVerticalOffset: 12, testID: 'avoid' });
    expect(view.props.style).toEqual([{ flex: 1 }, undefined]);
    expect(view.props.keyboardVerticalOffset).toBe(12);
    expect(view.props.testID).toBe('avoid');
  });

  it('keeps a screen’s own style after the default', () => {
    const view = avoidingViewFor('android', { style: { backgroundColor: 'red' } });
    expect(view.props.style).toEqual([{ flex: 1 }, { backgroundColor: 'red' }]);
  });

  it('ignores a `behavior` slipped past the type, so no screen can bring `undefined` back', () => {
    expect(avoidingViewFor('android', { behavior: undefined }).props.behavior).toBe('padding');
    expect(avoidingViewFor('android', { behavior: 'height' }).props.behavior).toBe('padding');
  });
});
