import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.spec.ts'],
    fileParallelism: false,
    // 120s, not 30s, and this is measured rather than cautious. Two tests in
    // commandes.int.spec.ts walk the whole nine-step parcel journey -- about 18
    // round trips to Supabase eu-west-3 plus two Better Auth password hashes --
    // and take ~32s each. At 30s they failed as timeouts while being entirely
    // correct, which is a false red on every full-suite run. A passing test
    // never waits for this ceiling.
    hookTimeout: 120_000,
    testTimeout: 120_000,
    setupFiles: ['dotenv/config'],
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
