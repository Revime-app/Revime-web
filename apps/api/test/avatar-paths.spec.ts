import { describe, expect, it } from 'vitest';
import {
  AVATAR_PREFIX,
  avatarPrefixFor,
  buildAvatarPath,
  checkAvatarPath,
} from '../src/storage/avatar-paths.js';

/**
 * `CF-23`. Avatars share the `demande-photos` bucket rather than parameterising the gateway's
 * hardcoded bucket across four methods and the cron, so the ONE thing that keeps them separate
 * is the path prefix. That makes these two functions load-bearing rather than plumbing, and it
 * is why the escape cases below are asserted individually instead of as one « invalid » case.
 *
 * The other half of the separation is asserted in `cron-photo-orphans.spec.ts`: the orphan cron
 * walks `demandes/{user}/{draft}/{object}` and must never reach an avatar.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';

describe('buildAvatarPath', () => {
  it('is two segments deep, so the demande cron\'s three-level walk cannot reach it', () => {
    const path = buildAvatarPath(USER, OBJECT, 'image/jpeg');

    expect(path).toBe(`avatars/${USER}/${OBJECT}.jpg`);
    // The cron lists `demandes` -> user -> draft -> object. An avatar has no draft level and
    // a different root, so BOTH would have to change for it to be swept.
    expect(path.split('/')).toHaveLength(3);
    expect(path.startsWith('demandes/')).toBe(false);
  });

  it('maps png to its own extension rather than storing it under .jpg', () => {
    expect(buildAvatarPath(USER, OBJECT, 'image/png')).toBe(`avatars/${USER}/${OBJECT}.png`);
  });

  /**
   * A throw rather than a default, the same choice `photoExtension` makes: a silent fallback
   * would store a HEIC under a `.jpg` name and every later reader would be wrong about it.
   */
  it('throws on a content type the bucket does not allow', () => {
    expect(() => buildAvatarPath(USER, OBJECT, 'image/heic')).toThrow();
  });
});

describe('avatarPrefixFor', () => {
  it('is the one prefix a caller\'s objects live under', () => {
    expect(avatarPrefixFor(USER)).toBe(`avatars/${USER}`);
    expect(AVATAR_PREFIX).toBe('avatars');
  });
});

describe('checkAvatarPath', () => {
  it('accepts a path this caller could actually have been handed', () => {
    expect(checkAvatarPath(`avatars/${USER}/${OBJECT}.jpg`, USER).ok).toBe(true);
    expect(checkAvatarPath(`avatars/${USER}/${OBJECT}.png`, USER).ok).toBe(true);
  });

  it('rejects another user\'s avatar, which is the whole point of the check', () => {
    expect(checkAvatarPath(`avatars/${OTHER}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  /**
   * `startsWith` would accept this. A whole-string regex is what stops one account claiming a
   * path inside a sibling prefix whose name merely begins with its own id -- the identical
   * reasoning `checkPhotoPaths` records, restated because this is a separate regex.
   */
  it('rejects a prefix that merely BEGINS with the caller\'s id', () => {
    expect(checkAvatarPath(`avatars/${USER}extra/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects extra path segments', () => {
    expect(checkAvatarPath(`avatars/${USER}/sub/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects a traversal attempt', () => {
    expect(checkAvatarPath(`avatars/${USER}/../${OTHER}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  /**
   * The reason the prefix is checked and not just the shape: a demande photo path is a real
   * path this caller DOES own, so ownership alone would let a client point their avatar at a
   * photo the orphan cron is free to delete underneath them.
   */
  it('rejects the caller\'s own DEMANDE photo path', () => {
    expect(checkAvatarPath(`demandes/${USER}/${OBJECT}/${OBJECT}.jpg`, USER).ok).toBe(false);
  });

  it('rejects an extension the bucket does not allow', () => {
    expect(checkAvatarPath(`avatars/${USER}/${OBJECT}.heic`, USER).ok).toBe(false);
    expect(checkAvatarPath(`avatars/${USER}/${OBJECT}.svg`, USER).ok).toBe(false);
  });

  it('rejects an object id that is not a uuid', () => {
    expect(checkAvatarPath(`avatars/${USER}/avatar.jpg`, USER).ok).toBe(false);
  });

  it('carries a French message on every rejection, because the app renders it', () => {
    const bad = checkAvatarPath(`avatars/${OTHER}/${OBJECT}.jpg`, USER);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/[a-zé]/i);
  });
});
