import { APIError } from 'better-auth/api';
import { deriveUsername, usernameSchema } from '@revime/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Validates `username`, or MINTS one when the write carries none.
 *
 * Deliberately shaped like `normalise-phone.ts`, which solves the same problem
 * for the same reason, and its header is worth reading first. The short version:
 * `POST /update-user` takes a `z.record(z.string(), z.any())` body and
 * `parseUserInput` passes an additionalField straight through when it declares
 * no validator, so registering `username` in `additionalFields` makes it
 * writable RAW by any authenticated session. That is how `phone` was writable
 * raw until its hook existed. Guarding create alone would leave the same hole.
 *
 * The two modes differ in what "this write carries no username" means:
 *
 * - `create` receives the whole row. An absent handle means a SOCIAL signup -
 *   `social-providers.ts` supplies none - so one is derived. This is the half
 *   that makes the NOT NULL column survivable; without it every Google and Apple
 *   signup fails at the constraint.
 * - `update` receives ONLY the changed fields, so an absent handle means the
 *   request said nothing about it and the data is returned untouched. This hook
 *   also fires for email verification, role changes and bans, none of which
 *   should touch the column.
 *
 * `currentUserId` excludes the caller from the duplicate check, so re-saving the
 * handle you already hold is not a conflict with yourself. It is optional, and
 * omitting it excludes nobody, which fails closed.
 */
export async function normaliseUsernameForWrite<T extends Record<string, unknown>>(
  prisma: PrismaClient,
  data: T,
  options: { mode: 'create' | 'update'; currentUserId?: string | undefined },
): Promise<{ data: T }> {
  const raw = data.username;

  // Absence, not blankness. On update an absent key means the request said nothing
  // about the handle; a PRESENT blank one is a raw value the schema must refuse.
  if (options.mode === 'update' && raw === undefined) return { data };

  // Present-but-blank string: refuse on both create and update. updateWithHooks
  // MERGES, so we must THROW - returning data with username deleted would leave
  // username: '' in the write.
  if (typeof raw === 'string' && raw.trim().length === 0) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_USERNAME',
      message: "Entre 3 et 20 caractères : lettres, chiffres et _ uniquement.",
    });
  }

  // Truly absent on create: mint a handle for social signup. Non-string values
  // fall through to safeParse and are refused, same as update mode.
  if (options.mode === 'create' && raw === undefined) {
    // Social signup. Derive from the email, which Better Auth always supplies on
    // create. `isTaken` hits the database per candidate rather than pre-loading
    // every handle: collisions are rare and the loop is bounded at 50 attempts.
    const email = typeof data.email === 'string' ? data.email : '';
    const tried = new Set<string>();
    let minted: string | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = deriveUsername(email, (c) => tried.has(c));
      tried.add(candidate);
      const clash = await prisma.user.findFirst({
        where: { username: candidate },
        select: { id: true },
      });
      if (!clash) {
        minted = candidate;
        break;
      }
    }
    if (!minted) {
      // 50 collisions on one derivation is not a user error and must not read as
      // one. FAILED_TO_CREATE_USER is already mapped to the generic French
      // sentence, which is the honest thing to show.
      throw new APIError('INTERNAL_SERVER_ERROR', {
        code: 'FAILED_TO_CREATE_USER',
        message: 'Une erreur est survenue. Veuillez réessayer.',
      });
    }
    return { data: { ...data, username: minted } };
  }

  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    // All schema failures collapse to INVALID_USERNAME. The specific messages
    // (reserved word, needs letter, underscore rules) surface client-side via
    // signUpSchema.safeParse (task 7) and via ZodValidationPipe on PATCH
    // /users/me/username (task 5). This hook is the backstop for a client that
    // skipped validation, so the collapsed code is deliberate.
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_USERNAME',
      message: parsed.error.issues[0]?.message ?? "Nom d'utilisateur invalide.",
    });
  }

  const taken = await prisma.user.findFirst({
    where: {
      username: parsed.data,
      ...(options.currentUserId ? { id: { not: options.currentUserId } } : {}),
    },
    select: { id: true },
  });
  if (taken) {
    throw new APIError('UNPROCESSABLE_ENTITY', {
      code: 'USERNAME_ALREADY_EXISTS',
      message: "Ce nom d'utilisateur est déjà pris.",
    });
  }

  return { data: { ...data, username: parsed.data } };
}
