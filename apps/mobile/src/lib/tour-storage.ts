import * as SecureStore from 'expo-secure-store';
import { parseTourState, type TourState } from '@revime/shared';

/**
 * V8 E2 (`DEC8-09` (2)): the device copy of the help bubbles' state, so a failed `PATCH /users/me/tour`
 * never replays bubbles: the next launch merges this with the account's (`mergeTourState`, newest per
 * mode). Synchronous SecureStore, as `payout-sheet.ts`. Every storage error is swallowed: the
 * in-memory state still holds for the session.
 */

/** SecureStore keys allow only alphanumerics, `.`, `-` and `_`; a user id is alphanumeric. */
const key = (userId: string) => `tour_state_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function readTourCopy(userId: string): TourState | null {
  try {
    const raw = SecureStore.getItem(key(userId));
    return raw === null ? null : parseTourState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeTourCopy(userId: string, state: TourState): void {
  try {
    SecureStore.setItem(key(userId), JSON.stringify(state));
  } catch {
    // Keychain locked or full: the session keeps its in-memory state; the account copy still saves.
  }
}
