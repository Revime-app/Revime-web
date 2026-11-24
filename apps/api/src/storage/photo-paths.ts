import { MAX_DEMANDE_PHOTOS } from '@revime/shared';

/**
 * Private bucket. Created by hand once; see the spec's §15.
 *
 * 🛑 THE NAME IS NOW NARROWER THAN THE CONTENTS, AND GETTING NARROWER. Since `CF-23` this bucket
 * also holds profile photos under an `avatars/` prefix, and since `CF-24` réparateur banners under
 * `banners/` - see `avatar-paths.ts` for why a second bucket was rejected (the name is interpolated
 * directly into all four gateway endpoints and is not a parameter anywhere). It is deliberately NOT
 * renamed: the bucket exists in Supabase and every object path already stored is relative to it, so
 * a rename is a data migration for a cosmetic gain.
 *
 * What this means in practice: anything that walks this bucket must anchor on a prefix rather than
 * assume everything in it is a demande photo. The orphan cron does exactly that - and the list of
 * prefixes is now three long, so an audit that checks « demande photos versus avatars » is already
 * out of date.
 */
export const PHOTO_BUCKET = 'demande-photos';

const EXT_BY_TYPE: Record<string, 'jpg' | 'png'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * The only two types the bucket allows. A throw rather than a default, because a silent
 * fallback would store a HEIC under a .jpg name and every reader would then be wrong about
 * what it holds.
 */
export function photoExtension(contentType: string): 'jpg' | 'png' {
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) throw new Error(`Unsupported photo content type: ${contentType}`);
  return ext;
}

/** `demandes/{userId}/{draftId}` - the unit an abandoned wizard leaves behind. */
export function photoPrefixFor(userId: string, draftId: string): string {
  return `demandes/${userId}/${draftId}`;
}

/**
 * Built entirely from server-held values: the session's userId, the client's draftId and a
 * server-generated objectId. The client never chooses a path, which is what makes a signed
 * upload URL unable to escape its own prefix.
 */
export function buildPhotoPath(
  userId: string,
  draftId: string,
  objectId: string,
  contentType: string,
): string {
  return `${photoPrefixFor(userId, draftId)}/${objectId}.${photoExtension(contentType)}`;
}

/** The distinct `demandes/{user}/{draft}` prefixes a submitted list touches. */
export function draftPrefixesOf(paths: string[]): string[] {
  const seen = new Set<string>();
  for (const p of paths) {
    const parts = p.split('/');
    if (parts.length === 4) seen.add(parts.slice(0, 3).join('/'));
  }
  return [...seen];
}

/**
 * Exported for `avatar-paths.ts`, whose `checkProfileMediaPath` validates a different shape in the
 * SAME bucket - for BOTH profile-media prefixes since `CF-24` - and so must recognise exactly the
 * same object ids. A second copy of this string would be free to drift, and the prefixes only stay
 * disjoint while all of them agree on what a segment looks like.
 */
export const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Checks 1, 2 and 4 of the spec's §8 - count, prefix and uniqueness. Check 3 (existence in
 * the bucket) needs the network and lives in the service.
 *
 * A whole-string regex rather than `startsWith`, deliberately: `startsWith` would accept
 * `demandes/{caller}extra/...` and any number of extra segments, and it is the prefix check
 * that stops one client attaching another's photos.
 */
export function checkPhotoPaths(
  paths: string[],
  userId: string,
): { ok: true } | { ok: false; message: string } {
  if (paths.length > MAX_DEMANDE_PHOTOS) {
    return { ok: false, message: 'Dix photos au maximum.' };
  }
  if (new Set(paths).size !== paths.length) {
    return { ok: false, message: 'Cette photo est en double.' };
  }
  const shape = new RegExp(`^demandes/${userId}/${UUID}/${UUID}\\.(jpg|png)$`);
  for (const p of paths) {
    if (!shape.test(p)) {
      return { ok: false, message: 'Photo invalide.' };
    }
  }
  return { ok: true };
}
