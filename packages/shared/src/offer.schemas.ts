import { z } from 'zod';
import { type DemandeStatus } from './demande.schemas.js';

export const travelModeSchema = z.enum(['WORKSHOP', 'HOME']);
export const offerStatusSchema = z.enum(['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);

/**
 * Delay is stored as an INTEGER number of hours, never as a label.
 * Comparaison sorts on it, and the prototype's `parseInt("24 h")` would rank
 * "3 jours" as 3 - faster than 24 hours - in the sort that is the product's
 * differentiator. The label is derived from the hours, never the reverse.
 *
 * 🛑 CF-29 CHANGED WHAT THIS LIST IS FOR, and the distinction is the whole slice.
 * These five values used to be an ALLOWLIST: `createOfferSchema` refused anything
 * else, so they were the only delays that could exist. The client asked for « le
 * délai de réparation, avec la possibilité de choisir/modifier lui-même le délai »,
 * which is precisely a request to remove that constraint. So the list survives as
 * the form's QUICK-FILL row and constrains nothing.
 *
 * The paragraph above is untouched and still governs: what widened is the RANGE of
 * `delayHours`, never its type. Anyone reintroducing a label as the stored value
 * re-breaks Comparaison's sort.
 */
export const DELAY_OPTIONS = [
  { hours: 24, label: '24 h' },
  { hours: 48, label: '48 h' },
  { hours: 72, label: '72 h' },
  { hours: 168, label: '1 semaine' },
  { hours: 336, label: '2 semaines' },
] as const;

/**
 * The two units the offer form lets a réparateur type in. CF-29.
 *
 * Two, not three, and « semaines » is the one deliberately absent: it buys no reach
 * (a week is 7 jours) while adding a third chip to a row that has to sit beside a
 * numeric field on a 390pt screen. `delayLabel` still RENDERS weeks, because reading
 * « 2 semaines » is easier than reading « 14 jours » - the unit he types in and the
 * unit the client reads are separate decisions.
 */
export const DELAY_UNITS = ['heures', 'jours'] as const;
export type DelayUnit = (typeof DELAY_UNITS)[number];

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 7 * HOURS_PER_DAY;

/**
 * 90 days, and it is a product decision rather than a technical bound.
 *
 * `Int` would hold far more, so this exists to keep the string a client reads sane:
 * a repair quoted at « 900 jours » is not an offer. 90 days is the outer edge of a
 * real special-order parts lead time. Same shape as the price cap above - generous,
 * finite, and stated as the multiplication so the intent survives a change of mind.
 */
export const DELAY_HOURS_MAX = 90 * HOURS_PER_DAY;

/**
 * Below this, the label stays in hours. This is the app's EXISTING convention rather
 * than a new choice: « 48 h » is how a réparateur says two days, and three of the
 * five quick-fill labels are on this side of the line.
 */
const HOURS_LABEL_MAX = 3 * HOURS_PER_DAY;

export const WARRANTY_OPTIONS = ['Aucune', '3 mois', '6 mois', '12 mois'] as const;

/**
 * The one member of `WARRANTY_OPTIONS` that is not a warranty, and therefore the
 * only value a réparateur of any level may send - see `mayOfferWarranty` below.
 *
 * Written as a literal rather than `WARRANTY_OPTIONS[0]`, deliberately. Indexing
 * would make this silently become « 3 mois » if anyone ever reordered that array,
 * which is the one edit that turns "no warranty" into a twelve-week promise. The
 * literal cannot drift undetected instead: `offer-schemas.spec.ts` asserts both that
 * it equals « Aucune » and that it is still a member of the array, so a RENAME fails
 * a test while a REORDER is harmless.
 */
export const WARRANTY_NONE = 'Aucune';

export const PARTS_OPTIONS = [
  "Pièce d'origine",
  'Pièce compatible',
  'Pièce fournie par le client',
] as const;

/**
 * Total by construction: an unknown value still renders French, never "undefined".
 *
 * 🛑 CF-29 MADE THIS A FORMATTER RATHER THAN A LOOKUP, and that was required, not
 * tidier. It used to read `DELAY_OPTIONS.find(...)?.label ?? `${hours} h``, which was
 * total but not PRESENTABLE: once a réparateur can type his own delay, five days
 * would have shown the client « 120 h » - on the offer card, the payment summary, the
 * conversation recap, Comparaison and Mes propositions. That is CF-30's defect shape
 * exactly: a value the réparateur chose, rendered in a form nobody designed.
 *
 * It no longer consults `DELAY_OPTIONS` at all, because it reproduces all five of
 * those labels by construction. `offer-schemas.spec.ts` pins that with a loop over
 * the list, so the formatter and the quick-fill row cannot drift apart silently.
 *
 * Measured before the change: all 47 live offers held one of the five presets
 * (24x4, 48x39, 72x2, 168x1, 336x1). So no string any client can currently see
 * changed, and there was nothing to migrate.
 */
export function delayLabel(hours: number): string {
  if (hours <= HOURS_LABEL_MAX) return `${hours} h`;
  if (hours % HOURS_PER_WEEK === 0) {
    const weeks = hours / HOURS_PER_WEEK;
    return weeks === 1 ? '1 semaine' : `${weeks} semaines`;
  }
  if (hours % HOURS_PER_DAY === 0) return `${hours / HOURS_PER_DAY} jours`;
  // Reachable by typing hours directly - « 100 h » is honest and « 4,17 jours » is not.
  return `${hours} h`;
}

/**
 * Keeps the free-entry delay field an integer as it is typed. CF-29.
 *
 * Deliberately UNLIKE `normalisePriceInput`, which keeps one decimal separator: euros
 * have cents and `delayHours` is an `Int` column, so a fraction has nothing to say
 * here that the unit chips cannot say better (half a day is « 12 heures »).
 *
 * The four-digit cap covers `DELAY_HOURS_MAX` and stops the field accumulating a
 * number no validation message could explain.
 */
export function normaliseDelayInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits === '') return '';
  const trimmed = digits.replace(/^0+/, '');
  // '000' must not empty the field - the réparateur can see what he typed, and an
  // input that silently erases itself reads as a broken control.
  return trimmed === '' ? '0' : trimmed;
}

/**
 * The one place the unit arithmetic lives, and the ONLY thing the offer form asks
 * about a typed delay. CF-29.
 *
 * `null` is the single representation of "not a delay" - empty field, non-numeric,
 * zero, or past the cap - per the rule `apps/mobile/AGENTS.md` states for absent DTO
 * fields. It matters here for a second reason: the form reads this for BOTH
 * `canSubmit` and the submitted value, so a merely-falsy sentinel like `0` would let
 * an empty field through the button and 422 at the server.
 *
 * 🛑 The bound is written out here rather than delegated to
 * `createOfferSchema.shape.delayHours`, and that redundancy is deliberate. Delegating
 * would make the two sides agree tautologically; stated independently, the spec's
 * both-directions test genuinely compares them and fails if either moves. This is
 * CF-31's « the write rule and the read rule must be one expression » pointed the
 * other way: when the second expression is a GATE rather than a rendering, an
 * independent statement plus a test that ties them is the stronger arrangement.
 */
export function delayHoursFrom(raw: string, unit: DelayUnit): number | null {
  const digits = normaliseDelayInput(raw);
  if (digits === '') return null;
  const hours = Number(digits) * (unit === 'jours' ? HOURS_PER_DAY : 1);
  if (!Number.isInteger(hours) || hours < 1 || hours > DELAY_HOURS_MAX) return null;
  return hours;
}

/**
 * The inverse: what a quick-fill chip puts INTO the field. CF-29.
 *
 * 🛑 It shares `HOURS_LABEL_MAX` with `delayLabel` rather than decomposing
 * arithmetically, and that is the whole reason it exists as a function instead of two
 * lines in the screen. 24 h is a whole day, so pure arithmetic would answer « 1 jour »
 * to a tap on a chip whose label reads « 24 h » - the chip, the field and the echo
 * beneath it would then disagree with one another on the same screen. Reusing the
 * threshold makes them agree by construction, and the spec pins it in both directions.
 */
export function delayInputFor(hours: number): { value: string; unit: DelayUnit } {
  if (hours > HOURS_LABEL_MAX && hours % HOURS_PER_DAY === 0)
    return { value: String(hours / HOURS_PER_DAY), unit: 'jours' };
  return { value: String(hours), unit: 'heures' };
}

export const createOfferSchema = z.object({
  priceCents: z
    .int({ message: 'Prix invalide.' })
    .positive({ message: 'Prix invalide.' })
    .max(10_000_000, { message: 'Prix trop élevé.' }),
  /**
   * CF-29: a RANGE, where this was an allowlist of `DELAY_OPTIONS`' five values.
   * Two distinct messages, mirroring `priceCents` above, because « trop long » and
   * « invalide » send the réparateur to different corrections.
   */
  delayHours: z
    .int({ message: 'Délai invalide.' })
    .positive({ message: 'Délai invalide.' })
    .max(DELAY_HOURS_MAX, { message: 'Délai trop long.' }),
  warrantyLabel: z.enum(WARRANTY_OPTIONS, { message: 'Garantie invalide.' }),
  partsLabel: z.enum(PARTS_OPTIONS, { message: 'Type de pièces invalide.' }),
  travel: travelModeSchema,
  /**
   * Required rather than defaulted. `commandeListQuerySchema` records why:
   * Stage 4b's `sort ?? 'recentes'` silently broke two independent guards, and a
   * default here would let a client be offered a parcel the réparateur never
   * considered.
   */
  acceptsParcel: z.boolean({ message: 'Choix de colis invalide.' }),
  comment: z.string().max(1000, { message: 'Commentaire trop long.' }).optional(),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/**
 * Which badge a réparateur has earned, or `null` for none.
 *
 * Deliberately NOT `verificationLevel`. `NONE` and `BASIC` cannot be expressed
 * here, so this type carries no ladder to sort against, and `null` is the only
 * unverified state. The two badges are ranked **equal**: the client was explicit
 * that level 3 « ne doit absolument pas être obligatoire », so nothing may order
 * a professional above a verified individual.
 */
export type VerifiedBadge = 'IDENTITY' | 'BUSINESS';

/**
 * The only place either badge's French lives.
 *
 * There is no key for `NONE` or `BASIC`, and adding one would be the bug: BASIC
 * means a verified email or phone, which says nothing about who the person is,
 * on the screen a client uses to decide who gets paid work.
 */
export const VERIFIED_BADGE_LABEL: Record<VerifiedBadge, string> = {
  IDENTITY: 'Réparateur vérifié',
  BUSINESS: 'Professionnel vérifié',
};

/**
 * The ONE derivation of a public trust badge from a verification level.
 *
 * Extracted in Étape 4b piece C, where it acquired a second caller. Before that it
 * was inline in `offers.service.ts` - and an inline copy is this codebase's named
 * drift hazard: `conversations.service.ts`'s COUNTERPART_SELECT exists because two
 * copies of a nested select drift with no compiler error.
 *
 * Two rules survive the move, and neither is stylistic. The badges rank EQUAL - the
 * client requires that level 3 « ne doit absolument pas être obligatoire », so nothing
 * may sort on the enum's ordinal. And BASIC falls through to null: a verified email
 * or phone says nothing about who the person is, on a screen a client uses to decide
 * who gets paid work. An absent profile is null too, so the trust signal fails CLOSED.
 *
 * The parameter is deliberately widened to `string | null | undefined` rather than the
 * Prisma enum: callers reach it through an optional relation, and narrowing it would
 * push a `?? 'NONE'` to every call site - which is the fallback this function owns.
 */
export function verifiedBadgeFor(level: string | null | undefined): VerifiedBadge | null {
  return level === 'BUSINESS' ? 'BUSINESS' : level === 'IDENTITY' ? 'IDENTITY' : null;
}

/**
 * Whether this réparateur may put a garantie on an offer - the client's `CF-31`:
 * *« La garantie doit être réservée aux professionnels. Un réparateur particulier ne
 * doit donc pas pouvoir proposer une garantie professionnelle. »*
 *
 * **BUSINESS and nothing else, and the discriminator is the point.** `RepairerKind =
 * PRO | INDIVIDUAL` looks like the obvious field and is the wrong one twice over.
 * `kind` is what the réparateur ticked about himself, and design §4.4 / spec §6.2
 * forbid a self-declared « Professionnel » from driving anything a client reads - a
 * « Garantie 12 mois » on an offer card is exactly such a claim, arriving through a
 * different door than the badge that rule was written for. It is also unwritable:
 * the profile PATCH strips it (`repairer-profile.int.spec.ts`) and the only writer
 * hardcodes INDIVIDUAL, so a rule keyed on it would refuse every account that exists
 * and could never accept one. So « professionnel » here means the client's OWN
 * definition of it, from 2026-08-13: a company checked against the registry, which is
 * `BUSINESS`.
 *
 * 🛑 **IDENTITY does not satisfy this, and that is not an off-by-one.** Unlike
 * `gate.ts`'s two asserts, this is NOT a floor on a ladder. « Réparateur vérifié » is
 * a *particulier* who verified his ID; the client requires the two badges to rank
 * equal, so treating IDENTITY as one rung short of professional would re-introduce
 * the ordering he refused - and would hand a garantie professionnelle to precisely
 * the réparateur particulier this rule exists to stop.
 *
 * Parameter widened to `string | null | undefined` for the same reason
 * `verifiedBadgeFor` widens it: callers reach the level through an optional relation.
 * An absent profile is `false`, so the right fails CLOSED.
 */
export function mayOfferWarranty(level: string | null | undefined): boolean {
  return level === 'BUSINESS';
}

/**
 * The garantie a client may be SHOWN for an offer, given who wrote it.
 *
 * A named derivation rather than a `mayOfferWarranty ? … : …` at each call site, for
 * the reason `OFFER_INCLUDE` and `COUNTERPART_SELECT` are both named in
 * `offers.service.ts`: two copies of one derivation drift with no compiler error, and
 * this one has to hold on **two** presenters - `offers.service.ts`'s `present` and
 * `conversations.service.ts`'s recap, which selects `warrantyLabel` straight off the
 * chosen offer rather than going through `present`.
 *
 * **Why the rule runs on read at all, rather than on write alone.** 47 offers exist in
 * production and 44 carry a garantie written before this rule, by réparateurs at NONE
 * - the offer form defaulted to « 3 mois ». Refusing only new writes would leave the
 * client comparing offers that still say « Garantie 3 mois » from a particulier, which
 * is the sentence `CF-31` asks us to make untrue. Suppressing on presentation makes it
 * hold for every row that already exists without migrating client data.
 *
 * It is **idempotent**, and `offers.service.ts` depends on that: its create refuses
 * exactly when `warrantyLabelFor(level, sent) !== sent`, i.e. "refuse what we would
 * not display", so the write rule and the read rule are the same expression and cannot
 * be changed apart.
 */
export function warrantyLabelFor(level: string | null | undefined, stored: string): string {
  return mayOfferWarranty(level) ? stored : WARRANTY_NONE;
}

/**
 * Whether there is a garantie worth naming on a surface - the same shape as
 * `isVerified` above, and exported for the same reason: three screens ask it.
 *
 * Not cosmetic. `warrantyLabelFor` answers « Aucune » for every réparateur below
 * BUSINESS, which is 44 of the 47 offers that exist, so the three surfaces that
 * interpolate the label after the word « Garantie » - the offer card, the payment
 * summary and the conversation recap - would otherwise read **« Garantie Aucune »** as
 * their ordinary state. An absent warranty needs no words on a comparison card, so the
 * whole clause drops out instead.
 */
export function hasWarranty(label: string): boolean {
  return label !== WARRANTY_NONE;
}

/** One offer as the client sees it on Offres and Comparaison. */
export type OfferDto = {
  id: string;
  repairerName: string;
  /**
   * Who to address a conversation to. `repairerName` is for display and is not an
   * identifier - two réparateurs may share a display name.
   *
   * An opaque uuid behind the session guard. It buys a client nothing on its own:
   * `POST /conversations` refuses any pair where the named réparateur has not
   * offered on the named demande.
   */
  repairerUserId: string;
  priceCents: number;
  delayHours: number;
  warrantyLabel: string;
  partsLabel: string;
  travel: z.infer<typeof travelModeSchema>;
  /**
   * Whether this réparateur will receive THIS object as a parcel. The payment
   * screen filters « Envoi par colis » out of the picker when false, so this is
   * what makes colis unselectable by data rather than by a feature flag.
   */
  acceptsParcel: boolean;
  comment: string | null;
  /** null when either end has no coordinates. Never fabricated. */
  distanceKm: number | null;
  /**
   * The badge to render, or null for none. Two badges rather than one boolean
   * because « Réparateur vérifié » and « Professionnel vérifié » are different
   * claims. Never derived from the self-declared `RepairerProfile.kind`.
   */
  verifiedBadge: VerifiedBadge | null;
  /**
   * The réparateur's average rating to one decimal, or **null** when he has no
   * reviews. Never 0: a zero renders as a catastrophic rating rather than an absent
   * one, so Comparaison's Note row shows « - » and drops out entirely when nobody in
   * the set is rated.
   *
   * Derived on every read from `Review`, never stored. See `repairer-stats.ts`.
   */
  rating: number | null;
  /**
   * How many reviews that average is over. Rendered on Comparaison's choose strip as
   * « ★ 4,8 (12) » and deliberately NOT inside the Note cell: `visibleCriteria` judges
   * a row on `get`'s output, so folding the count in would make the Note row appear
   * whenever two réparateurs with the SAME rating had different numbers of reviews --
   * showing a row that cannot separate them on its own criterion.
   *
   * It never weights `rank` either. A rating weighted by its sample size is a composite
   * trust score by another name, which the design forbids.
   */
  reviewCount: number;
  /**
   * Completed repairs: commandes at `PAID` + `RELEASED`, the same pair a review
   * requires, so this is >= `reviewCount` **while the commande stays PAID**.
   *
   * It is NOT an invariant across a refund, and the earlier wording here wrongly said it
   * was. `refund.service.ts` refuses only on `status !== 'PAID'`, so an operator can refund
   * an already-RELEASED commande: `repairCount` drops and the review stays, which renders
   * as « Nb de réparations: 0 » beside « Note: 5 ». Whether a review should survive the
   * refund of the repair it reviews is an open OWNER decision, recorded in the roadmap.
   *
   * 0 is a true value here, unlike a rating of 0, so Comparaison's « Nb de réparations »
   * row needs no null case -- it simply ties at 0 for everyone and drops out of
   * `visibleCriteria`, which is the state of production on the day this ships.
   */
  repairCount: number;
  /**
   * A withdrawn offer stays in the client's history, marked « Offre retirée »,
   * because a réparateur who changes price withdraws and re-offers and the
   * client asked to keep that trail. So this is the full status rather than a
   * `withdrawn` boolean: the réparateur's own list already renders the same
   * enum, and ACCEPTED and REJECTED then need no second vocabulary.
   */
  status: z.infer<typeof offerStatusSchema>;
  createdAt: string;
};

/**
 * Verified at all, without saying which.
 *
 * This is the only question anything that ranks or filters may ask, because it
 * cannot tell the two badges apart and therefore cannot order them.
 */
export function isVerified(o: Pick<OfferDto, 'verifiedBadge'>): boolean {
  return o.verifiedBadge !== null;
}

/**
 * The offers still on the table. Everything a client can act on or compare,
 * and nothing else.
 *
 * Live means SENT, deliberately, so this agrees with `DemandesService`'s
 * `offerCount`, which counts SENT alone. Any wider definition would make the
 * home tab and the Offres headline disagree the moment the accept étape makes
 * ACCEPTED and REJECTED reachable.
 */
export function liveOffers(offers: OfferDto[]): OfferDto[] {
  return offers.filter((o) => o.status === 'SENT');
}

/**
 * The offer that won, if any.
 *
 * At most one exists: the accept transaction sets exactly one ACCEPTED per
 * demande inside a single transaction, and the checkout guard requires the
 * demande to be OPEN, so a second one cannot be created. `find` rather than
 * `filter` states that invariant instead of tolerating a violation of it.
 */
export function acceptedOffer(offers: OfferDto[]): OfferDto | null {
  return offers.find((o) => o.status === 'ACCEPTED') ?? null;
}

export type OfferPartition = {
  accepted: OfferDto | null;
  live: OfferDto[];
  past: OfferDto[];
};

/**
 * The three buckets the Offres screen renders, in render order.
 *
 * `past` is the COMPLEMENT of the other two rather than its own status test, so
 * the buckets are exhaustive and disjoint by construction. That is what stops an
 * accepted offer being badged « Acceptée » beneath an « Offres retirées »
 * heading - it is removed before the past bucket exists, rather than being
 * special-cased once it is in it.
 */
export function partitionOffers(offers: OfferDto[]): OfferPartition {
  const accepted = acceptedOffer(offers);
  const live = liveOffers(offers);
  const liveIds = new Set(live.map((o) => o.id));
  const past = offers.filter((o) => o.id !== accepted?.id && !liveIds.has(o.id));
  return { accepted, live, past };
}

/**
 * « Autres offres » once anything was rejected, matching the prototype's own
 * post-payment screen (`Acceptee.tsx:89`).
 *
 * A rejected offer was not withdrawn - the client lost it by choosing someone
 * else - so filing it under « Offres retirées » is a lie he can see.
 */
export function pastSectionHeading(past: OfferDto[]): string {
  return past.some((o) => o.status === 'REJECTED') ? 'Autres offres' : 'Offres retirées';
}

/** One of the réparateur's own offers, for MesPropositions. */
export type OfferListItem = {
  id: string;
  demandeId: string;
  demandeTitle: string;
  priceCents: number;
  delayHours: number;
  status: z.infer<typeof offerStatusSchema>;
  createdAt: string;
};

/**
 * One offer the CLIENT has received, for `CF-11`'s « Mes offres reçues » rubrique.
 *
 * The mirror of `OfferListItem` above, and deliberately kept beside it: the two differ by
 * exactly one field and one direction. `OfferListItem` answers « offers I sent » and needs no
 * réparateur, because the réparateur is the caller; this answers « offers I received » and needs
 * `repairerName`, because that is the whole question the client is asking.
 *
 * 🛑 DELIBERATELY NOT `OfferDto`. That type carries `warrantyLabel`, `verifiedBadge`, `rating`
 * and `distanceKm`, each governed by a rule with its own history - `CF-31`'s garantie
 * suppression, the fail-closed badge, the per-list aggregate. A compact row cannot restate any
 * of them correctly, and a list that restated one WRONGLY would be a trust signal that
 * disagrees with the screen the row taps through to. So this list is a route to the offer, not
 * a second rendering of it.
 */
export type ReceivedOfferListItem = {
  id: string;
  demandeId: string;
  demandeTitle: string;
  /** Resolved through `publicIdentity`, the same helper `OfferDto.repairerName` uses. */
  repairerName: string;
  priceCents: number;
  delayHours: number;
  /**
   * 🛑 ALWAYS `SENT` TODAY, and do not branch on it as though it varies. `listReceived` filters
   * to SENT in its WHERE so the list agrees with `offerCount`. The field is kept because this
   * type is the mirror of `OfferListItem`, where the status genuinely does vary, and dropping it
   * would make the two shapes diverge for a reason that is a filter rather than a difference in
   * kind. If the filter ever widens, this is already the right field - and the UI would then need
   * a badge, which it deliberately does not have.
   */
  status: z.infer<typeof offerStatusSchema>;
  createdAt: string;
};

/** One demande as a réparateur sees it in the feed. */
export type FeedItem = {
  id: string;
  title: string;
  categoryLabelFr: string;
  locationLabel: string;
  brand: string | null;
  model: string | null;
  mode: 'OFFERS' | 'BUDGET';
  budgetCents: number | null;
  distanceKm: number | null;
  offerCount: number;
  /** True when the caller already has a live offer on this demande. */
  hasMyOffer: boolean;
  /**
   * The first photo only, signed, for a list thumbnail - the same field and the same
   * meaning as `DemandeListItem.photoUrl`, so the two lists render identically.
   *
   * Null when the demande has no photos AND when storage is unconfigured, which is
   * production today. One absent state on purpose: a thumbnail has nothing useful to
   * say about WHY there is no image, so every caller needs exactly one fallback.
   */
  photoUrl: string | null;
  createdAt: string;
};

/**
 * `CF-19` / `CF-27`. One saved annonce.
 *
 * 🛑 `status` IS HERE AND DELIBERATELY NOT ON `FeedItem`. The feed only ever returns OPEN
 * rows (`demandes.service.ts`), so there it would be a constant - and per
 * `apps/mobile/AGENTS.md` a shared-package type reaches `apps/mobile` by construction, so
 * widening `FeedItem` would push a new field into `DemandeCard`, `NearbyDemandeRow` and the
 * feed with nothing to say in any of them. That is the `CF-43` lesson.
 *
 * A favourites list DOES need it: a saved demande can close, and rendering a closed one
 * identically to an open one puts « Faire une offre » on something the server refuses. That
 * is the measured reason the design chose a screen over a filter chip on the feed.
 */
export type FavoriteDemandeItem = FeedItem & {
  status: DemandeStatus;
};
