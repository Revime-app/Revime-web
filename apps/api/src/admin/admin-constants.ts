import type { CommandeStatus } from '../generated/prisma/enums.js';
import { REVIEW_EMAIL_SUFFIX } from '../review-accounts/review-account.js';

/**
 * Constants shared by every §8.x admin surface. HERE rather than on a service so that
 * admin-users.service.ts does not have to import admin-overview.service.ts to reach
 * them, which would be a service depending on a service for two string literals.
 */

/** CF-47's scrub sets banned:true with this reason. « Suspendu » must exclude it. */
export const DELETED_BAN_REASON = 'account_deleted';

/** « live » throughout: the model's own soft-delete filter. Design §5. */
export const LIVE = { deletedAt: null } as const;

/** The seeded demo cast's only marker. 🛑 Fragile and case-sensitive: a demo account
 *  created without this suffix is invisible to it. */
export const DEMO_EMAIL_SUFFIX = '@demo.revime.fr';

/** The integration suite's fixture domain. It writes to the LIVE database, so these
 *  appear in production, and a non-zero count IS the alarm that it ran. */
export const TEST_FIXTURE_EMAIL_SUFFIX = '@repareme.test';

/**
 * The ONE definition of « a real account » for every figure an operator reads as real (overview,
 * /statistiques, payment and payout KPIs, accounting exports): neither an integration fixture nor a
 * seeded demo account. Case-insensitive, like `isDemoReview`: an e-mail's domain is not case-sensitive,
 * and a demo account counted as real is the failure PRE-3 exists to remove.
 */
export const GENUINE_USER_WHERE = {
  AND: [
    { email: { not: { endsWith: TEST_FIXTURE_EMAIL_SUFFIX }, mode: 'insensitive' as const } },
    { email: { not: { endsWith: DEMO_EMAIL_SUFFIX }, mode: 'insensitive' as const } },
    // PUB-33 (DECP-23): the store-review accounts are not real people either (`sideUserWhere(false)`).
    { email: { not: { endsWith: REVIEW_EMAIL_SUFFIX }, mode: 'insensitive' as const } },
  ],
};

/** An order between two real accounts, whatever its status. */
export const GENUINE_COMMANDE_WHERE = {
  client: GENUINE_USER_WHERE,
  repairer: GENUINE_USER_WHERE,
};

/**
 * An order that really went through Stripe between two real accounts. Fixture specs mark orders PAID,
 * REFUNDED or pending with no payment intent (64 PAID ones in production at the 2026-10-19 review),
 * and a refunded or paid order without one cannot exist in a real flow.
 */
export const GENUINE_COLLECTED_COMMANDE_WHERE = {
  ...GENUINE_COMMANDE_WHERE,
  stripePaymentIntentId: { not: null },
};

/** `GENUINE_COLLECTED_COMMANDE_WHERE` still PAID: the money figures of the overview. */
export const GENUINE_COMMANDE_PAID_WHERE = {
  status: 'PAID' as const,
  ...GENUINE_COLLECTED_COMMANDE_WHERE,
};

/** §8.1's « Nouveaux utilisateurs » window. Rendered on the tile label, never implied. */
export const RECENT_WINDOW_DAYS = 30;

/**
 * « Suspendu », once. §8.1's KPI and §8.2's list computed this two different ways - the KPI
 * on banReason, the list on profile.deletedAt - and roadmap follow-up #9 asked for one
 * predicate before piece B2, which adds a third surface.
 *
 * 🛑 THE KPI'S ORIGINAL FORM, NOT a relation traversal. `profile: { deletedAt: null }` nests
 * a filter on an optional to-one, which Prisma reads as "a Profile row exists AND deletedAt
 * is null" - excluding a banned user with NO Profile, when `ensure-profile.ts:29-32` proves
 * such users are reachable and B1's `assertNotDeleted` permits suspending them. The list
 * composes this with its own live-profile requirement at its call site, because it renders
 * profile fields and must agree with KPI #1, while KPI #4 must NOT carry that condition.
 *
 * Prisma's `not` on a nullable column excludes NULL rows by default. banReason is String?,
 * and Better Auth's admin().ban endpoint takes it as optional, so a ban with no reason set
 * would be excluded under the naive form. The OR includes it. An operator cannot TYPE
 * 'account_deleted' - `adminSuspendUserSchema:272-274` refuses it with its own message.
 *
 * Two predicates, not one, because there are two different suspensions: an ACCOUNT ban
 * (Better Auth's columns, B1) and a RÉPARATEUR-mode suspension (Profile, B2). Merging them
 * would make « suspendu » ambiguous on exactly the surface that must distinguish them.
 */
export const ACCOUNT_SUSPENDED_WHERE = {
  banned: true,
  OR: [{ banReason: null }, { banReason: { not: DELETED_BAN_REASON } }],
};

/**
 * Fixed server-side for every admin list. The operator cannot ask for more; Ch.8 has no
 * bulk export.
 *
 * Here rather than in `admin-users.service.ts`, where it started: piece C1 adds two more
 * lists, and a demandes service importing a constant out of the users service is the wrong
 * dependency. 🛑 A page size is not a PREDICATE - B1's follow-up #9 records that unifying
 * two surfaces' predicates smuggled one surface's extra requirement into the shared
 * definition. This is a scalar with no surface-specific meaning, so sharing it is safe in a
 * way sharing a `where` is not.
 */
export const PAGE_SIZE = 25;

/**
 * « Le mode réparateur de ce compte est suspendu », for data already fetched. **The one live
 * form for data in hand.**
 *
 * 🛑 CORRECTED 2026-09-04: an earlier draft of this line said « Nothing in the product filters a query
 * on this fact », and that is FALSE - two predicates filter on exactly `repairerSuspendedAt`:
 * `UNSUSPENDED_REPAIRER_WHERE` in `offers/offer-predicates.ts` and `listableRepairerWhere()` in
 * `repairers/repairers.service.ts`. The true and narrower claim is the one below: nothing imported the
 * DELETED CONSTANT. The distinction is load-bearing rather than pedantic, because this sentence is what a
 * future implementer of a `statut=reparateur-suspendu` filter reads first - told that nothing filters on the
 * fact, he writes a third copy of the traversal, which is precisely the drift `offer-predicates.ts` spends ten
 * lines warning against.
 *
 * 🛑 A `REPAIRER_SUSPENDED_WHERE` Prisma fragment used to sit above this, and it is DELETED
 * rather than kept for symmetry. Nothing filtered on it; `admin-users.service.ts` imported it
 * and never used it; and its header justified carrying two forms because *« a list that FILTERS
 * on one definition while DISPLAYING another »* is the drift this piece removed from the offer
 * predicates - a rationale that only applies when something filters. A dead constant with a
 * true-sounding rationale is worse than no constant, because the next reader treats the pair as
 * load-bearing and keeps both in step.
 *
 * 🛑 IF A `statut=reparateur-suspendu` FILTER IS EVER WANTED, that is the moment to bring the
 * fragment back - and it is NEW SCOPE, not a repair. `?statut` is validated against
 * `STATUTS = ['actif', 'suspendu', 'supprime']` in `admin-users.service.ts`, so adding a fourth
 * member is an API contract change plus a `<select>` option plus a test, and it must not be
 * folded into a fix wave. The réparateur list already SHOWS the fact in its « Statut réparateur »
 * column, which is what §8.3 asks for.
 *
 * 🛑 `!= null` rather than `!== null`: the argument may be `undefined` when the relation is
 * absent, and `undefined !== null` is **true** - which would report an account with no profile
 * as *suspended*. The loose form includes both null and undefined.
 */
export const isRepairerSuspended = (
  profile: { repairerSuspendedAt?: Date | null } | null | undefined,
): boolean => profile?.repairerSuspendedAt != null;

/**
 * The commande statuses that mean « money was collected »: F5 payouts and F6 exports filter on
 * these. A commande released to its réparateur is still `PAID`: RELEASED is a `CommandeStep`, not a
 * `CommandeStatus`, and the `'RELEASED'` that used to sit in this list made Prisma reject every F5
 * list and F6 preview in production (RU-25, N-9). Typed against the generated enum so `tsc`
 * rejects a wrong member instead of the database.
 */
export const COLLECTED_COMMANDE_STATUSES: CommandeStatus[] = ['PAID', 'REFUNDED'];
