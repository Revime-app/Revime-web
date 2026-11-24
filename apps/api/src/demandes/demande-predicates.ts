import type { Prisma } from '../generated/prisma/client.js';

/**
 * WHAT A NON-OPERATOR MAY SEE. Not removed by its author or by us, and not hidden by us.
 *
 * Added by Stage 6 piece C1 (§8.4), which gave `Demande` a second visibility marker.
 * `deletedAt` was spelled out once per read site, and one expression per site is how a
 * second condition gets applied to some of them and not others with no compiler error.
 * The number of sites is deliberately not stated here: a count in a comment is a claim
 * that goes stale while reading as verified.
 *
 * 🛑 THIS IS DEMANDE-ONLY. Do NOT fold it into `admin-constants.ts`'s `LIVE`, which is
 * `{ deletedAt: null }` used model-agnostically - enumerated, against `Profile`,
 * `RepairerProfile`, `Demande`, `Offer` and `Review`. Adding `hiddenAt` there fails loudly
 * on the four models that have no such column, and that loud failure is the harmless half:
 * the dangerous half is silent and on `Demande`, where the operator reads must KEEP seeing a
 * hidden demande. Spec §4.3 enumerates them; no number is stated here for the reason given
 * two paragraphs above.
 *
 * 🛑 THE WRITE-SIDE LIFECYCLE MUST NOT USE THIS. `payments.service.ts`'s two `demande`
 * updates and `refund.service.ts`'s one carry no visibility filter and must not gain one:
 * a webhook completing an ALREADY CREATED checkout session, or a refund on a demande an
 * operator has since hidden, must still succeed. Adding a filter there converts a
 * moderation act into a stuck payment.
 *
 * 🛑 NOR MAY `completeBySessionId`'s SNAPSHOT USE IT. `payments.service.ts:491` reads the
 * demande title and the client's handle for notifications, inside the webhook that completes
 * an already-created session. Filtering it makes that read `null` for a demande hidden
 * between checkout and webhook - the same defect as the paragraph above, one read earlier.
 *
 * 🛑 THE NEW-CHECKOUT GUARD IS SOMEWHERE ELSE, AND IT IS NESTED. `createCheckout` reads the
 * demande through its OFFER read's nested `demande: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE }`
 * in `payments.service.ts` - find it with
 * `grep -n "demande: { authorUserId" apps/api/src/payments/payments.service.ts`. Note the line
 * ABOVE it is the offer's own `deletedAt` guard. That nested predicate is the site where a
 * hidden demande stops a NEW payment from starting, and it is invisible to a `prisma.demande.`
 * grep. An earlier version of this comment described the PRE-edit shape
 * `demande: { authorUserId, deletedAt: null }` and incorrectly named `completeBySessionId` as
 * the guard site; both were false, and acting on it would have broken payment completion.
 * Spec §4.3's table states the rule per site, and `demande-predicates.spec.ts` pins the sites
 * that must stay bare.
 *
 * 🛑 IT SAYS NOTHING ABOUT `status`, and must not. The feed, `listMine` and the favourites
 * list legitimately span several lifecycle states.
 */
export const VISIBLE_DEMANDE_WHERE: Prisma.DemandeWhereInput = {
  deletedAt: null,
  hiddenAt: null,
};

/**
 * CF4-25 (sub-project H, spec §4.2). WHAT A THIRD PARTY MAY SEE: visible AND public.
 *
 * `VISIBLE_DEMANDE_WHERE` above is also the AUTHOR's predicate, and a private quote request
 * (`targetRepairerUserId` set) must stay visible to its author. So every non-author,
 * non-admin read - the feed, « Pour moi », browse, favourites, dashboard counts - uses this
 * one instead. `demande-visibility-leak.spec.ts` enumerates what is left on
 * `VISIBLE_DEMANDE_WHERE` and fails on a new public read written with it.
 *
 * Flat like its parent, so spreading it beside a sibling filter is safe.
 */
export const PUBLIC_DEMANDE_WHERE: Prisma.DemandeWhereInput = {
  ...VISIBLE_DEMANDE_WHERE,
  targetRepairerUserId: null,
};

/**
 * The demandes a réparateur may ACT on by id (offer, open a demande-scoped conversation):
 * any public one, or a private request addressed to him. Status is the caller's business,
 * so a closed public demande keeps its existing 422 rather than turning into a 404.
 *
 * 🛑 It carries an `OR`. Do not spread it beside another `OR` - the second would replace it.
 */
export function targetableByRepairerWhere(repairerUserId: string): Prisma.DemandeWhereInput {
  return {
    ...VISIBLE_DEMANDE_WHERE,
    OR: [{ targetRepairerUserId: null }, { targetRepairerUserId: repairerUserId }],
  };
}
