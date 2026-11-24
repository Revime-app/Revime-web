import { describe, expect, it } from 'vitest';
import {
  BANNER_PREFIX,
  bannerPrefixFor,
  buildBannerPath,
  checkBannerPath,
} from '../src/storage/banner-paths.js';
import { checkAvatarPath } from '../src/storage/avatar-paths.js';

/**
 * `CF-24`. A réparateur's banner is the THIRD feature sharing `PHOTO_BUCKET`, and - exactly as
 * with `CF-23`'s avatars - the ONE thing keeping the three apart is the root prefix. That makes
 * these functions load-bearing rather than plumbing.
 *
 * 🛑 THE NEW CASE THIS FILE ADDS, AND THE REASON IT IS NOT A COPY OF `avatar-paths.spec.ts`:
 * there are now TWO profile-media prefixes a caller genuinely owns objects under, so « refuses
 * another account » is no longer sufficient. A banner path and an avatar path must each refuse the
 * OTHER, or a réparateur could point his banner at his own avatar object and have `setAvatar`'s
 * prune delete it out from under his fiche publique - an image vanishing with no error anywhere.
 * Both directions are asserted below.
 *
 * The other half of the separation is in `cron-photo-orphans.spec.ts`: the orphan cron walks
 * `demandes/{user}/{draft}/{object}` and must never reach either profile-media prefix.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';

describe('buildBannerPath', () => {
  it('is two segments deep under its own root, so the demande cron cannot reach it', () => {
    const path = buildBannerPath(USER, OBJECT, 'image/jpeg');

    expect(path).toBe(`banners/${USER}/${OBJECT}.jpg`);
    // The cron lists `demandes` -> user -> draft -> object. A banner has no draft level and a
    // different root, so BOTH would have to change for it to be swept.
    expect(path.split('/')).toHaveLength(3);
    expect(path.startsWith('demandes/')).toBe(false);
  });

  it('maps png to its own extension rather than storing it under .jpg', () => {
    expect(buildBannerPath(USER, OBJECT, 'image/png')).toBe(`banners/${USER}/${OBJECT}.png`);
  });

  /**
   * The two allowed types are a property of the BUCKET, which all three features share, so this
   * reuses `photoExtension` rather than repeating the map. A silent fallback would store a HEIC
   * under a `.jpg` name and every later reader would be wrong about it.
   */
  it('throws on a content type the bucket does not allow', () => {
    expect(() => buildBannerPath(USER, OBJECT, 'image/heic')).toThrow();
  });
});

describe('bannerPrefixFor', () => {
  it('is the one prefix a caller\'s banner objects live under', () => {
    expect(bannerPrefixFor(USER)).toBe(`banners/${USER}`);
    expect(BANNER_PREFIX).toBe('banners');
  });

  /**
   * Not decoration: the prune in `setBanner` deletes everything under the prefix it is given, so
   * the two prefixes overlapping would make one feature's commit delete the other's object.
   */
  it('cannot collide with the avatar prefix for the same user', () => {
    expect(bannerPrefixFor(USER).startsWith('avatars')).toBe(false);
  });
});

describe('checkBannerPath', () => {
  it('accepts a path this caller could actually have been handed', () => {
    expect(checkBannerPath(`banners/${USER}/${OBJECT}.jpg`, USER).ok).toBe(true);
    expect(checkBannerPath(`banners/${USER}/${OBJECT}.png`, USER).ok).toBe(true);
  });

  it('rejects another user\'s banner, which is the whole point of the check', () => {
    expect(checkBannerPath(`banners/${OTHER}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  /**
   * `startsWith` would accept this. A whole-string match is what stops one account claiming a
   * path inside a sibling prefix whose name merely begins with its own id.
   */
  it('rejects a prefix that merely BEGINS with the caller\'s id', () => {
    expect(checkBannerPath(`banners/${USER}extra/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects extra path segments', () => {
    expect(checkBannerPath(`banners/${USER}/sub/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects a traversal attempt', () => {
    expect(checkBannerPath(`banners/${USER}/../${OTHER}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects the caller\'s own DEMANDE photo path', () => {
    expect(checkBannerPath(`demandes/${USER}/${OBJECT}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  /**
   * 🛑 THE CASE `CF-23` COULD NOT HAVE. Both prefixes hold objects this caller genuinely owns, so
   * an ownership-only check passes both. It must not: each feature's commit prunes everything else
   * under its own prefix, so a crossed path means one image silently deletes the other.
   */
  it('rejects the caller\'s own AVATAR path, and the avatar check rejects a banner', () => {
    expect(checkBannerPath(`avatars/${USER}/${OBJECT}.jpg`, USER).ok).toBe(false);
    expect(checkAvatarPath(`banners/${USER}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects an extension the bucket does not allow', () => {
    expect(checkBannerPath(`banners/${USER}/${OBJECT}.heic`, USER).ok).toBe(false);
    expect(checkBannerPath(`banners/${USER}/${OBJECT}.svg`, USER).ok).toBe(false);
  });

  it('rejects an object id that is not a uuid', () => {
    expect(checkBannerPath(`banners/${USER}/banner.jpg`, USER).ok).toBe(false);
  });

  /**
   * Its own message rather than the avatar's, because the app renders it verbatim on a different
   * control - « Photo de profil invalide. » under the banner picker would name the wrong thing.
   */
  it('carries a French message naming the BANNER, not the profile photo', () => {
    const bad = checkBannerPath(`banners/${OTHER}/${OBJECT}.jpg`, USER);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.message).toMatch(/bannière/i);
      expect(bad.message).not.toMatch(/photo de profil/i);
    }
  });
});
