import type { MeResponse } from './user.schemas.js';

/**
 * Has this account ever made an explicit mode choice?
 *
 * 🛑 THE SIGNAL IS BORROWED, AND THAT IS LOAD-BEARING.
 * `Profile.onboardingCompletedAt` is stamped by `users.service.ts:72` on the
 * FIRST call to `PATCH /users/me/modes` and never again. That endpoint's only
 * caller is `applyModes`, which is only reached from a mode choice -- so today
 * the field means both « finished onboarding » (its name) and « chose a mode »
 * (its single writer).
 *
 * If a SECOND writer is ever added, or if onboarding grows a step that completes
 * after the mode choice, this function silently stops detecting new accounts and
 * the chooser stops appearing. It fails quietly, in the direction of skipping a
 * screen, which is the hard kind to notice. Give the field a dedicated sibling
 * before adding another writer.
 *
 * Verified against the live DB on 2026-08-20: non-null for all three real
 * accounts including the client's, so no existing account is ever shown the
 * chooser by this.
 *
 * Absence is normalised ONCE, here, rather than at each call site: the field can
 * arrive `undefined` from an API older than the app, and `undefined !== null`
 * passes a raw null check. See the standing constraint in apps/mobile/AGENTS.md.
 */
export function needsModeChoice(
  me: Pick<MeResponse, 'profile'> | null | undefined,
): boolean {
  // Not « new », but « unknown ». Fail closed to the tabs.
  if (me === null || me === undefined) return false;
  return (me.profile?.onboardingCompletedAt ?? null) === null;
}
