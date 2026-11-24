import { z } from 'zod';

/** Everything a French user plausibly types as a separator. */
const SEPARATORS = /[\s.\-()]/g;

/** 06 or 07, or the same number written +336 / +337. Eight digits follow. */
const FR_MOBILE = /^(?:0|\+33)[67]\d{8}$/;

/**
 * A French mobile number, normalised to E.164 (`+33XXXXXXXXX`).
 *
 * Normalisation is not cosmetic. `user.phone` is UNIQUE, so without one
 * canonical form `0612345678` and `+33612345678` are the same phone occupying
 * two rows and the constraint never fires.
 *
 * Mobiles only. A landline cannot receive the SMS code that Étape 3b piece 4
 * sends, so accepting one only defers the failure to verification.
 *
 * Foreign mobiles are rejected for now. Recorded as an open item in the spec:
 * the chosen SMS provider's own reachability check is the real authority and no
 * provider is chosen yet.
 */
export const frPhoneSchema = z
  .string()
  .transform((raw) => raw.replace(SEPARATORS, ''))
  .refine((digits) => FR_MOBILE.test(digits), {
    message: 'Indiquez un numéro de mobile français (06 ou 07).',
  })
  .transform((digits) => (digits.startsWith('+33') ? digits : `+33${digits.slice(1)}`));

/** Any French number, mobile or fixed. 01 through 09, eight digits following. */
const FR_ANY = /^(?:0|\+33)[1-9]\d{8}$/;

/**
 * A French phone for a SHIPPING CONTACT, normalised to E.164.
 *
 * Deliberately NOT `frPhoneSchema`, and this is the load-bearing comment.
 * That schema is mobiles-only because Étape 3b piece 4 sends an SMS code to it,
 * and a landline cannot receive one. A shipping contact is a different job: a
 * réparateur's workshop may have only an `01` number, and reusing the mobile
 * validator would refuse his address and lock him out of every parcel order.
 *
 * **Do not widen `frPhoneSchema` to this.** The two encode different
 * requirements that happen to share a format, and merging them is how a landline
 * reaches the OTP sender and fails at the last step. A test pins that they
 * disagree.
 *
 * A mobile is still PREFERABLE here - carriers send delivery-exception notices by
 * SMS - but preferable is copy, not validation.
 */
export const frAnyPhoneSchema = z
  .string()
  .transform((raw) => raw.replace(SEPARATORS, ''))
  .refine((digits) => FR_ANY.test(digits), {
    message: 'Numéro de téléphone invalide.',
  })
  .transform((digits) => (digits.startsWith('+33') ? digits : `+33${digits.slice(1)}`));
