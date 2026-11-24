import { z } from 'zod';

/**
 * A French postal code is exactly five digits, anchored at both ends.
 *
 * Named and exported on `phone.schemas.ts`'s `FR_MOBILE` precedent - one regex constant beside the
 * schema that consumes it - with one difference: this one is EXPORTED, because a consumer outside
 * this package needs the same rule. See `isCompletePostalCode` below for who and why.
 *
 * 🛑 **NO `g` FLAG, and that is not incidental.** This constant is shared and `.test`ed on every
 * keystroke in the annuaire's filter sheet; a `/g/` regex carries `lastIndex` between calls and
 * would answer differently on alternate calls for the same input. A test pins it.
 */
export const FR_POSTAL_CODE = /^\d{5}$/;

/**
 * Is this string a USABLE French postal code - i.e. is there a location here at all?
 *
 * 🛑 THE POINT OF THIS FUNCTION IS THAT IT IS THE **ONLY** COPY OF THE QUESTION. It replaces
 * `DirectoryFilterSheet.tsx`'s `hasCompleteNear`, whose own comment recorded that its regex was
 * duplicated from `directoryQuerySchema` and that both had to change together - in `apps/mobile`,
 * the one workspace with **no test harness**, so nothing could gate the agreement. The failure mode
 * was never cosmetic: `directoryQuerySchema.near` refuses anything but five digits with a **400**,
 * and `ZodValidationPipe` files the specific « Code postal invalide. » under `AppException.fields`
 * while the top-level message stays the generic « Les informations envoyées sont invalides. ».
 * **No screen prints `fields`.** So a `near.length > 0` test, or a drifted second regex, empties
 * the directory behind a sentence that names nothing.
 *
 * **It TRIMS, matching `directoryQuerySchema.near`'s `z.string().trim()`** - so « ` 69003 ` » is a
 * usable code and « `   ` » is not. That is a read filter typed into a text field, where trimming
 * is a kindness with no persisted consequence. `postalCodeSchema` below deliberately does NOT trim;
 * `postal-code-predicate.spec.ts` pins both the agreement and that one divergence.
 *
 * Callers: every mobile site that asks « is there a usable location » - the annuaire filter
 * sheet's hint, its distance group, `setNear`, `normalisedForApply`, `activeFilterCount`, and the
 * directory's query, chip row and empty-state hint.
 */
export function isCompletePostalCode(value: string): boolean {
  return FR_POSTAL_CODE.test(value.trim());
}

/**
 * French postal codes are exactly five digits.
 *
 * Lives in its own module because three call sites need it - the demande
 * schema, the offer path's history, and the réparateur location endpoint - and
 * a third literal copy of this French message is exactly the duplication
 * already logged against `phone.schemas.ts` / `auth.ts` / `auth-errors.ts`.
 *
 * 🛑 **DOES NOT TRIM, unlike `isCompletePostalCode` and unlike `directoryQuerySchema.near`.** Do
 * not "harmonise" them by adding `.trim()` here: this schema validates a demande's, a commande's
 * and a réparateur's **stored** postal code, and silently trimming a write is how a value the user
 * never typed reaches the database. The read filter and the write validator share the RULE
 * (`FR_POSTAL_CODE`) and differ on input handling, on purpose.
 */
export const postalCodeSchema = z
  .string()
  .regex(FR_POSTAL_CODE, { message: 'Code postal invalide.' });
