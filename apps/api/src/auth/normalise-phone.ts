import { APIError } from 'better-auth/api';
import { frPhoneSchema } from '@revime/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { demoteBasicOnContactChange } from '../verification/promote-basic.js';

/**
 * Normalises `phone` to E.164 and refuses a number another account already
 * holds. Shared by both Better Auth user hooks, because both reach the column.
 *
 * Spec §5.1: without server-side canonicalisation `0612345678` and
 * `+33612345678` are one phone and two rows, so the UNIQUE index is defeated on
 * day one. Spec §5.2: a duplicate must carry a deterministic code, because
 * `authErrorMessageFr` resolves codes and never messages, and an unmapped
 * Prisma P2002 surfaces as a 500.
 *
 * The update path needs this as much as create does. `POST /update-user` takes
 * a `z.record(z.string(), z.any())` body and `parseUserInput` passes an
 * `additionalField` straight through when it declares no validator, so `phone`
 * was writable raw by any authenticated session.
 *
 * The two callers differ only in what "this write carries no phone" means,
 * which is what `mode` selects:
 *
 * - `create` receives the whole row, so a blank phone is force-dropped to
 *   `undefined`. Leaving `''` in a UNIQUE column makes the second phone-less
 *   signup a P2002.
 * - `update` receives ONLY the changed fields, so an absent phone means the
 *   request said nothing about the phone and the data is returned untouched.
 *   Adding `phone: undefined` there would express "clear it" on a request that
 *   never mentioned it, and this hook also fires for email verification, role
 *   changes and bans, which must not carry a phone write at all.
 *
 * `currentUserId` excludes the caller from the duplicate check so that
 * re-saving a number you already hold is not a conflict with yourself. It is
 * optional, and omitting it excludes nobody, which fails closed.
 */
export async function normalisePhoneForWrite<T extends Record<string, unknown>>(
  prisma: PrismaClient,
  data: T,
  options: { mode: 'create' | 'update'; currentUserId?: string | undefined },
): Promise<{ data: T }> {
  const raw = data.phone;

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    // Return the incoming data untouched on update. See the note above: the
    // payload must contain exactly the fields the request contained.
    if (options.mode === 'update') return { data };
    return { data: { ...data, phone: undefined } };
  }

  const parsed = frPhoneSchema.safeParse(raw);
  if (!parsed.success) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_PHONE',
      message: 'Indiquez un numéro de mobile français (06 ou 07).',
    });
  }

  const taken = await prisma.user.findFirst({
    where: {
      phone: parsed.data,
      ...(options.currentUserId ? { id: { not: options.currentUserId } } : {}),
    },
    select: { id: true },
  });
  if (taken) {
    throw new APIError('UNPROCESSABLE_ENTITY', {
      code: 'PHONE_ALREADY_EXISTS',
      message: 'Ce numéro de téléphone est déjà utilisé.',
    });
  }

  // A verified flag must not outlive the number it described. Nothing wrote
  // phoneVerifiedAt before Étape 3b piece 4, so this was inert; the moment the
  // flag is real, changing your number without clearing it means the account
  // claims a verified phone that nobody verified.
  //
  // Only on a GENUINE change. Re-saving the number you already hold is not a
  // reason to make you verify it again. And only when the request actually
  // carried a phone, which the early return above already guarantees - this hook
  // also fires for email verification, role changes and bans, none of which
  // should touch the flag.
  //
  // phoneVerifiedAt is `input: false` in auth.ts, which blocks it from a request
  // BODY. Writing it from inside a before-hook is server-side, and is the
  // intended escape hatch rather than a way around the guard.
  if (options.mode === 'update' && options.currentUserId) {
    const current = await prisma.user.findUnique({
      where: { id: options.currentUserId },
      select: { phone: true },
    });
    if (current && current.phone !== parsed.data) {
      await demoteBasicOnContactChange(prisma, options.currentUserId, 'phone');
      return { data: { ...data, phone: parsed.data, phoneVerifiedAt: null } };
    }
  }

  return { data: { ...data, phone: parsed.data } };
}
