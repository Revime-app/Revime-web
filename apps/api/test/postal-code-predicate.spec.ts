import { describe, expect, it } from 'vitest';
import {
  directoryQuerySchema,
  isCompletePostalCode,
  postalCodeSchema,
  FR_POSTAL_CODE,
} from '@revime/shared';

/**
 * `CF-34`'s whole-branch review, 2026-09-02. THE SHARED POSTAL-CODE PREDICATE.
 *
 * Why it moved. `DirectoryFilterSheet.tsx` held a `hasCompleteNear` whose own comment said the
 * regex was DUPLICATED from `directoryQuerySchema` and that both must change together - in
 * `apps/mobile`, the one workspace with **no test harness at all**, so nothing could gate the
 * agreement. Its failure mode is not a wrong pixel: it is a **400** whose specific French message
 * (« Code postal invalide. ») `ZodValidationPipe` files under `AppException.fields`, which no
 * screen prints. So a drifted predicate empties the directory behind a sentence that names nothing.
 *
 * 🛑 **THE LAST TEST IN THIS FILE IS THE POINT OF THE FILE.** The others describe the predicate;
 * that one asserts the predicate and the schema AGREE, case by case, which is what makes the drift
 * impossible rather than merely discouraged. If you add a case anywhere here, add it to `CASES`.
 *
 * `packages/shared/src/phone.schemas.ts`'s `FR_MOBILE` is the shape being followed: one regex
 * constant beside the schema that consumes it. The constant lives in `postal.schemas.ts` rather
 * than in `repairer.schemas.ts` because that module already owned a **third** literal copy of this
 * exact regex and message, and its own header exists to stop a fourth.
 */

/** Every input this rule has an opinion about, with the answer we intend. */
const CASES: readonly (readonly [string, boolean])[] = [
  ['69003', true],
  ['75001', true],
  ['00000', true], // Not a real French code. The RULE is five digits; existence is BAN's job.
  ['6900', false], // four
  ['690033', false], // six
  ['6900A', false], // a letter
  ['lyon', false],
  ['', false], // « no location », the sheet's own default
  ['   ', false], // whitespace only collapses to empty
  ['750 01', false], // an INTERNAL space is not padding and is not trimmed away
  ['69 003', false],
  ['-9003', false],
  ['6900.', false],
  // 🛑 PADDED FIVE DIGITS **PASS**, and this row is deliberate rather than an oversight. Both
  // sides `.trim()` first - the predicate explicitly, the schema through `z.string().trim()` - so
  // ' 69003 ' is a usable code today and the server accepts it. Anyone changing this to `false`
  // must change the API's accepted input, which is a separate decision from sharing the regex.
  [' 69003 ', true],
  ['\t69003\n', true],
];

describe('isCompletePostalCode', () => {
  it.each(CASES.filter(([, want]) => want).map(([value]) => value))('accepts %o', (value) => {
    expect(isCompletePostalCode(value)).toBe(true);
  });

  it.each(CASES.filter(([, want]) => !want).map(([value]) => value))('refuses %o', (value) => {
    expect(isCompletePostalCode(value)).toBe(false);
  });
});

describe('FR_POSTAL_CODE is the one regex both sides read', () => {
  it('is anchored at both ends, so a five-digit substring is not a match', () => {
    // Unanchored, 'lyon 69003 rue' would pass and the URL handed to BAN would be nonsense.
    expect(FR_POSTAL_CODE.test('lyon 69003')).toBe(false);
    expect(FR_POSTAL_CODE.test('69003 rue')).toBe(false);
  });

  it('carries no `g` flag, so repeated `.test` calls cannot drift on lastIndex', () => {
    // The predicate is called on every keystroke in the sheet. A /g/ regex shared as a module
    // constant would answer differently on alternate calls for the same input.
    expect(FR_POSTAL_CODE.global).toBe(false);
    expect(FR_POSTAL_CODE.test('69003')).toBe(true);
    expect(FR_POSTAL_CODE.test('69003')).toBe(true);
  });
});

describe('postalCodeSchema shares the regex but NOT the trim', () => {
  it.each(CASES.filter(([value]) => value.trim() === value))(
    'agrees with the predicate on the unpadded input %o',
    (value, want) => {
      expect(postalCodeSchema.safeParse(value).success).toBe(want);
    },
  );

  it('refuses a PADDED code that the predicate accepts, and that divergence is intended', () => {
    // 🛑 Do NOT "harmonise" these by adding `.trim()` here. `postalCodeSchema` validates a
    // demande's, a commande's and a réparateur's stored postal code - a write. Silently trimming
    // a write is how a value the user never typed reaches the database. `near` is a READ filter
    // typed into a text field, where trimming is a kindness with no persisted consequence.
    expect(isCompletePostalCode(' 69003 ')).toBe(true);
    expect(postalCodeSchema.safeParse(' 69003 ').success).toBe(false);
  });
});

describe('the predicate and directoryQuerySchema.near agree, case by case', () => {
  it.each(CASES)('%o -> %s', (value, want) => {
    // `{ near: value }` alone triggers neither cross-field refine (no radiusKm, no
    // sort='distance'), so `success` here is a verdict on `near` and nothing else.
    const schemaAccepts = directoryQuerySchema.safeParse({ near: value }).success;

    expect(isCompletePostalCode(value)).toBe(want);
    expect(schemaAccepts).toBe(want);
    // The assertion that matters: not that each is right, but that they cannot disagree.
    expect(isCompletePostalCode(value)).toBe(schemaAccepts);
  });
});
