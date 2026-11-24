import type { Prisma } from '../generated/prisma/client.js';
import { LIVE_OFFER_WHERE } from '../offers/offer-predicates.js';

/**
 * CF4-25 (spec §4.2 « Account deletion scrub »). Closes the OPEN private requests a deleted
 * account was party to, inside `UsersService.deleteAccount`'s transaction:
 *   - requests HE sent → CANCELLED_BY_CLIENT;
 *   - requests addressed TO HIM → DECLINED, no note.
 *
 * Live quotes are withdrawn FIRST, so no statement leaves a live offer on a CANCELLED
 * request. No notification: nothing is emitted from inside that transaction, and the
 * request's status label tells the other party what happened.
 */
export async function closeQuoteRequestsOfDeletedUser(
  tx: Pick<Prisma.TransactionClient, 'offer' | 'demande'>,
  userId: string,
): Promise<void> {
  const sent: Prisma.DemandeWhereInput = {
    status: 'OPEN',
    authorUserId: userId,
    targetRepairerUserId: { not: null },
  };
  const received: Prisma.DemandeWhereInput = { status: 'OPEN', targetRepairerUserId: userId };

  await tx.offer.updateMany({ where: { ...LIVE_OFFER_WHERE, demande: sent }, data: { status: 'WITHDRAWN' } });
  await tx.offer.updateMany({ where: { ...LIVE_OFFER_WHERE, demande: received }, data: { status: 'WITHDRAWN' } });
  await tx.demande.updateMany({
    where: sent,
    data: { status: 'CANCELLED', quoteClosedReason: 'CANCELLED_BY_CLIENT', quoteExpiresAt: null },
  });
  await tx.demande.updateMany({
    where: received,
    data: { status: 'CANCELLED', quoteClosedReason: 'DECLINED', quoteDeclineNote: null, quoteExpiresAt: null },
  });
}
