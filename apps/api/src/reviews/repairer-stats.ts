import { NO_REPAIRER_STATS, type RepairerStats } from '@revime/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NOT_DEMO_REVIEW_WHERE } from './demo-review.js';

/**
 * The rating aggregate, DERIVED on every read -- design §4.4 and §4.4a.
 *
 * A plain exported function rather than an `@Injectable` provider, matching
 * `geo/haversine.ts`. It holds no state and needs no configuration, and a provider
 * would have to be exported from a module and imported by every consumer -- which is
 * precisely the wiring that made the app fail to BOOT in P3 while typecheck passed,
 * because a DI failure is invisible to tsc. One import, no module graph, no boot risk.
 *
 * TWO groupBy calls rather than one join. `Review` and `Commande` are different tables
 * with different filters, and one query each keeps both filters readable and
 * independently testable -- which matters, because each has its own trap.
 *
 * `repairCount` filters `status: 'PAID'` AND `step: 'RELEASED'`, the IDENTICAL pair
 * `ReviewsService.create` requires of a review. That is what makes
 * `reviewCount <= repairCount` true WHILE THE COMMANDE STAYS PAID: every reviewable commande is a
 * counted one.
 *
 * 🛑 **It is NOT an invariant across a refund, and the earlier wording here said it was.**
 * `refund.service.ts` refuses only on `status !== 'PAID'`, so an operator can refund an
 * already-RELEASED commande: this count drops to 0 while the review row survives, and
 * Comparaison would render « Nb de réparations: 0 » beside a five-star Note. Found by the
 * whole-branch review. Deliberately NOT patched here, because both repairs are product
 * decisions the owner has not been asked: soft-delete the review when its repair is
 * refunded, or count refunded commandes that carry one.
 *
 * Counting any RELEASED step would count a REFUNDED job as a completed
 * repair -- on exactly the rows the review route refuses -- so the two numbers would
 * disagree precisely where the disagreement is worst.
 *
 * The reviews also carry `NOT_DEMO_REVIEW_WHERE` (PRE-2): the number a client reads beside a
 * réparateur must be cut by the same predicate as the list under it, or a demo review that the list
 * hides would still move the stars.
 *
 * `deletedAt: null` on the reviews is what makes an operator's soft-delete change the
 * number. It is REACHABLE: `PATCH /admin/reviews/:id/hide` (CF4-L, motif required,
 * reversible by `/restore`) writes that column, and the integration test drives that route
 * rather than seeding the row, because a branch nothing has
 * ever executed is a comment and not a protection.
 *
 * The returned map holds an entry ONLY for a user with at least one review or one PAID
 * commande at the RELEASED step - the pair, not merely the step, which is the
 * load-bearing distinction and has its own test. **Absent means `NO_REPAIRER_STATS`, and every caller must say so.**
 *
 * The cost is one extra pair of queries per offer list, which at zero commandes is not a
 * measurement worth pretending to have made. §4.4 records the swap point if volume ever
 * demands a stored column.
 */
export async function repairerStats(
  prisma: PrismaService,
  userIds: string[],
): Promise<Map<string, RepairerStats>> {
  const out = new Map<string, RepairerStats>();
  // `in: []` is a round trip whose answer is already known, and `create()` calls this
  // with a single id on a path where one wasted query is still one too many.
  if (userIds.length === 0) return out;

  const [reviews, repairs] = await Promise.all([
    prisma.review.groupBy({
      by: ['repairerUserId'],
      where: { repairerUserId: { in: userIds }, deletedAt: null, ...NOT_DEMO_REVIEW_WHERE },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.commande.groupBy({
      by: ['repairerUserId'],
      where: { repairerUserId: { in: userIds }, status: 'PAID', step: 'RELEASED' },
      _count: { _all: true },
    }),
  ]);

  const merge = (id: string, patch: Partial<RepairerStats>): void => {
    out.set(id, { ...(out.get(id) ?? NO_REPAIRER_STATS), ...patch });
  };

  for (const row of reviews) {
    merge(row.repairerUserId, {
      // One decimal, matching how `listForDemande` already rounds `distanceKm` two lines
      // from where this is read. `_avg` returns 4.333333…, and the French comma belongs
      // to the formatter, never to the value.
      //
      // `== null` rather than `=== null`: Prisma types `_avg.rating` as `number | null`,
      // and a group that exists always has an average, but the loose check costs nothing
      // and covers undefined too.
      rating: row._avg.rating == null ? null : Math.round(row._avg.rating * 10) / 10,
      reviewCount: row._count._all,
    });
  }
  for (const row of repairs) {
    merge(row.repairerUserId, { repairCount: row._count._all });
  }

  return out;
}
