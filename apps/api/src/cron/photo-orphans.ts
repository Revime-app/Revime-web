const ORPHAN_MIN_AGE_MS = 24 * 3600_000;

/**
 * BOTH halves are load-bearing. Unreferenced alone would delete a photo a client picked
 * thirty seconds ago and has not published yet; age alone would delete published ones.
 */
export function shouldPurge(o: { createdAt: string; referenced: boolean }, now: Date): boolean {
  if (o.referenced) return false;
  return now.getTime() - new Date(o.createdAt).getTime() >= ORPHAN_MIN_AGE_MS;
}
