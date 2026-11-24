import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * V7 A11 (U2 / U2b). The two one-time links the security e-mails carry, both stored in Better Auth's
 * `verification` table so one writer serves the auth hooks (`internalAdapter`) and Nest (Prisma):
 * - a reset link exactly like `/request-password-reset` mails (`reset-password:<token>`, 1 h);
 * - « Ce n'est pas moi » (`not-me:<token>`, 7 days, single use, consumed by security.service.ts).
 */
export type VerificationWriter = (row: { identifier: string; value: string; expiresAt: Date }) => Promise<unknown>;

export const NOT_ME_PREFIX = 'not-me:';
export const NOT_ME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Where the app's reset screen picks up the token, as `forgot-password.tsx` asks. */
export const RESET_CALLBACK_URL = 'revime://reset-password';

const token = () => randomBytes(24).toString('base64url');

/** `authBaseURL` is Better Auth's own base, `https://<host>/api/auth`. */
export async function createResetUrl(
  write: VerificationWriter,
  authBaseURL: string,
  userId: string,
  lifetimeSeconds = 3600,
): Promise<string> {
  const t = token();
  await write({ identifier: `reset-password:${t}`, value: userId, expiresAt: new Date(Date.now() + lifetimeSeconds * 1000) });
  return `${authBaseURL}/reset-password/${t}?callbackURL=${encodeURIComponent(RESET_CALLBACK_URL)}`;
}

/** `apiOrigin` is `https://<host>`; the page is Nest's, under the global `api/v1` prefix. */
export async function createNotMeUrl(write: VerificationWriter, apiOrigin: string, userId: string): Promise<string> {
  const t = token();
  await write({ identifier: `${NOT_ME_PREFIX}${t}`, value: userId, expiresAt: new Date(Date.now() + NOT_ME_TTL_MS) });
  return `${apiOrigin}/api/v1/security/not-me?token=${t}`;
}

export function prismaVerificationWriter(prisma: Pick<PrismaClient, 'verification'>): VerificationWriter {
  return (row) => prisma.verification.create({ data: { id: randomUUID(), ...row } });
}
