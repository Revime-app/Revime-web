/**
 * Six demandes' worth per hour. Generous for a real client picking ten photos and then
 * changing their mind twice; bounded for a script.
 *
 * 🆕 SHARED BY ALL THREE SIGNING ROUTES - demande photos (`CF-23` added avatars, `CF-24` banners) -
 * which is why the budget is not per-route. One bucket, one per-user allowance: somebody who has
 * spent all 60 on demande photos cannot get a fresh 60 of bucket writes by switching to the avatar
 * or banner route. Each of those is one object per change, so neither moves this number in normal
 * use.
 *
 * 🛑 THE COUNT IN THIS FILE HAS NOW BEEN WRONG ONCE. It said « the two routes » after `CF-23` made
 * it two and again while `CF-24` made it three, because a number in prose has no gate on it. If a
 * fourth route calls `allowSignature`, this paragraph is the one to fix - grep for the function
 * rather than trusting the number.
 */
export const SIGN_RATE_PER_HOUR = 60;

const HOUR_MS = 3_600_000;

const hits = new Map<string, number[]>();

/**
 * Whether this user may mint another signed upload URL.
 *
 * Unbounded signing is unbounded bucket writes by any authenticated client, and this project
 * has treated rate limiting as first-class since Stage 3b piece 4.
 *
 * 🛑 IN MEMORY, not a database ledger, and that is a considered choice rather than a shortcut.
 * `VerificationAttempt` is a table because it is also the audit trail for messages that cost
 * real money and were actually dispatched. NONE of the routes that call this dispatches
 * anything, spends anything or creates a row, so the only thing worth remembering is a count that
 * may safely reset on deploy. (Phrased without a count on purpose - see above.)
 *
 * 🛑 THE LIMIT IS THEREFORE PER INSTANCE. `render.yaml` sets `plan: free`, which is
 * single-instance and cannot scale out, so per-instance and per-user coincide today. If the
 * service is ever upgraded to a plan that can scale out, this silently becomes a limit of
 * 60 x N and must move to a shared store - recorded here because nothing else in the codebase
 * would reveal it. A sharper hole: a free-plan service spins down when idle, so every cold
 * start clears the counter. The cap is therefore not 60/hour, but 60-per-wake, which for a
 * rarely-hit route can be far looser.
 *
 * `now` is injectable so the window can be tested without waiting an hour.
 */
export function allowSignature(userId: string, now = Date.now()): boolean {
  const cutoff = now - HOUR_MS;
  // Filtering on read rather than on a timer keeps this free of scheduled work: a user who
  // never returns simply leaves one stale array behind, and the next call prunes it.
  const recent = (hits.get(userId) ?? []).filter((t) => t > cutoff);

  if (recent.length >= SIGN_RATE_PER_HOUR) {
    // Still write the pruned array back, so a user sitting at the cap does not re-filter a
    // growing list on every refused call.
    hits.set(userId, recent);
    return false;
  }

  recent.push(now);
  hits.set(userId, recent);
  return true;
}

/** Test-only. The counter is module-level, so a test must clear it to be independent. */
export function __resetSignLimit(): void {
  hits.clear();
}
