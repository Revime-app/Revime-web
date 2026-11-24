import { photoExtension, UUID } from './photo-paths.js';

/**
 * `CF-23`. Avatars live in the SAME private bucket as demande photos (`PHOTO_BUCKET`), under
 * their own root prefix.
 *
 * 🛑 WHY NOT A SECOND BUCKET. The bucket name is not a parameter anywhere: `SupabaseStorageGateway`
 * interpolates `PHOTO_BUCKET` directly into all four of its endpoints (`gateway.ts:82,93,104,130`),
 * and `FakeStorageGateway` plus the orphan cron assume the same single bucket. Adding a bucket
 * argument would touch every method, both implementations and the cron for no behavioural gain --
 * the bucket is private either way, and reads are signed either way.
 *
 * 🛑 WHAT KEEPS THE FEATURES APART IS THEREFORE THIS PREFIX, AND NOTHING ELSE. 🆕 THERE ARE NOW
 * THREE OF THEM, not two: `CF-24` added `banners/` (`banner-paths.ts`). Three properties make that
 * safe, and each is asserted in a test rather than assumed:
 *
 *  1. The orphan-photo cron walks `demandes` -> user -> draft -> object explicitly - grep
 *     `cron.service.ts` for `const prefix = 'demandes'` - three levels under a different root.
 *     Profile media is two levels under its own root, so the cron cannot list it, let alone delete
 *     it. Nothing here is protected by a filter that a future `prefix` change could quietly widen.
 *  2. `checkAvatarPath` refuses a demande path outright, so the reverse direction is closed too:
 *     a client cannot point their avatar at one of their own demande photos and have the cron
 *     delete the image out from under their profile.
 *  3. 🆕 The two PROFILE-MEDIA prefixes refuse each other. Both hold objects one caller genuinely
 *     owns, so this is the one separation ownership cannot provide - see `checkProfileMediaPath`.
 *
 * There is no cron for either profile-media prefix, deliberately. Each user holds at most one
 * object under each, and the commit routes prune the rest of the prefix inline, so no orphan class
 * accumulates to sweep.
 */
export const AVATAR_PREFIX = 'avatars';

/** `avatars/{userId}` - every object one account may own. Used for the existence check. */
export function avatarPrefixFor(userId: string): string {
  return `${AVATAR_PREFIX}/${userId}`;
}

/**
 * `{prefix}/{userId}/{objectId}.{ext}` - the shape EVERY profile-media feature stores under, and
 * the one place it is written.
 *
 * 🆕 GENERALISED BY `CF-24`, which added `banners/` as a second prefix of exactly this shape. Two
 * copies of the line below would have been three characters apart and free to drift; and the
 * prefixes only stay disjoint while both agree on what a segment looks like, which is the same
 * argument `photo-paths.ts` makes for exporting `UUID`.
 *
 * Reuses `photoExtension` rather than repeating the map: the two allowed types are a property of
 * the BUCKET, which all three features share, so a divergence here would mean one of them storing
 * something the bucket rejects.
 */
export function profileMediaPathIn(
  prefix: string,
  userId: string,
  objectId: string,
  contentType: string,
): string {
  return `${prefix}/${userId}/${objectId}.${photoExtension(contentType)}`;
}

/**
 * Whether this path is one the server could actually have handed THIS caller, under THIS prefix.
 *
 * A whole-string regex rather than `startsWith`, for the reason `checkPhotoPaths` records and
 * which is worth restating because this is a separate expression: `startsWith` would accept
 * `{prefix}/{caller}extra/...` and any number of extra segments, and it is the prefix check that
 * stops one account claiming another's object.
 *
 * 🛑 SINCE `CF-24` IT ALSO KEEPS ONE CALLER'S OWN TWO PREFIXES APART, which is a second job and a
 * sharper one. An avatar path and a banner path are BOTH objects the caller owns, so an
 * ownership-only check would accept either under either checker - and because `setAvatar` and
 * `setBanner` each delete everything under their own prefix but the object being committed, a
 * crossed path means one feature silently deleting the other's image. Anchoring the regex at the
 * prefix makes that unreachable rather than merely disallowed.
 *
 * `userId` is interpolated unescaped, matching `checkPhotoPaths`. Safe because it comes from the
 * session rather than the request body, and a uuid holds no regex metacharacters - but it is the
 * reason this function must never be handed a client-supplied id.
 *
 * Existence in the bucket is NOT checked here; that needs the network and lives in the service,
 * the same split as demande photos.
 */
export function checkProfileMediaPath(
  prefix: string,
  path: string,
  userId: string,
  message: string,
): { ok: true } | { ok: false; message: string } {
  const shape = new RegExp(`^${prefix}/${userId}/${UUID}\\.(jpg|png)$`);
  if (!shape.test(path)) {
    return { ok: false, message };
  }
  return { ok: true };
}

/** `avatars/{userId}/{objectId}.{ext}`. See `profileMediaPathIn`. */
export function buildAvatarPath(
  userId: string,
  objectId: string,
  contentType: string,
): string {
  return profileMediaPathIn(AVATAR_PREFIX, userId, objectId, contentType);
}

/**
 * Whether this path is an avatar the server could have handed THIS caller. See
 * `checkProfileMediaPath` for what the whole-string match buys, including the `banners/` case.
 */
export function checkAvatarPath(
  path: string,
  userId: string,
): { ok: true } | { ok: false; message: string } {
  return checkProfileMediaPath(AVATAR_PREFIX, path, userId, 'Photo de profil invalide.');
}
