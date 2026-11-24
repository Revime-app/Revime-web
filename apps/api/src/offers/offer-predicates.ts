import type { Prisma } from '../generated/prisma/client.js';

/**
 * WHAT EXISTS. A live offer: sent, not withdrawn.
 *
 * Extracted by Stage 6 piece B2, closing slice-17 follow-up #1 - these two keys were spelled out
 * once per read site, and two expressions that agree today drift with no compiler error. The
 * number of copies is deliberately not stated here: this piece has now miscounted a set six
 * times, and a count in a comment is a claim that goes stale while reading as verified.
 *
 * 🛑 USE THIS ONLY FOR NOTIFICATION LISTS AND A RÉPARATEUR'S VIEW OF HIS OWN OFFER. Anything a
 * client SEES, COUNTS or RELIES ON uses ACCEPTABLE_OFFER_WHERE below. The call sites are
 * enumerated in the B2 spec §5.2 with the reason each is on the list it is on.
 *
 * 🛑 THE RULE FOR THE WRITE-SIDE LIFECYCLE IN `payments.service.ts`: IT USES NEITHER CONSTANT, AND
 * MUST NOT BE SWITCHED TO ONE. `confirmPaid`'s sibling-decline predicate - one shared local const,
 * read by the query that snapshots the losers and by the `updateMany` that rejects them - carries
 * `status: 'SENT'` with **no `deletedAt`**. Substituting this constant would add `deletedAt: null`
 * to a write on the money path and change which rows the lifecycle touches; substituting
 * `ACCEPTABLE_OFFER_WHERE` would leave a suspended réparateur's offer `SENT` for good on a paid
 * demande. **B2 spec §5.2 states the same rule, so the code and the spec agree.**
 *
 * An earlier draft of this note ended « §5.2's table calls these `LIVE_OFFER_WHERE` sites, which is
 * the one place that table is wrong ». That was true when written and stopped being true when the
 * row was corrected - after which the note was telling a reader to distrust a document that agreed
 * with it, and the substitution it implied would have put `deletedAt: null` on a money-path write.
 * The lesson is why this now states the rule instead: **a comment describing another document's
 * state goes stale when that document is fixed, and a stale comment shaped like an instruction is
 * worse than a stale fact.**
 */
export const LIVE_OFFER_WHERE: Prisma.OfferWhereInput = { status: 'SENT', deletedAt: null };

/**
 * THE SUSPENSION CLAUSE ALONE, with no statement about the offer's status.
 *
 * It exists because `listForDemande` needs the suspension WITHOUT `status: 'SENT'` - that screen
 * keeps withdrawn offers deliberately - so `ACCEPTABLE_OFFER_WHERE` does not fit it, and spelling
 * the traversal out a second time is the drift this whole module removes. `ACCEPTABLE_OFFER_WHERE`
 * is composed from this, so the two cannot disagree about how the marker is reached.
 *
 * 🛑 THROUGH `repairer.profile`, NEVER `repairer.repairerProfile`. `User.repairerProfile` is
 * an OPTIONAL to-one relation, so Prisma reads a nested filter on it as "the related row
 * exists AND the field matches" - which would silently drop every réparateur without that
 * row. `Profile` exists for every account: `ensureProfileForUser` upserts one inside signup and
 * deletes the `User` if that fails, so there is no window in which an account has none.
 *
 * 🛑 IT CARRIES A `repairer:` KEY, so a site that SPREADS it and then writes its own `repairer:`
 * silently loses the whole clause - see `ACCEPTABLE_OFFER_WHERE` below for the full note.
 */
export const UNSUSPENDED_REPAIRER_WHERE: Prisma.OfferWhereInput = {
  repairer: { profile: { repairerSuspendedAt: null } },
};

/**
 * WHAT ANYONE MAY SEE, COUNT OR RELY ON. Live, and from a réparateur who is not suspended.
 *
 * 🛑 COMPOSED FROM THE TWO ABOVE rather than restating either. The `repairer.profile` traversal
 * and the reason it is never `repairer.repairerProfile` live on `UNSUSPENDED_REPAIRER_WHERE`.
 *
 * The rule in one sentence: a suspended réparateur's offer is invisible and non-binding, but
 * he is still told what happens to it.
 *
 * 🛑 SPREADING THIS BESIDE A SIBLING `repairer:` KEY SILENTLY DELETES THE SUSPENSION CLAUSE.
 * Object spread is not a deep merge, and `tsc` cannot see the difference because both spellings
 * are valid `Prisma.OfferWhereInput` values. Compose with `AND: [ACCEPTABLE_OFFER_WHERE, …]`
 * instead at any site that needs its own `repairer:`, `status` or `deletedAt`. As of B2 no call
 * site collides - `listReceived`'s sibling key is `demande:` - and `offer-predicates.spec.ts`
 * plus `received-offers.spec.ts` hold the assertions that keep it that way. The same hazard is
 * recorded for the directory fragment at `repairers.service.ts`.
 *
 * 🛑 IT DOES NOT CONSULT `repairerSuspendedUntil`, deliberately. A suspension does not
 * self-expire; only an operator clearing `repairerSuspendedAt` ends it, which is the rule guard 6
 * in `offers.service.ts` already states in full. Adding a time clause would also force this
 * constant to become a function.
 *
 * 🛑 THE EDIT AND DELETE GUARDS USE THIS ONE TOO, and that was the hard call rather than an
 * oversight. Hiding the offer while letting it keep blocking would wall the client out of
 * editing or deleting his own demande with a visible count of ZERO and no explanation. An
 * offer nobody can see or accept should not constrain anyone either. It is self-healing:
 * the notification lists stay on LIVE_OFFER_WHERE, so a réparateur suspended while quoting
 * is told of every change and knows to re-quote on reactivation. B2 spec §5.2.
 *
 * Writing a withdrawn status instead was not available: `CF-D7` part 2 rejected writing
 * WITHDRAWN for a réparateur, recorded at demandes.service.ts's softDelete.
 */
export const ACCEPTABLE_OFFER_WHERE: Prisma.OfferWhereInput = {
  ...LIVE_OFFER_WHERE,
  ...UNSUSPENDED_REPAIRER_WHERE,
};
