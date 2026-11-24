import { APIError } from 'better-auth/api';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The store-review accounts (REVIME_APP_PUBLICATION_PREPARATION.md PUB-33, DECP-23).
 *
 * Apple's and Google's reviewers sign in to the LIVE app, so these two accounts live in the live
 * database. The e-mail domain is their ONLY marker: no column, no migration. Everything that keeps them
 * apart from real people keys off it:
 * - sealed both ways: a review account sees and reaches only review accounts, and a real one never sees
 *   or reaches a review account (`sideUserWhere`, `assertSameSide`);
 * - never e-mailed (`mail.service.ts`) and never pushed (`push.service.ts`);
 * - out of every operator figure (`GENUINE_USER_WHERE`) and labelled « review » in the dashboard;
 * - the marker cannot be moved: the server refuses an e-mail change for them (`refuseReviewEmailChange`).
 *
 * Case-insensitive throughout, like the demo suffix, because a domain is not case-sensitive.
 */
export const REVIEW_EMAIL_SUFFIX = '@review.revime.fr';

export function isReviewEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(REVIEW_EMAIL_SUFFIX);
}

/** The users a viewer on this side of the seal may see: review accounts for a review viewer, the rest otherwise. */
export function sideUserWhere(viewerIsReview: boolean): Prisma.UserWhereInput {
  return viewerIsReview
    ? { email: { endsWith: REVIEW_EMAIL_SUFFIX, mode: 'insensitive' } }
    : { email: { not: { endsWith: REVIEW_EMAIL_SUFFIX }, mode: 'insensitive' } };
}

/** Which side of the seal a user is on. An unknown id counts as real, so it never widens a review viewer's view. */
export async function isReviewUser(prisma: PrismaService, userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return isReviewEmail(row?.email);
}

/** The same seal, as a filter on a relation to the viewer's counterpart (`author`, `repairer`, `user`…). */
export async function viewerSideWhere(prisma: PrismaService, viewerUserId: string): Promise<Prisma.UserWhereInput> {
  return sideUserWhere(await isReviewUser(prisma, viewerUserId));
}

/**
 * For every write that links two accounts (an offer, a conversation, a message, a quote request, a
 * block, a favourite): both must be on the same side. Across the seal the other account simply does not
 * exist for you, so the answer is the same « not found » an unknown id gets.
 */
export async function assertSameSide(prisma: PrismaService, aUserId: string, bUserId: string): Promise<void> {
  const rows = await prisma.user.findMany({ where: { id: { in: [aUserId, bUserId] } }, select: { id: true, email: true } });
  const a = isReviewEmail(rows.find((r) => r.id === aUserId)?.email);
  const b = isReviewEmail(rows.find((r) => r.id === bUserId)?.email);
  if (a !== b) throw new AppException('NOT_FOUND', 'Ressource introuvable.');
}

/** The marker is the e-mail, so a review account must not be able to change it and walk out of the seal. */
export function refuseReviewEmailChange(currentEmail: string | null | undefined): void {
  if (isReviewEmail(currentEmail)) {
    throw new APIError('FORBIDDEN', { message: "L'adresse e-mail de ce compte ne peut pas être modifiée." });
  }
}
