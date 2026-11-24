import { isActiveCommande, type CommandeListItem } from './commande.schemas.js';
import { ratingLabel } from './compare-criteria.js';
import type { offerStatusSchema } from './offer.schemas.js';
import { z } from 'zod';

/**
 * The réparateur dashboard's revenue figures, derived from the commande list he already
 * fetches - `repareme-web/src/screens/TableauDeBord.tsx`.
 *
 * It lives here rather than in the screen for the reason this package exists: `apps/mobile`
 * has no test harness, so arithmetic written there is checked by nothing. `tsc` is blind to
 * a refund counted as revenue and to a December-to-January boundary alike.
 *
 * DERIVED, never stored, which is the same ruling `RepairerStats` records for the rating
 * aggregate: a stored monthly total can visibly contradict the commande list rendered from
 * the same fetch, and a denormalised counter is this codebase's recurring bug class.
 *
 * 🛑 **Every figure is 0 for every account in production today.** A commande requires
 * `PAYMENTS_ENABLED`, which is absent on Render, so `GET /commandes` returns `[]`. That is
 * the state the screen must read well in, not an edge case.
 */
export type RepairerActivity = {
  /** Payouts on repairs released in the current calendar month. */
  revenueThisMonthCents: number;
  /** The same figure for the previous calendar month, so a delta can be computed. */
  revenueLastMonthCents: number;
  /**
   * What he is owed but has not been paid: payouts on commandes still in flight, and (V8
   * `ISS8-007`) on validated commandes whose payout Revime is holding until his setup is done.
   *
   * A BALANCE, not a monthly figure, so it is deliberately not filtered by month. A
   * repair paid for in June and still unreleased in August is money he is still owed in
   * August, and dropping it from the August screen would understate what he is due.
   */
  pendingCents: number;
  /** Commandes that are still live work. Matches Accueil's « réparations en cours ». */
  activeCount: number;
  /** Repairs carried to release, for the whole account life, as the prototype's « terminées ». */
  releasedCount: number;
  /**
   * « Versés » (D1): the all-time sum transferred to his Stripe account, from our own
   * data - `payoutCents` over every released row, with no month filter. A REFUNDED row
   * is never counted here, even if it had reached RELEASED before the refund: `isReleased`
   * checks `status === 'PAID'`, so a refund removes a row from this sum the same way it
   * removes it from the two revenue-by-month figures.
   */
  paidOutCents: number;
};

/**
 * `hasStripeTransfer` (V8 `ISS8-007`): `false` on a released order whose payout Revime is HOLDING.
 * Optional in `CommandeListItem`, so an older API's rows (no field) read as paid, as before.
 */
type ActivityRow = Pick<CommandeListItem, 'status' | 'step' | 'payoutCents' | 'releasedAt' | 'hasStripeTransfer'>;

/**
 * A month index that is monotonic across years, so « last month » is `- 1` even in
 * January.
 *
 * `isSameMonth` cannot answer this: comparing `getMonth()` alone makes December 2026 and
 * December 2025 the same month, and subtracting one from January's `0` gives `-1`, which
 * matches nothing. `relative-time.ts` already records that exact year-rollover trap.
 *
 * Null for `null`, `undefined`, or a date that cannot be read: `releasedAt` is null until a
 * transfer succeeds, and an older API build predating this field sends `undefined` rather
 * than omitting the key entirely - see `ActivityRow`'s `releasedAt` below. Any of these three
 * must land in NEITHER month rather than being counted in the current one by accident.
 *
 * 🛑 **Buckets by the DEVICE'S LOCAL calendar, because `getMonth()` is local.** That is
 * the right answer for the person reading the screen - a commande released at 01:00 on 1
 * August in Paris belongs to his August, not to July as its UTC timestamp would say - and
 * it is correct here specifically because this runs on his phone. It also means a UTC ISO
 * literal within an hour or two of a month boundary lands in different buckets on
 * different machines, so the tests build their dates from local parts.
 */
function monthIndex(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * A finished repair. `isActiveCommande` is its exact complement within `status === 'PAID'`,
 * so the two together partition the paid rows and nothing is counted twice.
 *
 * 🛑 The `status` half is load-bearing, not defensive. `REFUNDED` rows keep whatever step
 * they had reached, so a refunded commande that had been released still reads
 * `step === 'RELEASED'`. Matching on the step alone would report money he had to give back
 * as revenue he earned.
 */
function isReleased(c: ActivityRow): boolean {
  return c.status === 'PAID' && c.step === 'RELEASED';
}

/**
 * Revenue is bucketed by `releasedAt` - when the transfer to the réparateur succeeded -
 * NOT by `createdAt`, when the commande was opened (D2). A repair opened in August and
 * released in September counts towards September: the money moved in September, and
 * that is the month the figure means to describe. A released row whose `releasedAt` is
 * null or unparseable - an older API build, or a row `monthIndex` cannot read - lands in
 * NEITHER month, but still counts in `paidOutCents` and `releasedCount`: the money moved
 * and the repair is finished, even though which month it moved in cannot be shown.
 */
export function repairerActivity(
  commandes: readonly ActivityRow[],
  now: Date,
): RepairerActivity {
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  const lastMonth = thisMonth - 1;

  const activity: RepairerActivity = {
    revenueThisMonthCents: 0,
    revenueLastMonthCents: 0,
    pendingCents: 0,
    activeCount: 0,
    releasedCount: 0,
    paidOutCents: 0,
  };

  for (const c of commandes) {
    if (isReleased(c)) {
      activity.releasedCount += 1;
      // V8 `ISS8-007`. A payout Revime is HOLDING (the client validated; the réparateur has not
      // finished « Virements » or his fiscal information) is a finished repair, but the money is
      // not his yet: it is what he is owed, « En attente », and never « Versés » or the month's
      // revenue. It moves to both when `payoutStrandedCommandes` pays it and the row reports a
      // transfer. `=== false` only, so an older API (no field) counts as before.
      if (c.hasStripeTransfer === false) {
        activity.pendingCents += c.payoutCents;
        continue;
      }
      activity.paidOutCents += c.payoutCents;
      const m = monthIndex(c.releasedAt);
      if (m === thisMonth) activity.revenueThisMonthCents += c.payoutCents;
      else if (m === lastMonth) activity.revenueLastMonthCents += c.payoutCents;
      continue;
    }

    if (isActiveCommande(c)) {
      activity.activeCount += 1;
      activity.pendingCents += c.payoutCents;
    }
  }

  return activity;
}

/**
 * The prototype's « +18 % vs mois dernier », as a whole percent.
 *
 * 🛑 **Null over a zero base, and the screen must drop the clause rather than print a
 * zero.** Growth from nothing is not a percentage: `0 → 0` is `0/0` and `0 → 125 €` is
 * infinite. Both are the ordinary case here, because no account has ever had revenue.
 * Rendering « +0 % vs mois dernier » under a first month's earnings would be a false
 * comparison rather than a missing one.
 */
export function revenueDeltaPercent(
  thisMonthCents: number,
  lastMonthCents: number,
): number | null {
  if (lastMonthCents <= 0) return null;
  return Math.round(((thisMonthCents - lastMonthCents) / lastMonthCents) * 100);
}

/**
 * The line under the revenue figure, which SWITCHES ON DATA rather than being fixed.
 *
 * It lives beside the arithmetic and is tested with it, for the reason `notificationCopy`
 * gives: French that interpolates a count or branches on a condition is wrong in ways no
 * typecheck sees, and `apps/mobile` has no test harness to catch it there. Two defects of
 * exactly this shape shipped to review on 2026-08-20.
 *
 * Returns `null` when there is nothing true to say - the screen then renders no line at
 * all. « En attente » no longer appears here: since CF4-11 it has its own figure in the
 * dashboard's hero row (`pendingCents`), so this function no longer speaks for it, and the
 * old « Aucun paiement en attente » filler line is gone with it.
 *
 * No apostrophe anywhere in this copy, deliberately, so there is no straight-versus-curly
 * decision for a later editor to get wrong.
 */
export function revenueSubline(a: RepairerActivity): string | null {
  if (a.releasedCount === 0 && a.pendingCents === 0) {
    return 'Vos revenus apparaîtront ici après votre première réparation payée.';
  }

  const delta = revenueDeltaPercent(a.revenueThisMonthCents, a.revenueLastMonthCents);
  if (delta === null) return null;
  return `${delta >= 0 ? '+' : ''}${delta} % vs mois dernier`;
}

/** One cell of the dashboard's 2x2 grid - the prototype's `.dash-cell`. */
export type ActivityCell = { value: string; label: string };

/**
 * The four cells, with their French agreeing with their own numbers.
 *
 * 🛑 **Two of the prototype's four cells are NOT here, and their absence is established
 * rather than an omission.** « temps de réponse » would need demande-to-offer latency, which
 * nothing in this product records; « missions / semaine » is an average over a history that
 * does not exist. Both assert a fact about the réparateur, which is the tell
 * `apps/mobile/AGENTS.md` records for prototype copy built on `prodata.ts`. « avis reçus »
 * and « en cours » replace them because both are real numbers already on this screen's
 * fetches.
 *
 * `rating` renders « - » and never « 0 », while a count of 0 renders « 0 »: an unrated
 * réparateur is an ABSENCE and zero repairs is a FACT. That distinction is
 * `RepairerProfileDto`'s own and must not be flattened here.
 */
export function activityCells(
  a: RepairerActivity,
  rating: number | null,
  reviewCount: number,
): ActivityCell[] {
  return [
    { value: String(a.activeCount), label: 'en cours' },
    { value: rating === null ? '-' : ratingLabel(rating), label: 'note moyenne' },
    { value: String(reviewCount), label: reviewCount === 1 ? 'avis reçu' : 'avis reçus' },
    {
      value: String(a.releasedCount),
      label: a.releasedCount === 1 ? 'terminée' : 'terminées',
    },
  ];
}

/**
 * The one place `offerStatusSchema`'s inferred type is reused rather than re-declared -
 * type-only, so it costs nothing at runtime. `packages/shared/src/offer.schemas.ts` exports
 * no standalone alias for it today, so this is the fallback the CF4-b design spec names.
 */
type OfferStatus = z.infer<typeof offerStatusSchema>;

/** CF4-10's two Profil counters, derived from the lists the réparateur already fetches. */
export type RepairerProfileCounts = { activeCount: number; pendingOffersCount: number };

/**
 * The réparateur Profil hero's « En cours » and « Propositions » counters.
 *
 * Same module as `repairerActivity` on purpose: this answers the same « derived from the
 * lists he already fetches » question, just for the Profil panel rather than the dashboard.
 *
 * `activeCount` reuses `isActiveCommande` - the SAME définition Accueil's COMMANDES ACTIVES
 * section and its activity card use, so a third independent filter cannot disagree with
 * those two in a third viewport.
 *
 * `pendingOffersCount` counts offers still awaiting a client answer (D3): `status === 'SENT'`,
 * matching `liveOffers` in `offer.schemas.ts` - an offer is "pending" for exactly as long as
 * it is "live".
 */
export function repairerProfileCounts(
  commandes: readonly Pick<CommandeListItem, 'status' | 'step'>[],
  offers: readonly { status: OfferStatus }[],
): RepairerProfileCounts {
  return {
    activeCount: commandes.filter((c) => isActiveCommande(c)).length,
    pendingOffersCount: offers.filter((o) => o.status === 'SENT').length,
  };
}
