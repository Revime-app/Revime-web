import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type DisputeStatus } from '../generated/prisma/client.js';
import { BROWSE_PAGE_SIZE, DEMANDE_FIELD_CLASS, demandeEditPolicy, formatPublicLocation, publicIdentity, publicTownLabel, type BrowseQuery, type CommandeStatus, type CommandeStep, type CreateDemandeInput, type DemandeDto, type DemandeListItem, type DeliveryMode, type EditableDemandeField, type FeedItem, type FeedQuery, type PublicDemandeView, type QuoteRequestInfo, type SignPhotoInput, type SignPhotoResponse, type UpdateDemandeInput } from '@revime/shared';
import { pickCommande } from './pick-commande.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';
import { PUBLIC_DEMANDE_WHERE, VISIBLE_DEMANDE_WHERE } from './demande-predicates.js';
import { viewerSideWhere } from '../review-accounts/review-account.js';
import { QUOTE_NOT_EDITABLE, QUOTE_USE_CANCEL } from '../quote-requests/quote-request-messages.js';
import { CANCEL_PAYMENT_IN_FLIGHT, CANCEL_USE_DELETE } from '@revime/shared';
import { loadMatchingCategoryIds, matchingDemandeWhere } from './matching-demande-where.js';
import { USABLE_CATEGORY } from '../catalog/usable-category.js';
import { AppException } from '../common/app-exception.js';
import { GeocodeService } from '../geo/geocode.service.js';
import { byDistanceKm, distanceKm, type Coords } from '../geo/haversine.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ACCEPTABLE_OFFER_WHERE, LIVE_OFFER_WHERE } from '../offers/offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPhotoPath, checkPhotoPaths, draftPrefixesOf } from '../storage/photo-paths.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import { allowSignature } from '../storage/sign-limit.js';
import { assertBasicVerified } from '../verification/gate.js';

/**
 * How long a signed read URL stays valid: comfortably longer than any screen's lifetime, short
 * enough that a leaked URL dies.
 *
 * Worth knowing and counter-intuitive, from Supabase's own CDN documentation: token expiry and
 * the edge cache TTL are INDEPENDENT. Letting a token expire does not purge what the CDN has
 * already cached. So for time-sensitive access control, DELETE the object rather than relying on
 * token expiry alone - this says nothing about cache headers in general, only that an expired
 * token is not by itself a revocation.
 */
const READ_URL_TTL_SECONDS = 3600;

/** CF4-25. The private-request columns `QuoteRequestsService` hands to `create`. */
export type PrivateQuoteFields = {
  targetRepairerUserId: string;
  quoteExpiresAt: Date;
  quotePreferredTravel: 'WORKSHOP' | 'HOME' | null;
  quoteDetails: string | null;
};

/**
 * CF4-24. One browse page. In `@revime/shared` so the app knows when a page was full and
 * « Voir plus » is worth showing; re-exported here for the specs that import it from the service.
 */
export { BROWSE_PAGE_SIZE } from '@revime/shared';

/**
 * CF4-24. The ONLY columns a browsing client's read selects. `toPublicDemandeView` below reads
 * nothing else, and `demandes-browse.spec.ts` pins both, so postcode, coordinates, author and
 * offers cannot reach the browse view even if `DemandeDto` grows (Review Focus 5).
 */
const BROWSE_SELECT = {
  id: true,
  title: true,
  description: true,
  budgetCents: true,
  locationLabel: true,
  createdAt: true,
  category: { select: { id: true, labelFr: true } },
  photos: { orderBy: { sortOrder: 'asc' }, select: { storagePath: true } },
} as const;

type BrowseRow = {
  id: string;
  title: string;
  description: string;
  budgetCents: number | null;
  locationLabel: string;
  createdAt: Date;
  category: { id: string; labelFr: string };
  photos: { storagePath: string }[];
};

/**
 * CF4-24 (spec §4.2.1). Built key by key from the fields H1 allows - never a spread of the
 * row - so whatever else the row carries stays out. A photo storage cannot sign is dropped.
 */
export function toPublicDemandeView(row: BrowseRow, signed: Map<string, string>): PublicDemandeView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    photos: row.photos.map((p) => signed.get(p.storagePath)).filter((u): u is string => u !== undefined),
    category: { id: row.category.id, labelFr: row.category.labelFr },
    budgetCents: row.budgetCents,
    locationLabel: publicTownLabel(row.locationLabel),
    createdAt: row.createdAt.toISOString(),
  };
}

/** CF4-25. The quote columns of a demande row, as `present` / `listMine` select them. */
type QuoteColumns = {
  targetRepairerUserId: string | null;
  quotePreferredTravel: 'WORKSHOP' | 'HOME' | null;
  quoteDetails: string | null;
  quoteExpiresAt: Date | null;
  quoteClosedReason: QuoteRequestInfo['closedReason'];
  quoteDeclineNote: string | null;
};

const QUOTE_COLUMNS_SELECT = {
  targetRepairerUserId: true,
  quotePreferredTravel: true,
  quoteDetails: true,
  quoteExpiresAt: true,
  quoteClosedReason: true,
  quoteDeclineNote: true,
} as const;

/**
 * Normalizes and strips diacritics / accents from a string.
 * e.g. "Écran" -> "Ecran", "fissuré" -> "fissure"
 */
export function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** French diacritic mappings for vowels and c-cedilla. */
const VOWEL_DIACRITICS: Readonly<Record<string, readonly string[]>> = {
  a: ['a', 'à', 'â'],
  e: ['e', 'é', 'è', 'ê', 'ë'],
  i: ['i', 'î', 'ï'],
  o: ['o', 'ô'],
  u: ['u', 'ù', 'û'],
};

function getCharOptions(base: string, i: number): readonly string[] {
  const ch = base[i]!;
  if (VOWEL_DIACRITICS[ch]) return VOWEL_DIACRITICS[ch]!;
  if (ch === 'c') {
    const next = base[i + 1];
    // In French, cédille only appears before a, o, u (e.g. ça, garçon, reçu)
    if (next === 'a' || next === 'o' || next === 'u') return ['c', 'ç'];
  }
  return [ch];
}

/**
 * Expands a search query into accent-insensitive variants in French (CF6-V1).
 *
 * For example:
 * - "Ecran" produces variants including "Ecran", "ecran", "écran", "ècran", etc.
 * - "Écran" produces variants including "Écran", "ecran", "écran", etc.
 * - "velo" produces variants including "velo", "vélo", etc.
 *
 * No longer used for the demande search (`searchFilter` folds accents in SQL); the admin searches
 * still call it, with their own caps.
 *
 * Capped at `maxVariants` (64 by default) to prevent combinatorial explosion on long phrases.
 */
export function expandAccentVariants(input: string, maxVariants = 64): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const base = stripAccents(trimmed).toLowerCase();

  const results = new Set<string>();
  results.add(trimmed);
  results.add(base);

  // Compute total combinations for small inputs
  let totalCombos = 1;
  for (let i = 0; i < base.length; i++) {
    const opts = getCharOptions(base, i);
    totalCombos *= opts.length;
    if (totalCombos > maxVariants) break;
  }

  if (totalCombos <= maxVariants) {
    let current: string[] = [''];
    for (let i = 0; i < base.length; i++) {
      const opts = getCharOptions(base, i);
      const next: string[] = [];
      for (const prefix of current) {
        for (const opt of opts) {
          next.push(prefix + opt);
        }
      }
      current = next;
    }
    for (const v of current) {
      results.add(v);
    }
  } else {
    // If combinations exceed cap, prioritize high-value French patterns:
    // 1. Non-final e -> é (e.g. 'telephone' -> 'téléphone')
    results.add(base.replace(/e(?!$)/g, 'é'));
    // 2. All e -> é (e.g. 'repare' -> 'réparé')
    results.add(base.replace(/e/g, 'é'));
    // 3. Final e -> é (e.g. 'fissure' -> 'fissuré', 'degrade' -> 'dégradé')
    results.add(base.replace(/e$/g, 'é'));
    // 4. Each vowel accented individually
    for (let i = 0; i < base.length && results.size < maxVariants; i++) {
      const opts = getCharOptions(base, i);
      for (const opt of opts) {
        if (opt !== base[i] && results.size < maxVariants) {
          results.add(base.slice(0, i) + opt + base.slice(i + 1));
        }
      }
    }
  }

  return Array.from(results);
}

/**
 * The search clause the feed and browse share, as a sibling of the base where (so ANDed).
 *
 * CF6-V1: « Ecran » must find « Écran cassé », and « Écran » must find « Ecran fissuré ». Prisma's
 * `contains` + `mode: 'insensitive'` is case-insensitive but accent-sensitive and cannot call
 * `unaccent()`, and guessing accent variants of the query (what this used to do) only covers the
 * spellings the table anticipates: past 64 combinations (a multi-word query) or for a letter it does
 * not list (« œ »), a demande written with accents was missed. So the match is made in SQL, on both
 * sides, with the `unaccent` extension that migration `20261012010000` enables, and the ids are fed
 * back as `id: { in }`. `position()` rather than `LIKE`, so a `%` or `_` typed by the user is a
 * character and not a wildcard.
 *
 * `withLocation: false` for browse (CF4-24): the stored `locationLabel` is the full BAN label
 * (street and postcode), and a browsing client is shown the town only - searching it would let
 * any client learn which open demandes sit on a given street or in a given postcode (H1).
 * The feed keeps it: its audience already sees the postcode and the distance.
 *
 * Returns `{}` for an empty query. Deleted rows are left out here only to keep the id list short;
 * the caller's own where still decides what is visible.
 */
export async function searchFilter(
  prisma: PrismaService,
  q: string | undefined,
  withLocation = true,
): Promise<Prisma.DemandeWhereInput> {
  const term = q?.trim();
  if (!term) return {};
  const folded = Prisma.sql`unaccent(lower(${term}::text))`;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT d."id"
    FROM "Demande" d
    JOIN "Category" c ON c."id" = d."categoryId"
    WHERE d."deletedAt" IS NULL
      AND (
        position(${folded} in unaccent(lower(d."title"))) > 0
        OR position(${folded} in unaccent(lower(coalesce(d."brand", '')))) > 0
        OR position(${folded} in unaccent(lower(coalesce(d."model", '')))) > 0
        OR position(${folded} in unaccent(lower(c."labelFr"))) > 0
        ${
          withLocation
            ? Prisma.sql`OR position(${folded} in unaccent(lower(d."locationLabel"))) > 0`
            : Prisma.empty
        }
      )
  `);
  return { id: { in: rows.map((r) => r.id) } };
}


/** Shape returned by every query in this service, so `present` has one input. */
const DEMANDE_INCLUDE = {
  category: { select: { id: true, slug: true, labelFr: true } },
  photos: { orderBy: { sortOrder: 'asc' } },
  /**
   * The author, for `DemandeDto.author`. An explicit `select` and NOT the whole `User`:
   * this object is handed to a réparateur, and the card's own copy promises contact details
   * stay hidden until an offer is accepted. Widening this to `true` would ship the email and
   * phone behind that promise, so the two columns here are the whole allowance. The legal name
   * is deliberately not selected (CF-05, the client's 2026-08-21 feedback).
   */
  author: { select: { username: true, createdAt: true } },
  /**
   * For `DemandeDto.commande`. An explicit select, not `true`: this
   * object reaches a réparateur, and the money columns (`totalCents`, the Stripe ids)
   * are none of his business. `createdAt` is here only so `pickCommande` can order.
   *
   * Widened (CF4-12/13/14, design §4.2) with `delivery` and `dispute` - `pickCommande`
   * reads `dispute` through `isDisputeOpen` to produce `ProgressCommande.disputeOpen`.
   *
   * Widened again (CF4-D task 8, spec §6) with `refundedCents` and `totalCents` -
   * `pickCommande` reads both through `partialRefundOf` to produce
   * `ProgressCommande.partialRefund`. `totalCents` here is the one exception to the
   * "money columns are none of his business" rule above: it never leaves this
   * function as a raw figure, only as the boolean the refund happened partially.
   */
  commandes: {
    select: {
      id: true,
      status: true,
      step: true,
      delivery: true,
      createdAt: true,
      refundedCents: true,
      totalCents: true,
      cancellationRequestedAt: true,
      // V8 `Q8-08`: read only as `pickCommande`'s author-only `hasStripeTransfer`.
      stripeTransferId: true,
      dispute: { select: { status: true } },
    },
  },
  /**
   * `CF-16`. For `DemandeDto.offerCount`. The same predicate `listMine` and `feed` use, so one
   * definition of « live » feeds every surface - now a named constant rather than four literal
   * copies that agreed by hand.
   *
   * ACCEPTABLE, not LIVE: this count is rendered to the client AND read by `demandeEditPolicy`
   * in `update()` just below, so a suspended réparateur's hidden offer must appear neither in
   * the number nor in the lock on the edit. B2 spec §5.2.
   */
  _count: { select: { offers: { where: ACCEPTABLE_OFFER_WHERE } } },
} as const;

/**
 * Nulls last, so a demande with no coordinates never masquerades as the nearest
 * one. Lifted out of `feed` unchanged when sorting became selectable.
 *
 * 🆕 2026-09-02: the four branches moved to `geo/haversine.ts` as `byDistanceKm` when `CF-34`
 * gave the réparateur directory the same ordering. This stays as the `FeedItem` adapter so the
 * feed's call sites are untouched; the ordering itself is now defined once.
 */
function byDistance(a: FeedItem, b: FeedItem): number {
  return byDistanceKm(a.distanceKm, b.distanceKm);
}

/**
 * Nulls last for the same reason in a different currency: an OFFERS-mode
 * demande has no budget, and sorting it first would read as "cheapest".
 */
function byPrice(a: FeedItem, b: FeedItem): number {
  if (a.budgetCents === null && b.budgetCents === null) return 0;
  if (a.budgetCents === null) return 1;
  if (b.budgetCents === null) return -1;
  return a.budgetCents - b.budgetCents;
}

/**
 * The stored side of the diff: the eleven editable fields as they sit in the database, plus the
 * photo rows in `sortOrder`. Narrower than the Prisma row on purpose, so `changedDemandeFields`
 * cannot quietly start comparing something the client never submitted.
 */
type StoredDemandeFields = {
  categoryId: string;
  brand: string | null;
  model: string | null;
  title: string;
  description: string;
  parts: DemandeDto['parts'];
  mode: DemandeDto['mode'];
  budgetCents: number | null;
  locationLabel: string;
  postalCode: string;
  photos: { storagePath: string }[];
};

/**
 * What `budgetCents` becomes once written, computed in ONE place so the diff and the write cannot
 * disagree. `mode: 'OFFERS'` clears the budget - the rule `create()` already applies - so a client
 * who switches BUDGET to OFFERS while leaving a stale amount in the form does not have that amount
 * counted as "unchanged" by the diff and then nulled by the write.
 */
function effectiveBudgetCents(input: UpdateDemandeInput): number | null {
  return input.mode === 'BUDGET' ? (input.budgetCents ?? null) : null;
}

/**
 * Which of the eleven editable fields the submitted body actually moves. `CF-16`'s whole gate
 * rests on this: the contract lock, the re-validations, the geocode guard and the empty-diff
 * short-circuit all read its answer.
 *
 * 🛑 TOTAL OVER `EditableDemandeField`, AND THE `Record` IS THE GATE. A twelfth editable field is
 * `TS2741` here rather than a field that silently never counts as changed - which would be the
 * quiet failure: it would pass the contract lock however locked it was, and never be re-validated.
 * Same mechanism as `DEMANDE_FIELD_CLASS` in the package that declares the union.
 *
 * `brand` and `model` normalise `undefined` to null before comparing, because the schema makes
 * them optional while the column is nullable, so "absent" and "null" are ONE state here.
 *
 * 🛑 `photoPaths` compares the submitted array against `current.photos` **ordered by `sortOrder`**
 * - which is how `DEMANDE_INCLUDE` returns them - element by element and not as a set. `sortOrder`
 * comes from the submitted array order, so the SAME paths in a different order really is a
 * different demande on screen: a REORDER counts as a change.
 */
function changedDemandeFields(
  current: StoredDemandeFields,
  input: UpdateDemandeInput,
): EditableDemandeField[] {
  const storedPaths = current.photos.map((p) => p.storagePath);

  const moved: Record<EditableDemandeField, boolean> = {
    title: input.title !== current.title,
    description: input.description !== current.description,
    brand: (input.brand ?? null) !== current.brand,
    model: (input.model ?? null) !== current.model,
    parts: input.parts !== current.parts,
    photoPaths:
      input.photoPaths.length !== storedPaths.length ||
      input.photoPaths.some((path, i) => path !== storedPaths[i]),
    categoryId: input.categoryId !== current.categoryId,
    mode: input.mode !== current.mode,
    budgetCents: effectiveBudgetCents(input) !== current.budgetCents,
    locationLabel: input.locationLabel !== current.locationLabel,
    postalCode: input.postalCode !== current.postalCode,
  };

  return (Object.keys(moved) as EditableDemandeField[]).filter((field) => moved[field]);
}

@Injectable()
export class DemandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Mints one signed upload URL under the caller's own prefix.
   *
   * Writes NOTHING to the database. No demande exists yet, and nothing is recorded until the
   * client publishes - which is why an abandoned wizard leaves objects with no rows and the
   * cleanup cron exists.
   *
   * The `objectId` is generated HERE rather than accepted from the client. Two photos picked in
   * the same millisecond therefore cannot collide, and a client cannot aim a signed URL at an
   * object that already exists in order to overwrite it.
   *
   * The rate limit comes first, before any other work: refusing early is the point of a limit.
   */
  async signPhotoUpload(userId: string, input: SignPhotoInput): Promise<SignPhotoResponse> {
    if (!allowSignature(userId)) {
      throw new AppException('TOO_MANY_REQUESTS', 'Trop de photos envoyées. Réessayez plus tard.');
    }
    // `'publier une demande'` preserves this route's message BYTE-IDENTICALLY, which is why the
    // narrower tail is kept rather than generalised. `CF-16`'s edit screen borrows the wizard's
    // photo picker and so will sign through here too, making the wording narrower than the
    // callers - but this line is only reached with client mode OFF, and a client with the mode off
    // can neither publish nor edit, so the sentence is never shown to someone mid-edit who could
    // have proceeded. Distinguishing the two would need a signal this route does not carry.
    await this.assertClientEnabled(userId, 'publier une demande');

    // Fails CLOSED rather than handing back a fake URL no upload can use. Without the driver
    // and both credentials the gateway is the in-memory fake, and a client that PUT its bytes
    // to a fake URL would believe the photo was stored.
    if (!isStorageConfigured()) {
      throw new AppException('INTERNAL', "L'envoi de photos est indisponible.");
    }

    const path = buildPhotoPath(userId, input.draftId, randomUUID(), input.contentType);
    return storageGateway().createSignedUpload(path, input.contentType);
  }

  async create(
    userId: string,
    input: CreateDemandeInput,
    /**
     * CF4-25. Present only when `QuoteRequestsService` creates a PRIVATE request: the same
     * checks and the same write as a public demande (category, photos, geocode, client gate),
     * plus these columns. One create path, so the two kinds cannot drift.
     */
    quote?: PrivateQuoteFields,
  ): Promise<DemandeDto> {
    await this.assertClientEnabled(userId, 'publier une demande');
    await assertBasicVerified(this.prisma, userId, 'publish');

    const category = await this.prisma.category.findFirst({
      // The same rule as CatalogService.listCategories, imported rather than
      // retyped: if a category cannot be offered to a client, it cannot be
      // accepted from one. A parent is a valid destination - spec §2.
      where: { id: input.categoryId, ...USABLE_CATEGORY },
      select: { id: true },
    });
    if (!category) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette catégorie est introuvable.');
    }

    await this.assertPhotosAttachable(input.photoPaths, userId);

    // Geocoding is best-effort by contract: null coordinates are a supported
    // state, so this never blocks the write.
    const coords = await this.geocode.lookupPostalCode(input.postalCode);

    const demande = await this.prisma.demande.create({
      data: {
        authorUserId: userId,
        categoryId: input.categoryId,
        brand: input.brand ?? null,
        model: input.model ?? null,
        title: input.title,
        description: input.description,
        parts: input.parts,
        mode: input.mode,
        budgetCents: input.mode === 'BUDGET' ? (input.budgetCents ?? null) : null,
        locationLabel: input.locationLabel,
        postalCode: input.postalCode,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        // A NESTED create, not a second statement and not an explicit `$transaction`: Prisma
        // wraps a nested write in one transaction already, so a demande can never exist with
        // only some of its photos, and no partial state is reachable if this throws.
        //
        // `sortOrder` comes from the submitted ARRAY ORDER, which is what makes reordering in
        // the wizard expressible later with no schema change.
        photos: {
          create: input.photoPaths.map((storagePath, sortOrder) => ({ storagePath, sortOrder })),
        },
        ...(quote ?? {}),
      },
      include: DEMANDE_INCLUDE,
    });

    // The creator is by definition the author, so `author` comes back null and `from` is
    // irrelevant - a client is never shown their distance to their own demande.
    return await this.present(demande, userId, null);
  }

  /**
   * `CF-16`. « Modifier la demande » - a FULL REPLACE of the eleven editable fields, gated by the
   * demande's state and by `CF-D7`'s two field classes, then diffed against the stored row.
   *
   * The body is structurally identical to `create`'s, so `updateDemandeSchema` says nothing about
   * WHICH fields may move: that depends on the stored status and the live offer count, and is
   * enforced here against the row.
   */
  async update(userId: string, id: string, input: UpdateDemandeInput): Promise<DemandeDto> {
    await this.assertClientEnabled(userId, 'modifier votre demande');
    await assertBasicVerified(this.prisma, userId, 'edit');

    // Ownership is in the WHERE, not a fetch-then-compare, so another author's demande 404s
    // indistinguishably from a nonexistent one and ids stay non-enumerable - the rule
    // `offers.withdraw` states explicitly in its own file. `deletedAt: null` puts an
    // already-deleted demande in the same bucket.
    const current = await this.prisma.demande.findFirst({
      where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      include: DEMANDE_INCLUDE,
    });
    if (!current) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // CF4-25. A private request is fixed once sent (an older build still shows « Modifier »).
    if (current.targetRepairerUserId) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_NOT_EDITABLE);
    }

    // ONE definition of the policy, shared with `app/demande/[id]/modifier.tsx`, so the screen
    // cannot offer a control the server refuses.
    const policy = demandeEditPolicy(current.status, current._count.offers);
    if (!policy.canEdit) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Cette demande n'est plus modifiable.");
    }

    const changed = changedDemandeFields(current, input);

    /**
     * 🛑 BEFORE ANY WRITE. Nothing moved, so there is no write, no `updatedAt` bump and - once the
     * notification lands - nobody is told. Without this, a client who opens the edit screen and
     * presses save without touching anything would notify every réparateur who quoted.
     *
     * Placed before the contract lock for readability rather than for behaviour, and the
     * distinction is worth stating so nobody defends the ordering with a reason it does not have:
     * `locked` below is DERIVED from `changed`, so an empty diff can never produce a locked field
     * and moving this after the lock would refuse nothing extra. The load-bearing half is that it
     * comes before the write.
     */
    if (changed.length === 0) return await this.present(current, userId, null);

    if (policy.contractLocked) {
      const locked = changed.filter((field) => DEMANDE_FIELD_CLASS[field] === 'contract');
      if (locked.length > 0) {
        // The `fields` map is what lets the form highlight the offending input, the way
        // `assertPhotosAttachable` passes `{ photoPaths: … }` for the wizard's FIELD_STEP map.
        throw new AppException(
          'UNPROCESSABLE_ENTITY',
          'Des offres ont été reçues, ces informations ne peuvent plus être modifiées.',
          Object.fromEntries(
            locked.map((field) => [field, "Modification impossible après réception d'une offre."]),
          ),
        );
      }
    }

    // Re-validate only what MOVED. The same rule `create` applies, imported rather than retyped:
    // if a category cannot be offered to a client it cannot be accepted from one.
    if (changed.includes('categoryId')) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, ...USABLE_CATEGORY },
        select: { id: true },
      });
      if (!category) {
        throw new AppException('UNPROCESSABLE_ENTITY', 'Cette catégorie est introuvable.');
      }
    }

    // Skipped when the paths are byte-identical to what is stored: those four checks already
    // passed on the way in, and the existence half costs a storage round trip. It tolerates
    // several draft prefixes already - its own comment notes « Two prefixes are legal » - so an
    // edit that adds a photo from a fresh wizard session needs no new machinery.
    const photosChanged = changed.includes('photoPaths');
    if (photosChanged) {
      await this.assertPhotosAttachable(input.photoPaths, userId);
    }

    /**
     * 🛑 GEOCODE ONLY WHEN THE POSTAL CODE ACTUALLY MOVED, and carry the stored coordinates
     * forward otherwise. `lookupPostalCode` is best-effort and answers null on any failure, so
     * re-running it against an UNCHANGED code would let one transient BAN outage overwrite good
     * coordinates with null. That is a silent data regression: nothing errors, nothing logs, and
     * it stays invisible until distance sorting quietly stops working for this demande.
     */
    const postalCodeChanged = changed.includes('postalCode');
    const coords = postalCodeChanged
      ? await this.geocode.lookupPostalCode(input.postalCode)
      : null;

    const updated = await this.prisma.demande.update({
      where: { id: current.id },
      data: {
        categoryId: input.categoryId,
        brand: input.brand ?? null,
        model: input.model ?? null,
        title: input.title,
        description: input.description,
        parts: input.parts,
        mode: input.mode,
        budgetCents: effectiveBudgetCents(input),
        locationLabel: input.locationLabel,
        postalCode: input.postalCode,
        lat: postalCodeChanged ? (coords?.lat ?? null) : current.lat,
        lng: postalCodeChanged ? (coords?.lng ?? null) : current.lng,
        // ONE nested write and only when the paths moved, so photos can never be half-replaced -
        // Prisma wraps a nested write in a single transaction, the reasoning `create()` records
        // just above. `DemandePhoto` has no `deletedAt` and cascades, so this is a hard delete
        // plus a re-create; the storage objects behind removed photos are left behind, the same
        // residual an abandoned wizard leaves.
        //
        // Absent from `data` entirely when nothing moved, rather than a no-op `deleteMany`: a
        // title edit must not churn every photo row and renumber it.
        ...(photosChanged
          ? {
              photos: {
                deleteMany: {},
                create: input.photoPaths.map((storagePath, sortOrder) => ({
                  storagePath,
                  sortOrder,
                })),
              },
            }
          : {}),
      },
      include: DEMANDE_INCLUDE,
    });

    // AFTER the write and outside any transaction, matching `offers.service.ts:create`:
    // `emit()` never throws, so a notification that cannot be written loses itself and not
    // the edit. Only réparateurs with a LIVE offer are told - a withdrawn or rejected offer
    // is not work this change affects.
    const quoting = await this.prisma.offer.findMany({
      // 🛑 LIVE, NOT ACCEPTABLE. This is the NOTIFICATION list. A suspended réparateur is
      // still told the demande he quoted has changed - that is what makes the suspension
      // self-healing, because on reactivation he knows to re-quote. B2 spec §5.2.
      where: { demandeId: id, ...LIVE_OFFER_WHERE },
      select: { repairerUserId: true },
    });
    for (const o of quoting) {
      // emit() never throws in production (it has an internal try-catch), but this guards
      // against any hypothetical failure path so a notification that cannot be written loses
      // itself and not the edit.
      try {
        await this.notifications.emit({
          userId: o.repairerUserId,
          // He receives this wearing the réparateur hat whatever mode his app is in.
          mode: 'REPAIRER',
          type: 'DEMANDE_UPDATED',
          // No actorName: the copy says « Le client », following OFFER_DECLINED, because the
          // réparateur has no relationship with this client and a client display name has no
          // precedent in this codebase.
          actorName: null,
          subject: updated.title,
          demandeId: id,
        });
      } catch (error) {
        // Logged but not re-thrown: a notification failure must not fail the edit.
        console.error('[demandes] failed to notify repairer %s of edit to %s', o.repairerUserId, id, error);
      }
    }

    // The editor is by definition the author, so `author` comes back null and `from` is
    // irrelevant, exactly as in `create`.
    return await this.present(updated, userId, null);
  }

  async listMine(userId: string): Promise<DemandeListItem[]> {
    const rows = await this.prisma.demande.findMany({
      where: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        locationLabel: true,
        createdAt: true,
        category: { select: { labelFr: true } },
        // ACCEPTABLE: `offerCount` on the CLIENT's own demandes list. It must agree with the
        // detail screen's count, which `DEMANDE_INCLUDE` builds from the same predicate.
        _count: { select: { offers: { where: ACCEPTABLE_OFFER_WHERE } } },
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storagePath: true } },
        commandes: {
          select: {
            id: true,
            status: true,
            step: true,
            delivery: true,
            createdAt: true,
            refundedCents: true,
            totalCents: true,
            cancellationRequestedAt: true,
            // V8 `Q8-08`: read only as `pickCommande`'s author-only `hasStripeTransfer`.
            stripeTransferId: true,
            dispute: { select: { status: true } },
          },
        },
        ...QUOTE_COLUMNS_SELECT,
      },
    });

    // ONE call for the WHOLE list, not one per row. `take: 1` in the query above means a client
    // with ten demandes signs at most ten paths, and always in a single request.
    const firsts = rows
      .map((r) => r.photos[0]?.storagePath)
      .filter((p): p is string => p !== undefined);
    const signed = await storageGateway().createSignedReadUrls(firsts, READ_URL_TTL_SECONDS);
    const quotes = await this.quoteInfos(rows);

    return rows.map((r) => {
      const quoteRequest = quotes.get(r.id) ?? null;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        categoryLabelFr: r.category.labelFr,
        locationLabel: r.locationLabel,
        offerCount: r._count.offers,
        // V8 `Q8-08`: his own demandes, so he may see whether the payout left (« Terminée »).
        commande: pickCommande(
          r.commandes.map((c) => ({ ...c, disputeOpen: isDisputeOpen(c.dispute) })),
          { withTransfer: true },
        ),
        // Null when there is no photo AND when its object has gone: the list thumbnail has one
        // absent state, so it does not need to tell those apart.
        photoUrl: r.photos[0] ? (signed.get(r.photos[0].storagePath) ?? null) : null,
        quoteRequest,
        isPrivate: quoteRequest !== null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * CF4-24. Another client's open PUBLIC demandes, read-only (spec §4.2.1). Any signed-in
   * user - no réparateur mode. Its own select and mapper, so this surface cannot inherit a
   * field from `DemandeDto` or `FeedItem`.
   */
  async browse(userId: string, query: BrowseQuery): Promise<PublicDemandeView[]> {
    const categoryFilter = query.categoryId
      ? { categoryId: { in: await this.categoryIdsFor(query.categoryId) } }
      : {};
    const page = query.page ?? 1;

    const rows = await this.prisma.demande.findMany({
      where: {
        status: 'OPEN',
        authorUserId: { not: userId },
        // PUB-33 (DECP-23): only demandes from the viewer's side of the store-review seal.
        author: await viewerSideWhere(this.prisma, userId),
        ...PUBLIC_DEMANDE_WHERE,
        ...(await searchFilter(this.prisma, query.q, false)),
        ...categoryFilter,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * BROWSE_PAGE_SIZE,
      take: BROWSE_PAGE_SIZE,
      select: BROWSE_SELECT,
    });

    const paths = rows.flatMap((r) => r.photos.map((p) => p.storagePath));
    const signed = await storageGateway().createSignedReadUrls(paths, READ_URL_TTL_SECONDS);
    return rows.map((r) => toPublicDemandeView(r, signed));
  }

  /**
   * CF4-25. `QuoteRequestInfo` for every private row, keyed by demande id. ONE user read for
   * the whole batch, and none when no row is private. The réparateur's name is the one the
   * client already knows him by - `publicIdentity`, as on his profile.
   */
  private async quoteInfos(
    rows: ReadonlyArray<{ id: string } & Partial<QuoteColumns>>,
  ): Promise<Map<string, QuoteRequestInfo>> {
    const out = new Map<string, QuoteRequestInfo>();
    const targets = [...new Set(rows.map((r) => r.targetRepairerUserId).filter((t): t is string => !!t))];
    if (targets.length === 0) return out;

    const users = await this.prisma.user.findMany({
      where: { id: { in: targets } },
      select: { id: true, username: true, repairerProfile: { select: { displayName: true } } },
    });
    const names = new Map(
      users.map((u) => [
        u.id,
        publicIdentity({ username: u.username, displayName: u.repairerProfile?.displayName ?? null }),
      ]),
    );

    for (const r of rows) {
      if (!r.targetRepairerUserId) continue;

      out.set(r.id, {
        repairer: { userId: r.targetRepairerUserId, displayName: names.get(r.targetRepairerUserId) ?? '' },
        preferredTravel: r.quotePreferredTravel ?? null,
        details: r.quoteDetails ?? null,
        expiresAt: r.quoteExpiresAt?.toISOString() ?? null,
        closedReason: r.quoteClosedReason ?? null,
        declineNote: r.quoteDeclineNote ?? null,
      });
    }
    return out;
  }

  async feed(userId: string, query: FeedQuery): Promise<FeedItem[]> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { repairerEnabled: true },
    });
    if (!profile?.repairerEnabled) {
      throw new AppException(
        'FORBIDDEN',
        'Activez le mode réparateur pour proposer une offre.',
      );
    }

    const me = await this.prisma.repairerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { lat: true, lng: true },
    });
    const from: Coords | null =
      me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null;

    // Search NARROWS what the feed already permits. Every clause below is a
    // sibling of status/deletedAt/authorUserId in the same `where`, so Prisma
    // ANDs them. Folding q into those filters' own OR would leak demandes the
    // viewer may not read.
    const search = await searchFilter(this.prisma, query.q);

    const categoryFilter = query.categoryId
      ? { categoryId: { in: await this.categoryIdsFor(query.categoryId) } }
      : {};

    // CF4-26 « Pour moi » (spec §4.4). Under `AND` rather than spread: it carries its own
    // `categoryId`, and spreading it would silently REPLACE `categoryFilter`'s instead of
    // intersecting with it. No declared category = nothing matches, and nothing is read.
    let matching: { AND: Prisma.DemandeWhereInput[] } | Record<string, never> = {};
    if (query.matching === '1') {
      const ids = await loadMatchingCategoryIds(this.prisma, userId);
      if (ids.length === 0) return [];
      matching = { AND: [matchingDemandeWhere(userId, ids)] };
    }

    const rows = await this.prisma.demande.findMany({
      where: {
        status: 'OPEN',
        // Never your own: a réparateur bidding on their own demande is
        // nonsensical and is rejected on write anyway.
        authorUserId: { not: userId },
        // PUB-33 (DECP-23): only demandes from the viewer's side of the store-review seal.
        author: await viewerSideWhere(this.prisma, userId),
        // CF4-25: public only, even for a private request's own target (it has its own list).
        ...PUBLIC_DEMANDE_WHERE,
        ...search,
        ...categoryFilter,
        ...matching,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        locationLabel: true,
        postalCode: true,
        brand: true,
        model: true,
        mode: true,
        budgetCents: true,
        lat: true,
        lng: true,
        createdAt: true,
        category: { select: { labelFr: true } },
        /**
         * ACCEPTABLE: `assembleFeedItems` turns this array into `offerCount`, the competitive
         * number every OTHER réparateur reads off the card. A suspended réparateur's offer is
         * not competition, and this count has to agree with the client's own.
         *
         * 🛑 IT ALSO FEEDS `hasMyOffer`, WHICH THE B2 SPEC §5.2 TABLE DOES NOT MENTION, and that
         * makes this site straddle both of §5.2's columns rather than sit cleanly in the filtered
         * one. Consequence, measured and accepted rather than overlooked: a SUSPENDED réparateur
         * reading his own feed sees `hasMyOffer: false` on a demande he has already quoted, so the
         * card offers « Proposer une offre » again. Nobody else's view moves - the clause only
         * excludes the viewer's own row when the viewer is himself suspended. It cannot produce a
         * duplicate: guard 6 in `offers.service.ts` refuses him with « Votre compte réparateur est
         * suspendu. » before the ALREADY_OFFERED check, and `Offer`'s partial unique on
         * `[demandeId, repairerUserId] where SENT and not deleted` refuses it at the database
         * besides. He also still sees the offer itself in `offers.listMine`, which filters no
         * status. Narrowing this to `OR: [ACCEPTABLE, { …LIVE, repairerUserId: userId }]` would
         * restore the badge at the cost of showing him a count nobody else sees; left as a
         * follow-up rather than decided here.
         */
        offers: {
          where: ACCEPTABLE_OFFER_WHERE,
          select: { repairerUserId: true },
        },
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storagePath: true } },
      },
    });

    // ONE signing call for the WHOLE feed, for the same reason `listMine` does it that
    // way: `take: 1` above caps this at one path per row, and batching keeps it at one
    // request however long the feed gets.
    const firsts = rows
      .map((r) => r.photos[0]?.storagePath)
      .filter((p): p is string => p !== undefined);
    const signed = await storageGateway().createSignedReadUrls(firsts, READ_URL_TTL_SECONDS);

    const items = assembleFeedItems(rows, from, userId, signed);

    // Sorting stays in JavaScript because distance is computed above by
    // Haversine and cannot be an `orderBy`. The SQL ordering is createdAt desc
    // in every case, and Array.prototype.sort is stable, so these are stable
    // post-sorts with recency as the free tiebreak.
    //
    // An absent sort resolves to today's behaviour exactly: nearest-first when
    // the réparateur is located, newest-first otherwise.
    const effectiveSort = query.sort ?? (from ? 'distance' : 'recentes');
    if (effectiveSort === 'distance') {
      // Runs even when `from` is null, which is safe rather than an oversight:
      // every distanceKm is then null, the comparator returns 0 throughout, and
      // the recency ordering survives untouched.
      items.sort(byDistance);
    } else if (effectiveSort === 'prix') {
      items.sort(byPrice);
    }

    return items;
  }

  async getForViewer(userId: string, id: string): Promise<DemandeDto> {
    // Either you authored it, or it is a private request addressed to you (CF4-25 - readable
    // in any status, and whether or not you are still in réparateur mode, so the request can
    // still be read while it expires or is cancelled), or you favorited it, or it is an
    // OPEN PUBLIC demande (readable by clients and réparateurs alike). All in the WHERE,
    // so anything you may not read 404s exactly as a nonexistent id would and ids stay unenumerable.
    const branches: Prisma.DemandeWhereInput[] = [
      { ...VISIBLE_DEMANDE_WHERE, authorUserId: userId },
      { ...VISIBLE_DEMANDE_WHERE, targetRepairerUserId: userId },
      { ...PUBLIC_DEMANDE_WHERE, status: 'OPEN' },
      { ...PUBLIC_DEMANDE_WHERE, favoritedBy: { some: { userId } } },
    ];
    // PUB-33 (DECP-23): across the store-review seal a demande does not exist, so it 404s like any other.
    const where: Prisma.DemandeWhereInput = { id, OR: branches, author: await viewerSideWhere(this.prisma, userId) };

    const demande = await this.prisma.demande.findFirst({ where, include: DEMANDE_INCLUDE });
    if (!demande) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // The viewer's own coordinates, for `distanceKm`. Read AFTER the demande so an unauthorised
    // id still 404s without a second query, and only when there is something to measure to.
    const me = await this.prisma.repairerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { lat: true, lng: true },
    });
    const from: Coords | null =
      me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null;

    return await this.present(demande, userId, from);
  }

  /**
   * The four checks of the design's section 8, and they are the security of this feature.
   * Everything else about photos is plumbing.
   *
   * `photoPaths` is a client-supplied array of strings. Nothing about it can be trusted merely
   * because the same client was handed a signed URL earlier: it can submit any string at all.
   *
   *   1. COUNT      -- at most MAX_DEMANDE_PHOTOS.
   *   2. PREFIX     -- every path must sit under `demandes/{callerUserId}/`. THIS is the check
   *                    that stops one client attaching another client's photos to their own
   *                    demande. It must never be relaxed.
   *   3. EXISTENCE  -- every path must really be in the bucket. Without it a client can submit
   *                    a path it signed and never uploaded, and the demande renders a broken
   *                    image forever.
   *   4. UNIQUENESS -- no duplicates, so one object cannot occupy two `sortOrder` slots.
   *
   * 1, 2 and 4 are offline and free, in `checkPhotoPaths`. Only 3 needs the network, so it runs
   * second and only if the cheap checks passed.
   *
   * The refusal names `photoPaths` in `fields`, which the wizard's own FIELD_STEP map uses to
   * send the user back to the step that owns the offending input rather than stranding them on
   * the recap.
   */
  private async assertPhotosAttachable(photoPaths: string[], userId: string): Promise<void> {
    const shape = checkPhotoPaths(photoPaths, userId);
    if (!shape.ok) {
      throw new AppException('UNPROCESSABLE_ENTITY', shape.message, { photoPaths: shape.message });
    }

    if (photoPaths.length === 0) return;

    // ONE list call per distinct draft prefix -- normally exactly one, since a wizard session
    // has a single draftId -- rather than a HEAD per path. Two prefixes are legal (a client who
    // abandoned and resumed) and simply cost a second list.
    const present = new Set<string>();
    for (const prefix of draftPrefixesOf(photoPaths)) {
      for (const object of await storageGateway().listPrefix(prefix)) {
        // `listPrefix` returns names RELATIVE to the prefix -- that contract is stated on the
        // gateway interface, and both implementations normalise to it.
        present.add(`${prefix}/${object.name}`);
      }
    }

    const missing = photoPaths.filter((p) => !present.has(p));
    if (missing.length > 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Photo introuvable.', {
        photoPaths: 'Photo introuvable.',
      });
    }
  }

  /**
   * `CF-17`. Soft delete - writes `Demande.deletedAt` and nothing else. Offers stay `SENT` and
   * untouched: writing `WITHDRAWN` on a réparateur's behalf was explicitly rejected.
   */
  async softDelete(userId: string, id: string): Promise<void> {
    await this.assertClientEnabled(userId, 'supprimer votre demande');
    // 🛑 NO `assertBasicVerified` here, and the asymmetry with `update` is deliberate. A user
    // must never be locked out of retracting their own listing. Editing changes what the
    // public sees, which is what the publish gate governs; deleting only removes it.

    const current = await this.prisma.demande.findFirst({
      where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      select: {
        status: true,
        title: true,
        targetRepairerUserId: true,
        // A count, not a fetch: nothing needs the row, only whether one exists. Same shape
        // as `offers.withdraw`'s guard.
        // ACCEPTABLE on the offers half: this is the GUARD feeding
        // `demandeEditPolicy(...).canDelete`, so it must read the same number the client is
        // shown. Filtering the count but not the guard is the shape that walls him out of
        // deleting his own demande beside a visible « 0 offre ». B2 spec §5.2.
        _count: {
          select: {
            commandes: { where: { status: 'PENDING_PAYMENT' } },
            offers: { where: ACCEPTABLE_OFFER_WHERE },
          },
        },
      },
    });
    // Also what makes a SECOND delete 404 rather than re-stamp deletedAt.
    if (!current) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // CF4-25. A soft delete would take the request out of the client's history; the
    // private flow has its own close (`quote/cancel`), which keeps it with a reason.
    if (current.targetRepairerUserId) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_USE_CANCEL);
    }

    if (!demandeEditPolicy(current.status, current._count.offers).canDelete) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Cette demande ne peut plus être supprimée.");
    }

    // 🛑 The client is on the Stripe-hosted page right now. Deleting would strand a live
    // payment against a demande that no longer exists, so the state is made unreachable
    // rather than compensated. An ABANDONED or expired attempt does not count - only one in
    // flight. Mirrors `offers.withdraw`.
    if (current._count.commandes > 0) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'Un paiement est en cours sur cette demande.',
      );
    }

    // Reads the offers BEFORE the write: after it, `listMine`'s new filter would still find
    // them (this query does not filter on the demande) but reading first keeps the intent
    // obvious and the ordering independent of that filter.
    const quoting = await this.prisma.offer.findMany({
      // 🛑 LIVE, NOT ACCEPTABLE. The NOTIFICATION list again, and the asymmetry with THIS METHOD'S
      // OWN DELETE GUARD - the `_count.offers` feeding `demandeEditPolicy(...).canDelete` earlier
      // in `softDelete`, which IS filtered - is the whole design: a suspended réparateur's offer
      // stops binding the client, and he is still told the demande was deleted so he knows there
      // is nothing to come back to. B2 spec §5.2. (An earlier draft said « eleven lines above »;
      // it is nearer thirty, and a line distance is a claim that goes stale on the next comment.)
      where: { demandeId: id, ...LIVE_OFFER_WHERE },
      select: { repairerUserId: true },
    });

    // `deletedAt` AND NOTHING ELSE, mirroring the admin moderation pattern. Offers stay SENT:
    // writing WITHDRAWN for a réparateur was rejected in CF-D7 part 2.
    await this.prisma.demande.update({ where: { id }, data: { deletedAt: new Date() } });

    // 🛑 NO TRY/CATCH WRAPPING THE EMIT LOOP, unlike `update()` which has one. `emit()` genuinely
    // cannot throw - its whole body is inside a try/catch that logs and returns - so neither
    // guard is required. They exist for symmetry, not necessity, and the asymmetry between two
    // functions in one file invites the next reader to think one is wrong. This comment states
    // why there is no guard here.
    for (const o of quoting) {
      await this.notifications.emit({
        userId: o.repairerUserId,
        mode: 'REPAIRER',
        type: 'DEMANDE_WITHDRAWN',
        actorName: null,
        subject: current.title,
        // Carried so the row is attributable, even though `destinationFor` returns null for
        // this type - the demande is gone, so any destination would be a guaranteed 404.
        demandeId: id,
      });
    }
  }

  /**
   * CF4-27 (spec §4.2, §4.3, I3). The pre-payment cancel: no approval needed, unlike a
   * post-payment request (Task 4). Sets the demande CANCELLED (kept in « Mes réparations »
   * as « Annulée » via `repairStatus`'s existing CANCELLED exit), closes its SENT offers as
   * REJECTED - never WITHDRAWN on the réparateur's behalf, the same rule `softDelete` follows -
   * and notifies those réparateurs with the existing `DEMANDE_WITHDRAWN` copy (I3: reused
   * rather than duplicated, and correct here too since a cancelled demande 404s for a
   * réparateur, same as a deleted one).
   */
  async cancel(userId: string, id: string): Promise<{ ok: true }> {
    await this.assertClientEnabled(userId, 'annuler votre demande');

    const current = await this.prisma.demande.findFirst({
      where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      select: {
        status: true,
        title: true,
        targetRepairerUserId: true,
        _count: {
          select: {
            commandes: { where: { status: 'PENDING_PAYMENT' } },
            offers: { where: ACCEPTABLE_OFFER_WHERE },
          },
        },
      },
    });
    if (!current) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // CF4-25. A private request has its own close (`quote/cancel`), which keeps a reason -
    // same guard `softDelete` uses for the same demande shape.
    if (current.targetRepairerUserId) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_USE_CANCEL);
    }

    if (current.status !== 'OPEN') {
      throw new AppException('CONFLICT', "Cette demande n'est plus ouverte.");
    }

    // I3: a demande with no live offer keeps « Supprimer » - cancelling it would leave the
    // client with two affordances doing the same thing.
    if (current._count.offers === 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_USE_DELETE);
    }

    // I4: refused while a checkout is in flight, same reasoning as `softDelete`'s equivalent
    // guard - stranding a live payment against a demande with no offers left is worse than
    // asking the client to wait.
    if (current._count.commandes > 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_PAYMENT_IN_FLIGHT);
    }

    // Reads the offers BEFORE the write, same reasoning as `softDelete`: the recipient set is
    // obvious and independent of any later filter change.
    const quoting = await this.prisma.offer.findMany({
      where: { demandeId: id, ...LIVE_OFFER_WHERE },
      select: { repairerUserId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Conditional on OPEN and no PENDING_PAYMENT commande: the loser of a race with a
      // checkout that just started, or a second cancel, gets the same 409 as an already-closed
      // demande (spec §4.2's transition table).
      const closed = await tx.demande.updateMany({
        where: { id, status: 'OPEN', commandes: { none: { status: 'PENDING_PAYMENT' } } },
        data: { status: 'CANCELLED' },
      });
      if (closed.count === 0) {
        throw new AppException('CONFLICT', "Cette demande n'est plus ouverte.");
      }
      await tx.offer.updateMany({
        where: { demandeId: id, ...LIVE_OFFER_WHERE },
        data: { status: 'REJECTED' },
      });
    });

    for (const o of quoting) {
      await this.notifications.emit({
        userId: o.repairerUserId,
        mode: 'REPAIRER',
        type: 'DEMANDE_WITHDRAWN',
        actorName: null,
        subject: current.title,
        demandeId: id,
      });
    }

    return { ok: true };
  }

  /**
   * `action` completes « Activez le mode client pour … », and it exists because `CF-16` added a
   * caller for which the original sentence was false: « pour publier une demande » is wrong when
   * the demande is already published and the client is editing it.
   *
   * A closed union rather than a free string, so the copy lives in the type and a new caller has
   * to add its own clause here instead of inventing an ungrammatical tail.
   */
  private async assertClientEnabled(
    userId: string,
    action: 'publier une demande' | 'modifier votre demande' | 'supprimer votre demande' | 'annuler votre demande',
  ): Promise<void> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { clientEnabled: true, activeMode: true },
    });
    if (!profile) {
      throw new AppException('FORBIDDEN', `Activez le mode client pour ${action}.`);
    }

    // `activeMode: 'CLIENT'` is enough on its own. A réparateur-first account is created with
    // `clientEnabled: false`, and `updateModes` lets him switch to client mode without flipping the
    // flag, so the screen showed « Client » while this gate (which read the flag alone) refused him
    // (V2). Read-only on purpose: a gate that also wrote `clientEnabled` would silently re-enable a
    // mode on any publish, edit, delete or cancel, with no audit trail. The mode switch screen sends
    // the flag, so new switches converge on their own.
    if (profile.clientEnabled || profile.activeMode === 'CLIENT') return;

    throw new AppException('FORBIDDEN', `Activez le mode client pour ${action}.`);
  }

  /**
   * A category filter has to include the target's children, because a demande
   * attaches to any node. The taxonomy is exactly two levels deep - 8 parents,
   * 36 children - so this is one expansion and not a recursive walk.
   *
   * Note « Autres » is a parent with no children and is itself a valid
   * destination, so an empty result here is normal rather than a failure.
   */
  private async categoryIdsFor(categoryId: string): Promise<string[]> {
    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId, active: true },
      select: { id: true },
    });
    return [categoryId, ...children.map((c) => c.id)];
  }

  /**
   * `viewerUserId` and `from` are REQUIRED rather than optional, deliberately: `author` must be
   * suppressed for the owner and `distanceKm` needs the viewer's coordinates, and a default
   * would make the safe behaviour the one a caller has to remember to ask for. Every caller
   * knows who is looking - `create` is always the author, `getForViewer` has the session.
   */
  private async present(
    d: {
      id: string; title: string; description: string; brand: string | null; model: string | null;
      parts: DemandeDto['parts']; mode: DemandeDto['mode']; budgetCents: number | null;
      locationLabel: string; postalCode: string; status: DemandeDto['status']; createdAt: Date;
      authorUserId: string;
      lat: number | null; lng: number | null;
      /**
       * REQUIRED, and it feeds `isPrivate`: an optional column that a caller forgot would read as
       * `undefined`, hence « public », which for a privacy flag fails open.
       */
      targetRepairerUserId: string | null;
      category: { id: string; slug: string; labelFr: string };
      photos: { storagePath: string }[];
      author: { username: string; createdAt: Date };
      commandes: {
        status: CommandeStatus;
        step: CommandeStep | null;
        id: string;
        delivery: DeliveryMode;
        dispute: { status: DisputeStatus } | null;
        createdAt: Date;
        refundedCents: number | null;
        totalCents: number;
        cancellationRequestedAt: Date | null;
      }[];
      /**
       * `CF-16`. REQUIRED and not optional, deliberately: `DEMANDE_INCLUDE` always asks for it,
       * so every real caller has it, and an optional one would let `offerCount` fall back to a
       * plausible-looking 0 - which `demandeEditPolicy` reads as « no live offer, contract
       * fields unlocked ». That failure would silently unlock a locked edit.
       */
      _count: { offers: number };
    },
    viewerUserId: string,
    from: Coords | null,
  ): Promise<DemandeDto> {
    const paths = d.photos.map((p) => p.storagePath);
    // ONE batched call for every photo on this demande. Signing per path would turn a
    // ten-photo demande into ten round trips to storage on a single GET.
    const signed = await storageGateway().createSignedReadUrls(paths, READ_URL_TTL_SECONDS);
    const quoteRequest = (await this.quoteInfos([d])).get(d.id) ?? null;

    return {
      id: d.id,
      title: d.title,
      description: d.description,
      brand: d.brand,
      model: d.model,
      parts: d.parts,
      mode: d.mode,
      budgetCents: d.budgetCents,
      locationLabel:
        d.authorUserId === viewerUserId
          ? d.locationLabel
          : formatPublicLocation(d.locationLabel, d.postalCode),
      postalCode: d.postalCode,
      status: d.status,
      // The ladder's other input. `pickCommande` chooses among the rows an abandoned
      // checkout leaves behind; see that function for why this is a choice.
      // V8 `Q8-08`: `hasStripeTransfer` for the author only; this DTO also reaches réparateurs.
      commande: pickCommande(
        d.commandes.map((c) => ({ ...c, disputeOpen: isDisputeOpen(c.dispute) })),
        { withTransfer: d.authorUserId === viewerUserId },
      ),
      category: d.category,
      offerCount: d._count.offers,
      // Non-null on exactly the condition that makes `author` null below: the viewer is the
      // author. Do not add a third signal for the same fact.
      //
      // 🛑 `paths` and NOT the signed map, so an entry whose object is gone is KEPT with a null
      // url. Its length therefore always equals the number of DemandePhoto rows, which is what
      // makes an index here address a row - see the field's doc on `DemandeDto` and the
      // consequence note on `photoUrls` just below, which named this feature as the moment it
      // would matter.
      photos:
        d.authorUserId === viewerUserId
          ? paths.map((p) => ({ path: p, url: signed.get(p) ?? null }))
          : null,
      // A path with no object behind it is DROPPED, never returned raw and never fabricated: a
      // raw storage path against a private bucket renders as a broken image, which is worse for
      // the reader than a photo that is simply absent. `createSignedReadUrls` omits what it
      // cannot sign, so filtering undefined here is the whole mechanism.
      //
      // 🛑 CONSEQUENCE, and it constrains future work: this array can be SHORTER than the
      // number of DemandePhoto rows, so an index here does NOT identify a row. Fine today,
      // because the only consumers are a read-only gallery and a list thumbnail. The moment
      // anything lets a client DELETE or REORDER a photo, this must become
      // `Array<{ id, url }>` or `Array<string | null>` - index-based addressing would target
      // the wrong photo whenever one object is missing.
      //
      // ✅ RESOLVED BY `CF-16`, AND NOT BY CHANGING THIS FIELD. The edit screen addresses rows
      // through the author-only `photos` above, which pairs each path with its url and keeps an
      // unsignable entry. So this array stays SHORTER-THAN-THE-ROWS on purpose, for the two
      // consumers that want exactly that: a read-only gallery and a list thumbnail. Do not
      // « finish » the note above by widening this type - it would gain a null the gallery in
      // `app/demande/[id]/index.tsx` does not handle, for no consumer that needs it.
      photoUrls: paths.map((p) => signed.get(p)).filter((u): u is string => u !== undefined),
      // Rounded to one decimal by the SAME expression `feed` uses, so the two surfaces cannot
      // disagree about one demande's distance.
      distanceKm: (() => {
        const to: Coords | null = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
        const km = distanceKm(from, to);
        return km === null ? null : Math.round(km * 10) / 10;
      })(),
      // Null for the owner. See the field's doc on DemandeDto: it suppresses a card about
      // yourself AND gates the offer CTA, which a client can otherwise reach from a commande.
      author:
        d.authorUserId === viewerUserId
          ? null
          : { username: d.author.username, memberSince: d.author.createdAt.toISOString() },
      // CF4-25. Only the author and the target can reach a private row at all.
      quoteRequest,
      isPrivate: quoteRequest !== null,
      createdAt: d.createdAt.toISOString(),
    };
  }
}

/**
 * Assembles FeedItem DTOs from demande rows. Extracted from `feed()` for reuse in
 * `FavoritesService.listDemandes()`, so the two surfaces agree on how distances and offer
 * counts are computed.
 *
 * @param rows Query results matching the `feed()` select shape
 * @param from Viewer's coordinates (null if the viewer has no location)
 * @param userId Viewer's userId for computing `hasMyOffer`
 * @param signed Map of storage paths to signed read URLs
 */
export function assembleFeedItems(
  rows: Array<{
    id: string;
    title: string;
    locationLabel: string;
    postalCode?: string;
    brand: string | null;
    model: string | null;
    mode: 'OFFERS' | 'BUDGET';
    budgetCents: number | null;
    lat: number | null;
    lng: number | null;
    createdAt: Date;
    category: { labelFr: string };
    offers: Array<{ repairerUserId: string }>;
    photos: Array<{ storagePath: string }>;
  }>,
  from: Coords | null,
  userId: string,
  signed: Map<string, string>,
): FeedItem[] {
  return rows.map((r) => {
    const to: Coords | null =
      r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
    const km = distanceKm(from, to);
    return {
      id: r.id,
      title: r.title,
      categoryLabelFr: r.category.labelFr,
      locationLabel: formatPublicLocation(r.locationLabel, r.postalCode),
      brand: r.brand,
      model: r.model,
      mode: r.mode,
      budgetCents: r.budgetCents,
      distanceKm: km === null ? null : Math.round(km * 10) / 10,
      offerCount: r.offers.length,
      hasMyOffer: r.offers.some((o) => o.repairerUserId === userId),
      // Same expression as `listMine`, for the same reason: null covers both "no photo"
      // and "its object has gone", which a thumbnail need not tell apart.
      photoUrl: r.photos[0] ? (signed.get(r.photos[0].storagePath) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
