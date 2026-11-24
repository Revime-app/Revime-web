import React from 'react';

const createComponent = (name: string) => {
  const Comp = (props: any) => {
    let children = props?.children;
    if (typeof children === 'function') {
      children = children({ pressed: false });
    }
    return React.createElement(name, props, children);
  };
  Comp.displayName = name;
  return Comp;
};

export const View = createComponent('View');
export const Text = createComponent('Text');
export const Pressable = createComponent('Pressable');
export const Modal = createComponent('Modal');
export const ScrollView = createComponent('ScrollView');
export const KeyboardAvoidingView = createComponent('KeyboardAvoidingView');
export const ActivityIndicator = createComponent('ActivityIndicator');
export const RefreshControl = createComponent('RefreshControl');
export const Image = createComponent('Image');

export const Linking = {
  openURL: async (_url: string) => true,
};

class AnimatedValue {
  val: number;
  constructor(val: number) {
    this.val = val;
  }
  interpolate() {
    return this;
  }
}

export const Animated = {
  Value: AnimatedValue,
  timing: (_val: any, _config: any) => ({
    start: (cb?: (result: { finished: boolean }) => void) => cb && cb({ finished: true }),
  }),
  add: () => ({
    interpolate: () => ({}),
  }),
  event: () => () => {},
  View: createComponent('Animated.View'),
  ScrollView: createComponent('Animated.ScrollView'),
};

export const StyleSheet = {
  create: (styles: any) => styles,
  flatten: (styles: any) => styles,
};

export const useColorScheme = () => 'light' as const;

export const Platform = {
  OS: 'ios',
  select: (obj: any) => obj.ios ?? obj.default,
};

export const Dimensions = {
  get: () => ({ width: 375, height: 812 }),
};

export const useWindowDimensions = () => ({ width: 375, height: 812 });

export default {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Linking,
  Animated,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
};
