import { describe, expect, it } from 'vitest';
import {
  PHOTO_BUCKET,
  buildPhotoPath,
  checkPhotoPaths,
  draftPrefixesOf,
  photoExtension,
  photoPrefixFor,
} from '../src/storage/photo-paths.js';
import { MAX_DEMANDE_PHOTOS, createDemandeSchema } from '@revime/shared';
import { SIGN_RATE_PER_HOUR, __resetSignLimit, allowSignature } from '../src/storage/sign-limit.js';

const U = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const O = '33333333-3333-4333-8333-333333333333';

describe('photo paths', () => {
  it('names the bucket', () => {
    expect(PHOTO_BUCKET).toBe('demande-photos');
  });

  it('maps content types to extensions and refuses anything else', () => {
    expect(photoExtension('image/jpeg')).toBe('jpg');
    expect(photoExtension('image/png')).toBe('png');
    expect(() => photoExtension('image/heic')).toThrow();
    expect(() => photoExtension('application/pdf')).toThrow();
  });

  it('builds a path under the caller prefix', () => {
    expect(buildPhotoPath(U, D, O, 'image/jpeg')).toBe(`demandes/${U}/${D}/${O}.jpg`);
    expect(photoPrefixFor(U, D)).toBe(`demandes/${U}/${D}`);
  });

  it('collects the distinct draft prefixes of a path list', () => {
    const a = buildPhotoPath(U, D, O, 'image/jpeg');
    const b = buildPhotoPath(U, D, '44444444-4444-4444-8444-444444444444', 'image/png');
    expect(draftPrefixesOf([a, b])).toEqual([`demandes/${U}/${D}`]);
  });

  it('accepts an empty list', () => {
    expect(checkPhotoPaths([], U)).toEqual({ ok: true });
  });

  it('accepts ten of the caller own paths', () => {
    const paths = Array.from({ length: 10 }, (_, i) =>
      buildPhotoPath(U, D, `3333333${i}-3333-4333-8333-333333333333`, 'image/jpeg'),
    );
    expect(checkPhotoPaths(paths, U)).toEqual({ ok: true });
  });

  it('REFUSES eleven paths', () => {
    const paths = Array.from({ length: 11 }, (_, i) =>
      buildPhotoPath(U, D, `3333333${i}-3333-4333-8333-333333333333`, 'image/jpeg'),
    );
    expect(checkPhotoPaths(paths, U).ok).toBe(false);
  });

  // THE check that matters: without it one client can attach another client's photos.
  it('REFUSES a path under another user prefix', () => {
    const other = '99999999-9999-4999-8999-999999999999';
    const foreign = buildPhotoPath(other, D, O, 'image/jpeg');
    expect(checkPhotoPaths([foreign], U).ok).toBe(false);
  });

  it('REFUSES traversal and absolute paths', () => {
    expect(checkPhotoPaths([`demandes/${U}/../${U}/x.jpg`], U).ok).toBe(false);
    expect(checkPhotoPaths(['/etc/passwd'], U).ok).toBe(false);
    expect(checkPhotoPaths([`demandes/${U}`], U).ok).toBe(false);
  });

  // A prefix that merely STARTS with the caller id must not pass: a userId is a uuid so
  // this cannot happen today, but the check is cheap and the failure would be silent.
  it('REFUSES a prefix that only starts with the caller id', () => {
    const sneaky = `demandes/${U}extra/${D}/${O}.jpg`;
    expect(checkPhotoPaths([sneaky], U).ok).toBe(false);
  });

  it('REFUSES duplicates', () => {
    const p = buildPhotoPath(U, D, O, 'image/jpeg');
    expect(checkPhotoPaths([p, p], U).ok).toBe(false);
  });

  it('refuses an unexpected extension', () => {
    expect(checkPhotoPaths([`demandes/${U}/${D}/${O}.svg`], U).ok).toBe(false);
  });

  it('gives a French message on every refusal', () => {
    const r = checkPhotoPaths(['/etc/passwd'], U);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });
});

describe('createDemandeSchema photoPaths', () => {
  const base = {
    categoryId: '55555555-5555-4555-8555-555555555555',
    title: 'Ecran casse sur mon telephone',
    description: 'Le verre est fissure sur toute la diagonale et le tactile repond mal.',
    mode: 'OFFERS' as const,
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
  };

  it('caps at MAX_DEMANDE_PHOTOS', () => {
    expect(MAX_DEMANDE_PHOTOS).toBe(10);
    const tooMany = Array.from({ length: 11 }, (_, i) => `demandes/u/d/${i}.jpg`);
    expect(createDemandeSchema.safeParse({ ...base, photoPaths: tooMany }).success).toBe(false);
  });

  // The reason `.default([])` was chosen over `.optional()`: ten existing test files POST
  // create bodies with no photoPaths, and the client's installed binary sends none either.
  it('defaults to an empty array when absent, so existing callers keep working', () => {
    const parsed = createDemandeSchema.parse(base);
    expect(parsed.photoPaths).toEqual([]);
  });

  it('accepts exactly ten', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `demandes/u/d/${i}.jpg`);
    expect(createDemandeSchema.safeParse({ ...base, photoPaths: ten }).success).toBe(true);
  });
});

describe('signature rate limit', () => {
  it('allows SIGN_RATE_PER_HOUR then refuses, per user, and forgets after an hour', () => {
    __resetSignLimit();
    const t0 = 1_000_000;

    for (let i = 0; i < SIGN_RATE_PER_HOUR; i++) {
      expect(allowSignature('u', t0)).toBe(true);
    }
    expect(allowSignature('u', t0)).toBe(false);

    // Per USER, not global: one client at the cap must not lock everybody out.
    expect(allowSignature('other', t0)).toBe(true);

    // One hour and a millisecond later the window has rolled off entirely.
    expect(allowSignature('u', t0 + 3_600_001)).toBe(true);
  });

  it('slides rather than resetting on a fixed boundary', () => {
    __resetSignLimit();
    const t0 = 5_000_000;
    // Fill the window, then step forward half an hour: the early hits are still inside the
    // trailing hour, so the cap must still hold. A fixed-window limiter would wrongly allow.
    for (let i = 0; i < SIGN_RATE_PER_HOUR; i++) expect(allowSignature('u', t0)).toBe(true);
    expect(allowSignature('u', t0 + 1_800_000)).toBe(false);
  });
});
