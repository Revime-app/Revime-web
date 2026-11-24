import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  define: {
    // React Native's global. `app/demande/[id]/paiement.tsx` reads it at module scope, and specs
    // import that screen, where Node has no such global.
    __DEV__: true,
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'test/react-native-mock.ts'),
      'react-native-svg': path.resolve(__dirname, 'test/react-native-mock.ts'),
      'react-native-safe-area-context': path.resolve(__dirname, 'test/safe-area-mock.ts'),
      '@hugeicons/react-native': path.resolve(__dirname, 'test/hugeicons-mock.ts'),
      'lottie-react-native': path.resolve(__dirname, 'test/lottie-mock.ts'),
      '@sentry/react-native': path.resolve(__dirname, 'test/sentry-mock.ts'),
    },
  },
  test: {
    globals: true,
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
  },
});
