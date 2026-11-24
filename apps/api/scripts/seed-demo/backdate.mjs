/**
 * Four offers created in the same second read as freshly injected, which defeats
 * the whole exercise. Spread them back over the last two days, newest first so the
 * offers list has a plausible arrival order.
 */
export function planBackdate({ offerIds, now }) {
  const STEP_MINUTES = [95, 430, 900, 1580];
  return offerIds.map((id, i) => ({
    id,
    createdAt: new Date(now.getTime() - STEP_MINUTES[i % STEP_MINUTES.length] * 60_000),
  }));
}
