// apps/api/scripts/seed-demo/guards.mjs
export const EXPECTED_PROJECT_REF = 'sixgwfsermdfppmzyuzk';

/**
 * PRE-2. This script runs from a laptop against the ONE real database (assertProjectRef below pins
 * it), so `NODE_ENV === 'production'` never describes it and was a guard that could not fire. Writing
 * demo data (accounts, demandes, orders and REVIEWS, which are publicly visible fake reviews) therefore
 * needs an explicit word, `ALLOW_DEMO_SEED=yes` on the command line. `--cleanup` and any `--dry-run`
 * write no demo data and need nothing.
 */
export function assertDemoSeedAllowed(env, { mode, dryRun }) {
  if (dryRun || mode === 'cleanup') return;
  if (env.ALLOW_DEMO_SEED !== 'yes') {
    throw new Error(
      `Refusing to --${mode}: it writes demo accounts and fake reviews into the real database. Set ALLOW_DEMO_SEED=yes to do it on purpose.`,
    );
  }
}

export function assertProjectRef(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Refusing to run.');
  if (!databaseUrl.includes(EXPECTED_PROJECT_REF)) {
    throw new Error(
      `DATABASE_URL does not name project ${EXPECTED_PROJECT_REF}. Refusing to run: a stale shell pointing somewhere else is the realistic failure here, not a typo.`,
    );
  }
}

export function parseMode(argv) {
  const dryRun = argv.includes('--dry-run');
  const modes = [
    ['--seed', 'seed'],
    ['--cleanup', 'cleanup'],
    ['--reset', 'reset'],
  ].filter(([flag]) => argv.includes(flag));

  if (modes.length !== 1) {
    throw new Error('Pass exactly one of --seed, --cleanup, --reset (optionally with --dry-run).');
  }
  return { mode: modes[0][1], dryRun };
}

/**
 * `nest start --watch` leaves an orphan child that keeps serving the OLD `dist` while
 * /health still answers 200. Health alone therefore proves nothing about which code is
 * running. `/notifications/unread-count` exists in current code and answers 401
 * unauthenticated; on a build that predates it, the same request 404s.
 */
export async function assertApiFresh(baseUrl, fetchImpl = fetch) {
  const health = await fetchImpl(`${baseUrl}/api/v1/health`);
  if (health.status !== 200) throw new Error(`API health is ${health.status}, expected 200.`);

  const probe = await fetchImpl(`${baseUrl}/api/v1/notifications/unread-count`);
  if (probe.status === 404) {
    throw new Error(
      'The API answered 404 on a route current code defines. That is the stale `nest --watch` orphan serving old dist. Kill it by port and restart before seeding.',
    );
  }
  if (probe.status !== 401) throw new Error(`Unexpected ${probe.status} on the freshness probe.`);
}
