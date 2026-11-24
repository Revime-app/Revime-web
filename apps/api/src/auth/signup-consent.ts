import { APIError } from 'better-auth/api';
import { CANONICAL_PRIVACY_ACCEPTANCE_TEXT, type SignupMethod } from '@revime/shared';
import { ConsentProofsService } from '../compliance/consent-proofs.service.js';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`, `DEC9-05`). What sign-up records, kept out of `auth.ts`
 * so it is testable without the database its hooks reach.
 */

export type ConsentFields = {
  cguAccepted: boolean;
  privacyAccepted: boolean;
  cguAcceptedAt?: Date;
  cguVersion?: string;
  privacyAcceptedAt?: Date;
  privacyVersion?: string;
};

/**
 * The `user.create.before` half. An unticked box (`false`) is refused; an ABSENT privacy field is
 * accepted, because builds installed before V9 send only `cguAccepted` (Review Focus 3). A social
 * sign-up sends neither and records nothing: its terms screen does it later.
 */
export async function signupConsentFields(
  raw: Record<string, unknown>,
  now: Date,
  versions: { cgu: () => Promise<string>; privacy: () => Promise<string> },
): Promise<ConsentFields> {
  if (raw.cguAccepted === false) {
    throw new APIError('BAD_REQUEST', {
      code: 'CGU_REQUIRED',
      message: "Vous devez accepter les Conditions Générales d'Utilisation pour créer un compte.",
    });
  }
  if (raw.privacyAccepted === false) {
    throw new APIError('BAD_REQUEST', {
      code: 'PRIVACY_REQUIRED',
      message: 'Vous devez accepter la Politique de confidentialité pour créer un compte.',
    });
  }
  const fields: ConsentFields = { cguAccepted: raw.cguAccepted === true, privacyAccepted: raw.privacyAccepted === true };
  if (raw.cguAccepted === true) {
    fields.cguAcceptedAt = now;
    fields.cguVersion = await versions.cgu();
  }
  if (raw.privacyAccepted === true) {
    fields.privacyAcceptedAt = now;
    fields.privacyVersion = await versions.privacy();
  }
  return fields;
}

type HeaderBag = { get?: (name: string) => unknown } & Record<string, unknown>;

function requestHeaders(context: unknown): HeaderBag | null {
  const c = context as {
    headers?: HeaderBag;
    request?: { headers?: HeaderBag };
    context?: { request?: { headers?: HeaderBag } };
  } | null | undefined;
  return c?.headers ?? c?.request?.headers ?? c?.context?.request?.headers ?? null;
}

function headerValue(headers: HeaderBag | null, name: string): string | null {
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get(name) : headers[name];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : null;
}

/**
 * The `user.create.after` half for the privacy box, beside `recordUserCguConsentProof`: an
 * immutable `PRIVACY_ACCEPTANCE` proof, the IP from `cf-connecting-ip` only (`auth.ts` says why).
 */
export async function recordUserPrivacyConsentProof(
  prismaClient: ConstructorParameters<typeof ConsentProofsService>[0],
  user: { id: string; email: string; privacyAcceptedAt?: Date | null; privacyVersion?: string | null },
  context?: unknown,
): Promise<void> {
  if (!user.privacyVersion) return;
  const headers = requestHeaders(context);
  await new ConsentProofsService(prismaClient).recordProof({
    userId: user.id,
    kind: 'PRIVACY_ACCEPTANCE',
    privacyVersion: user.privacyVersion,
    legalTextSnapshot: CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
    actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
    ipAddress: headerValue(headers, 'cf-connecting-ip'),
    userAgent: headerValue(headers, 'user-agent'),
    metadata: { email: user.email, signupMethod: 'EMAIL' },
    timestamp: user.privacyAcceptedAt ?? new Date(),
  });
}

export function signupMethodForProvider(providerId: string): SignupMethod | null {
  if (providerId === 'credential') return 'EMAIL';
  if (providerId === 'apple') return 'APPLE';
  if (providerId === 'google') return 'GOOGLE';
  return null;
}

/**
 * The `account.create.after` half: the first login row decides the method, once. The `signupMethod:
 * null` guard means a provider linked later (account linking is on) never overwrites it (Review
 * Focus 5). A password login means the handle was chosen on the form, so it is confirmed now.
 */
export async function applySignupMethod(
  prisma: { user: { updateMany(args: unknown): Promise<unknown> } },
  account: { userId: string; providerId: string },
  now: Date,
): Promise<void> {
  const method = signupMethodForProvider(account.providerId);
  if (!method) return;
  await prisma.user.updateMany({
    where: { id: account.userId, signupMethod: null },
    data: method === 'EMAIL' ? { signupMethod: method, usernameConfirmedAt: now } : { signupMethod: method },
  });
}
