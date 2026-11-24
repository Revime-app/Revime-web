import React from 'react';

// Only what the screens and components under test import from `react-native-safe-area-context`.
export const SafeAreaView = ({ children, style, ...props }: any) =>
  React.createElement('SafeAreaView', { style, ...props }, children);

export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
