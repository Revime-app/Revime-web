import { checkProfileMediaPath, profileMediaPathIn } from './avatar-paths.js';

/**
 * `CF-24`. A réparateur's fiche-publique banner, the THIRD feature in `PHOTO_BUCKET`, under its
 * own root prefix.
 *
 * 🛑 WHY NOT A SECOND BUCKET: unchanged from `CF-23`, and read `avatar-paths.ts` for the full
 * argument. The short version is that the bucket name is not a parameter anywhere -
 * `SupabaseStorageGateway` interpolates `PHOTO_BUCKET` straight into all four of its endpoints -
 * so a per-feature bucket would mean threading an argument through every method, both
 * implementations and the cron for no behavioural gain.
 *
 * 🛑 WHAT IS NEW HERE, AND IT IS NOT A RESTATEMENT: with two profile-media prefixes there are now
 * two roots holding objects ONE caller legitimately owns. `setAvatar` and `setBanner` each prune
 * everything under their own prefix that is not the object being committed, so a path accepted by
 * the wrong checker means one feature silently deleting the other's image. The whole-string match
 * in `checkProfileMediaPath` is what makes that unreachable rather than merely forbidden, and both
 * directions are asserted in `banner-paths.spec.ts`.
 *
 * There is no cron for `banners/`, deliberately, for the same reason there is none for `avatars/`:
 * each account holds at most one banner and `setBanner` clears the rest of the prefix inline, so
 * no orphan class accumulates to sweep.
 */
export const BANNER_PREFIX = 'banners';

/** `banners/{userId}` - every banner object one account may own. Used for the existence check. */
export function bannerPrefixFor(userId: string): string {
  return `${BANNER_PREFIX}/${userId}`;
}

/**
 * Built entirely from server-held values - the session's userId and a server-generated objectId.
 * The client chooses no part of it, which is what stops a signed upload URL escaping its prefix.
 */
export function buildBannerPath(
  userId: string,
  objectId: string,
  contentType: string,
): string {
  return profileMediaPathIn(BANNER_PREFIX, userId, objectId, contentType);
}

/**
 * Whether this path is one the server could actually have handed THIS caller.
 *
 * Its own French message rather than the avatar's, because the app renders the message verbatim
 * under whichever control failed - « Photo de profil invalide. » beneath the banner picker would
 * name the wrong thing.
 */
export function checkBannerPath(
  path: string,
  userId: string,
): { ok: true } | { ok: false; message: string } {
  return checkProfileMediaPath(BANNER_PREFIX, path, userId, 'Bannière invalide.');
}
