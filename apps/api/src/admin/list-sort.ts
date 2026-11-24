import type {
  AdminDisputeListQuery,
  AdminPaymentListQuery,
  AdminRefundListItem,
  AdminRefundListQuery,
} from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Direction = 'asc' | 'desc';

/** Newest first, and the id breaks ties so a page boundary never repeats or skips a row. */
const DEFAULT_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
const TIEBREAK = { id: 'desc' as const };

/** Prisma `orderBy` for `GET admin/payments`: the whole filtered set is ordered before it is paginated. */
export function paymentOrderBy(sort: AdminPaymentListQuery['sort'], dir: Direction = 'desc'): Prisma.CommandeOrderByWithRelationInput[] {
  switch (sort) {
    case 'clientName':
      return [{ client: { name: dir } }, TIEBREAK];
    case 'repairerName':
      return [{ repairer: { name: dir } }, TIEBREAK];
    case 'createdAt':
    case 'totalCents':
    case 'delivery':
    case 'step':
    case 'status':
      return [{ [sort]: dir }, TIEBREAK];
    case undefined:
      return DEFAULT_ORDER;
  }
}

/** Prisma `orderBy` for `GET admin/disputes`. */
export function disputeOrderBy(sort: AdminDisputeListQuery['sort'], dir: Direction = 'desc'): Prisma.DisputeOrderByWithRelationInput[] {
  switch (sort) {
    case 'disputeNumber':
      return [{ number: dir }, TIEBREAK];
    case 'totalCents':
      return [{ commande: { totalCents: dir } }, TIEBREAK];
    case 'clientName':
      return [{ commande: { client: { name: dir } } }, TIEBREAK];
    case 'repairerName':
      return [{ commande: { repairer: { name: dir } } }, TIEBREAK];
    case 'createdAt':
    case 'initiator':
      return [{ [sort]: dir }, TIEBREAK];
    case undefined:
      return DEFAULT_ORDER;
  }
}

function compareRefundColumn(a: AdminRefundListItem, b: AdminRefundListItem, sort: NonNullable<AdminRefundListQuery['sort']>) {
  switch (sort) {
    case 'refundedCents':
      return (a.refundedCents ?? 0) - (b.refundedCents ?? 0);
    case 'date':
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    case 'orderNumber':
    case 'clientName':
    case 'repairerName':
    case 'status':
      return a[sort].localeCompare(b[sort], 'fr', { sensitivity: 'base', numeric: true });
    case 'motif':
      return (a.motif ?? '').localeCompare(b.motif ?? '', 'fr');
  }
}

/**
 * Refund rows are filtered by a status derived in memory, so they are ordered in memory too, before the
 * page is cut. A row without an amount stays last in either direction.
 */
export function sortRefundItems(
  items: AdminRefundListItem[],
  sort: AdminRefundListQuery['sort'],
  dir: Direction = 'desc',
): AdminRefundListItem[] {
  const column = sort ?? 'date';
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (column === 'refundedCents' && (a.refundedCents === null) !== (b.refundedCents === null)) {
      return a.refundedCents === null ? 1 : -1;
    }
    return sign * compareRefundColumn(a, b, column) || (a.commandeId < b.commandeId ? 1 : -1);
  });
}
