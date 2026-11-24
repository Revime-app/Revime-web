import { z } from 'zod';

/**
 * Handles nobody may hold, checked AFTER canonicalisation.
 *
 * `@support` and `@aide` impersonate a channel this product does not have - see
 * `CF-D3` in `CLIENT_FEEDBACK_V1.md`, which is still an open question to the
 * client. `@me`, `@api`, `@null` and `@undefined` are reserved because a handle
 * is a path segment and a literal in someone's URL sooner or later.
 *
 * 🛑 This list is DUPLICATED verbatim in migration 22's SQL. A word added here
 * later does NOT retroactively fix a row that migration already wrote. The
 * control is post-condition 3 in the spec's §9.3, and it must be re-run against
 * this constant rather than against a list retyped into a query.
 */
export const RESERVED_USERNAMES = [
  'revime', 'admin', 'administrateur', 'support', 'aide', 'contact',
  'equipe', 'moderateur', 'moderation', 'officiel', 'api', 'me',
  'root', 'system', 'null', 'undefined', 'supprime',
] as const;

const RESERVED = new Set<string>(RESERVED_USERNAMES);

const SHAPE = /^[a-z0-9_]{3,20}$/;
const HAS_LETTER = /[a-z]/;
const EDGE_OR_DOUBLE_UNDERSCORE = /^_|_$|__/;

const SHAPE_MESSAGE = 'Entre 3 et 20 caractères : lettres, chiffres et _ uniquement.';

/**
 * The PUBLIC identifier, canonicalised to lowercase.
 *
 * Canonicalisation is not cosmetic, and it is the same argument
 * `frPhoneSchema` makes for E.164: `user.username` is UNIQUE, so without one
 * canonical form `Camille` and `camille` are the same handle occupying two rows
 * and the constraint never fires. Lowercasing here rather than indexing
 * `lower(username)` is what lets a plain `@unique` be sufficient - and a
 * functional index is not expressible in the Prisma schema anyway.
 *
 * Every message is French and authored. `.trim()` and `.toLowerCase()` run
 * BEFORE validation so a user is never refused for typing a capital.
 */
export const usernameSchema = z
  .string({ message: SHAPE_MESSAGE })
  .transform((raw) => raw.trim().toLowerCase())
  .refine((v) => SHAPE.test(v), { message: SHAPE_MESSAGE })
  .refine((v) => HAS_LETTER.test(v), { message: 'Ajoutez au moins une lettre.' })
  .refine((v) => !EDGE_OR_DOUBLE_UNDERSCORE.test(v), {
    message: 'Le _ ne peut pas commencer, terminer ni être doublé.',
  })
  .refine((v) => !v.startsWith('supprime_') && !RESERVED.has(v), { message: 'Ce nom d\'utilisateur est réservé.' });

/**
 * Mint a handle from an email address.
 *
 * Called from TWO places that must not disagree: `normalise-username.ts`, when a
 * social signup supplies no handle, and migration 22's backfill - which
 * re-implements this in SQL because doing it in TS would need two migrations
 * with a script between them for 18 rows. The spec's §5.3 records that
 * duplication and its control.
 *
 * `isTaken` is injected rather than the function reaching for Prisma, so the
 * whole algorithm is a pure function and its collision behaviour is unit
 * testable without a database.
 *
 * Order is load-bearing: the letter guarantee runs BEFORE truncation, or an
 * all-digit local part longer than 20 survives it with no letter.
 */
export function deriveUsername(email: string, isTaken: (candidate: string) => boolean): string {
  const local = email.split('@')[0] ?? '';
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!HAS_LETTER.test(base)) base = `user${base}`;

  // Truncate, then re-trim: the cut can leave a trailing underscore, which the
  // validator refuses.
  base = base.slice(0, 20).replace(/_+$/, '');
  if (base.length < 3) base = base.padEnd(3, '0');

  // Re-check the letter guarantee after truncation: the only letters could sit past
  // position 20 (e.g. 21 digits then 'abc'), which truncation would remove.
  if (!HAS_LETTER.test(base)) base = `user${base.slice(0, 16)}`;

  // CF5-23: Strip 'supprime_' prefix if local part begins with it to avoid infinite loop
  if (base.startsWith('supprime_')) {
    base = `user_${base.slice(9)}`.slice(0, 20).replace(/_+$/, '');
    if (!HAS_LETTER.test(base)) base = `user${base.slice(0, 16)}`;
  }

  let candidate = base;
  let n = 2;
  while (RESERVED.has(candidate) || candidate.startsWith('supprime_') || isTaken(candidate)) {
    const suffix = String(n);
    candidate = base.slice(0, 20 - suffix.length).replace(/_+$/, '') + suffix;
    n += 1;
  }
  return candidate;
}
