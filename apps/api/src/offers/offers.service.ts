import { Injectable } from '@nestjs/common';
import {
  NO_REPAIRER_STATS,
  offersStillMatter,
  repairStatus,
  type CreateOfferInput,
  type MeResponse,
  type OfferDto,
  type OfferListItem,
  type ReceivedOfferListItem,
  type RepairerStats,
  publicIdentity,
  verifiedBadgeFor,
  WARRANTY_NONE,
  warrantyLabelFor,
  QUOTE_REQUEST_TTL_DAYS,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { pickCommande } from '../demandes/pick-commande.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';
import { PUBLIC_DEMANDE_WHERE, targetableByRepairerWhere, VISIBLE_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { distanceKm, type Coords } from '../geo/haversine.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  ACCEPTABLE_OFFER_WHERE,
  LIVE_OFFER_WHERE,
  UNSUSPENDED_REPAIRER_WHERE,
} from './offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide } from '../review-accounts/review-account.js';
import { repairerStats } from '../reviews/repairer-stats.js';
import { assertBasicVerified, assertIdentityVerified } from '../verification/gate.js';
import { assertUnderParticularCap } from '../verification/particular-quota.js';
import { Prisma } from '../generated/prisma/client.js';
import { QUOTE_NOT_OPEN } from '../quote-requests/quote-request-messages.js';

/** Shape every query in this service returns, so `present` has one input. */
const OFFER_INCLUDE = {
  repairer: {
    select: {
      username: true,
      // Level lives on the person, so it comes from Profile. displayName is
      // réparateur presentation and stays on RepairerProfile.
      profile: { select: { verificationLevel: true } },
      repairerProfile: { select: { displayName: true } },
    },
  },
} as const;

/**
 * The same shape plus the réparateur's coordinates, for the one query that
 * computes a distance. Named rather than spread over `OFFER_INCLUDE` inline:
 * the two differ only in the `repairerProfile` select, and an inline spread
 * would be silently replaced by the key that follows it, so a drift in the
 * common part would not be caught by the compiler.
 */
const OFFER_WITH_GEOGRAPHY = {
  repairer: {
    select: {
      ...OFFER_INCLUDE.repairer.select,
      repairerProfile: { select: { displayName: true, lat: true, lng: true } },
    },
  },
} as const;

/** Used by both the pre-check and the P2002 fallback, which must not disagree. */
const ALREADY_OFFERED = 'Vous avez déjà proposé une offre sur cette demande.';

/** Both withdrawal refusals say the same thing, and must not drift apart. */
const CANNOT_WITHDRAW = 'Cette offre ne peut plus être retirée.';

/**
 * §8.3's réparateur suspension, enforced at the point of writing an offer.
 *
 * Exported so users.service.ts's updateModes refusal uses the SAME sentence: two copies of
 * a user-facing string drift, and this one is the only thing telling a réparateur why the
 * app stopped accepting his work.
 */
export const REPAIRER_SUSPENDED = 'Votre compte réparateur est suspendu.';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, demandeId: string, input: CreateOfferInput): Promise<OfferDto> {
    await this.assertRepairerEnabled(userId);
    // BASIC before IDENTITY, deliberately: a NONE account is told to confirm its
    // e-mail or phone, which is the nearer step, rather than being sent to an
    // identity check it cannot complete without doing that first anyway.
    await assertBasicVerified(this.prisma, userId, 'offer');
    await assertIdentityVerified(this.prisma, userId, 'offer');
    // V7 A10 (U7): CGU art. 53's cap on a private individual. After identity, so a repairer who is
    // not yet verified is sent to the nearer step first.
    await assertUnderParticularCap(this.prisma, userId);
    // CF-31. Unflagged, unlike the two above - see the method's own comment.
    await this.assertWarrantyAllowed(userId, input.warrantyLabel);

    // CF4-25: a private request is offerable by its target only; anyone else gets the same
    // 404 as a nonexistent id.
    const demande = await this.prisma.demande.findFirst({
      where: { id: demandeId, ...targetableByRepairerWhere(userId) },
      select: {
        id: true,
        authorUserId: true,
        status: true,
        title: true,
        mode: true,
        budgetCents: true,
        targetRepairerUserId: true,
      },
    });
    if (!demande) throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    // PUB-33 (DECP-23): across the store-review seal the demande does not exist (404).
    await assertSameSide(this.prisma, userId, demande.authorUserId);

    if (demande.authorUserId === userId) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'Vous ne pouvez pas proposer une offre sur votre demande.',
      );
    }
    if (demande.status !== 'OPEN') {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Cette demande n'accepte plus d'offres.",
      );
    }

    // CF4-25 (H3): on a private request the client's budget is « éventuel » - indicative - and
    // the réparateur quotes his own price, so the fixed-budget rule applies to public demandes only.
    if (
      demande.targetRepairerUserId == null &&
      demande.mode === 'BUDGET' &&
      demande.budgetCents != null &&
      input.priceCents !== demande.budgetCents
    ) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Le montant de l'offre doit correspondre au budget fixé par le client.",
        { priceCents: "Le montant de l'offre doit correspondre au budget fixé par le client." },
      );
    }

    const live = await this.prisma.offer.findFirst({
      // 🛑 LIVE, NOT ACCEPTABLE. This is HIS OWN offer, and hiding it from himself is not a
      // suspension - it is a duplicate. `repairerUserId` is the scalar FK, so it does not
      // collide with the `repairer:` relation key ACCEPTABLE carries.
      //
      // The secondary consequence is smaller than an earlier draft of this comment claimed, and
      // the correction is on the record because a false reason stops the next reader checking:
      // ACCEPTABLE here would let a suspended réparateur past this pre-check, but the `.catch`
      // below maps the partial unique index's P2002 to the SAME `CONFLICT` and the SAME
      // ALREADY_OFFERED sentence, so the client-visible outcome would be identical. What it would
      // actually cost is one extra round trip to the database. Unreachable today either way -
      // guard 6 above refuses him first - and it must not become reachable.
      where: { demandeId, repairerUserId: userId, ...LIVE_OFFER_WHERE },
      select: { id: true },
    });
    if (live) throw new AppException('CONFLICT', ALREADY_OFFERED);

    const data = {
      priceCents: input.priceCents,
      delayHours: input.delayHours,
      warrantyLabel: input.warrantyLabel,
      partsLabel: input.partsLabel,
      travel: input.travel,
      acceptsParcel: input.acceptsParcel,
      comment: input.comment ?? null,
      status: 'SENT' as const,
    };

    // A new row every time, never a revive. A withdrawn offer is the client's
    // record of what was proposed, so overwriting it would destroy the history
    // he asked for. Uniqueness is narrowed to live offers, so the insert itself
    // is what enforces "one offer on the table at a time".
    const insert = (client: Pick<Prisma.TransactionClient, 'offer'>) =>
      client.offer
      .create({
        data: { demandeId, repairerUserId: userId, ...data },
        include: OFFER_INCLUDE,
      })
      .catch((e: unknown) => {
        // The check above is check-then-insert, so a double submit can pass it
        // twice - and offre.tsx leaves exactly that window open, because
        // createOffer.isPending is false while the request is in flight. The
        // partial unique index is the real guard; without this branch its P2002
        // would surface as the generic French fallback instead of the 409 the
        // first caller already gets.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppException('CONFLICT', ALREADY_OFFERED);
        }
        throw e;
      });

    /**
     * CF4-25. On a PRIVATE request the quote is admitted by a write conditional on OPEN that
     * also stops the 7-day timer, in the same transaction as the insert. That is what makes a
     * quote racing the expiry cron, a decline or a client cancel come out one way only: the
     * transition that closes the request writes the same row first-or-second, and whichever is
     * second sees the other's result (Review Focus 2). Public demandes keep the plain insert.
     */
    const offer =
      demande.targetRepairerUserId != null
        ? await this.prisma.$transaction(async (tx) => {
            const open = await tx.demande.updateMany({
              where: { id: demandeId, status: 'OPEN', targetRepairerUserId: userId },
              data: { quoteExpiresAt: null },
            });
            if (open.count === 0) throw new AppException('CONFLICT', QUOTE_NOT_OPEN);
            return insert(tx);
          })
        : await insert(this.prisma);

    // AFTER the insert and outside any transaction, per the design §8: emit() never
    // throws, so a notification that cannot be written loses itself and not the offer.
    //
    // The name is snapshotted with the same precedence `present` uses below - displayName,
    // else the account name - because a later rename must not rewrite this row.
    //
    // Mode is CLIENT unconditionally: the demande author receives this wearing the client
    // hat whatever mode his app happens to be in.
    await this.notifications.emit({
      userId: demande.authorUserId,
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: publicIdentity({
        username: offer.repairer.username,
        displayName: offer.repairer.repairerProfile?.displayName ?? null,
      }),
      subject: demande.title,
      amountCents: offer.priceCents,
      demandeId: demande.id,
    });

    // The author's own real stats rather than zeroes. Nothing renders this response's
    // rating today, and passing NO_REPAIRER_STATS here would be a FALSE value in a DTO
    // excused by a comment about what does not read it -- which is this project's own
    // recurring defect pointed inward. One aggregate on a rare write is cheaper than
    // that.
    const stats = await repairerStats(this.prisma, [userId]);
    return this.present(offer, null, stats.get(userId) ?? NO_REPAIRER_STATS);
  }

  async withdraw(userId: string, offerId: string): Promise<void> {
    // Ownership is in the WHERE, so another réparateur's offer 404s
    // indistinguishably from a nonexistent one and ids are not enumerable.
    const offer = await this.prisma.offer.findFirst({
      where: {
        id: offerId,
        repairerUserId: userId,
        deletedAt: null,
        demande: VISIBLE_DEMANDE_WHERE,
      },
      select: {
        id: true,
        status: true,
        demande: { select: { id: true, status: true, targetRepairerUserId: true } },
        // A count rather than a fetch: nothing here needs the row, only whether
        // one exists.
        _count: { select: { commandes: { where: { status: 'PENDING_PAYMENT' } } } },
      },
    });
    if (!offer) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // status is already in the select above and was read nowhere until now.
    // A second withdrawal used to succeed and re-stamp updatedAt, which is
    // harmless with one row per réparateur and corrupts history ordering once
    // there are several.
    if (offer.status !== 'SENT') {
      throw new AppException('UNPROCESSABLE_ENTITY', CANNOT_WITHDRAW);
    }

    if (offer.demande.status !== 'OPEN') {
      throw new AppException('UNPROCESSABLE_ENTITY', CANNOT_WITHDRAW);
    }

    // The client is on the Stripe-hosted page right now. Withdrawing here would
    // take his money for an offer that no longer exists, so the state is made
    // unreachable rather than compensated with an automatic refund. An abandoned
    // or expired attempt does not count - only one in flight.
    if (offer._count.commandes > 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANNOT_WITHDRAW);
    }

    const withdrawOffer = this.prisma.offer.update({
      where: { id: offer.id },
      data: { status: 'WITHDRAWN' },
    });

    // CF4-25 (H2). Sending the quote stopped the private request's timer (`quoteExpiresAt`
    // null). Withdrawing it must start a fresh one, or the request is OPEN with no live quote
    // and nothing that will ever expire it - the client waits forever and H6 blocks him from
    // asking this réparateur again. Conditional on OPEN / his request / unarmed, in the same
    // transaction as the withdrawal. `== null` treats an older select (no column) as public.
    const target = offer.demande.targetRepairerUserId;
    if (target == null) {
      await withdrawOffer;
      return;
    }
    await this.prisma.$transaction([
      withdrawOffer,
      this.prisma.demande.updateMany({
        where: { id: offer.demande.id, status: 'OPEN', targetRepairerUserId: userId, quoteExpiresAt: null },
        data: { quoteExpiresAt: new Date(Date.now() + QUOTE_REQUEST_TTL_DAYS * 86_400_000) },
      }),
    ]);
  }

  /**
   * The client (demande author) declines an offer.
   * - On a private quote request: closes the request (`CANCELLED` + `QUOTE_REFUSED`), flips offer to `REJECTED`, and notifies the réparateur (`QUOTE_REFUSED`).
   * - On a public demande: flips the offer to `REJECTED`, notifies the réparateur (`OFFER_DECLINED`), and leaves the demande `OPEN`.
   */
  async decline(userId: string, offerId: string): Promise<{ ok: true }> {
    const offer = await this.prisma.offer.findFirst({
      where: {
        id: offerId,
        deletedAt: null,
        demande: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      },
      select: {
        id: true,
        status: true,
        repairerUserId: true,
        demande: {
          select: {
            id: true,
            title: true,
            status: true,
            targetRepairerUserId: true,
          },
        },
        _count: { select: { commandes: { where: { status: { in: ['PENDING_PAYMENT', 'PAID'] } } } } },
      },
    });
    if (!offer) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    if (offer.status !== 'SENT') {
      throw new AppException('CONFLICT', "Cette offre n'est plus ouverte.");
    }
    if (offer.demande.status !== 'OPEN') {
      throw new AppException('CONFLICT', "Cette demande n'est plus ouverte.");
    }
    if (offer._count.commandes > 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette offre est déjà en cours de paiement ou acceptée.');
    }

    if (offer.demande.targetRepairerUserId !== null) {
      await this.prisma.$transaction(async (tx) => {
        const closed = await tx.demande.updateMany({
          where: { id: offer.demande.id, status: 'OPEN' },
          data: { status: 'CANCELLED', quoteClosedReason: 'QUOTE_REFUSED', quoteExpiresAt: null },
        });
        if (closed.count === 0) throw new AppException('CONFLICT', "Cette demande n'est plus ouverte.");
        const rejected = await tx.offer.updateMany({
          where: { id: offer.id, ...LIVE_OFFER_WHERE },
          data: { status: 'REJECTED' },
        });
        if (rejected.count === 0) throw new AppException('CONFLICT', "Cette offre n'est plus ouverte.");
      });

      await this.notifications.emit({
        userId: offer.repairerUserId,
        mode: 'REPAIRER',
        type: 'QUOTE_REFUSED',
        actorName: null,
        subject: offer.demande.title,
        demandeId: offer.demande.id,
      });
      return { ok: true };
    }

    const updated = await this.prisma.offer.updateMany({
      where: { id: offer.id, ...LIVE_OFFER_WHERE },
      data: { status: 'REJECTED' },
    });
    if (updated.count === 0) throw new AppException('CONFLICT', "Cette offre n'est plus ouverte.");

    await this.notifications.emit({
      userId: offer.repairerUserId,
      mode: 'REPAIRER',
      type: 'OFFER_DECLINED',
      actorName: null,
      subject: offer.demande.title,
      demandeId: offer.demande.id,
    });
    return { ok: true };
  }

  async listMine(userId: string): Promise<OfferListItem[]> {
    const rows = await this.prisma.offer.findMany({
      // 🛑 BOTH `deletedAt`s, and the second one is not decoration. `listReceived` below
      // states the rule - a removal on either side must take the row out, or the list offers
      // a route to a demande that can no longer be opened. This half was missing until
      // `CF-17`, and was harmless only because nothing wrote `Demande.deletedAt`. With the
      // client able to delete, its absence left a réparateur a row he could neither open
      // (`getForViewer` filters it) nor withdraw (`withdraw` filters it) - forever.
      where: { repairerUserId: userId, deletedAt: null, demande: VISIBLE_DEMANDE_WHERE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        demandeId: true,
        priceCents: true,
        delayHours: true,
        status: true,
        createdAt: true,
        demande: { select: { title: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      demandeId: r.demandeId,
      demandeTitle: r.demande.title,
      priceCents: r.priceCents,
      delayHours: r.delayHours,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * `CF-11`. Every offer the CLIENT has been sent on their PUBLIC demandes (CF6-14). A private
   * quote request never appears here: its single quote is read on its own screen, under
   * « Mes réparations » > « Devis privés ».
   *
   * The mirror of `listMine` directly above: same compact row, ownership flipped from
   * `repairerUserId` to `demande.authorUserId`, plus the réparateur's name. Blind bidding is
   * untouched - that rule stops a RÉPARATEUR reading sibling offers, and `listForDemande` is
   * already author-only, so a client reading their own received offers is the same permission
   * expressed over a wider set.
   *
   * 🛑 TWO FILTERS, AND THEY ARE NOT REDUNDANT.
   *
   * `ACCEPTABLE_OFFER_WHERE` is in the WHERE because it is the SAME object `DemandesService`'s
   * `offerCount` counts, so this list cannot disagree with it. Any wider filter here and a demande
   * card reading « 2 offres reçues » would sit beside a list holding four. Before B2 the two keys
   * were spelled out here and in four other places; that agreement was by hand.
   *
   * The `offersStillMatter` pass is in JS because it is a rule about the DEMANDE, not the offer,
   * and it has exactly one definition by design (`repairStatus()` in `repair-status.ts`) - its
   * own comment forbids a second copy, so it is imported rather than re-expressed as a Prisma
   * predicate. It guards a defect the client already reported on 2026-08-21: offers rendered
   * beside « Paiement effectué ». In production `payments.service.ts:413` flips every sibling to
   * REJECTED on accept, so a SENT offer on a paid demande should not exist - but that is another
   * service's transaction, not a rule this endpoint enforces, and this list is the surface the
   * client would see it on.
   *
   * `offerCount: 0` in the `repairStatus()` call below is deliberate: this predicate only reads
   * `currentIndex`/`exit`/`disputed`, never the label, so the count this endpoint does not have
   * cannot affect the filter - `offersStillMatter` is index/exit/disputed-only by its own
   * definition.
   */
  async listReceived(userId: string): Promise<ReceivedOfferListItem[]> {
    const rows = await this.prisma.offer.findMany({
      where: {
        // ACCEPTABLE: this is the CLIENT's list of offers on his own demandes, and it must agree
        // with the `offerCount` on his demande cards. B2 spec §5.2. (An earlier draft called this
        // « the single most client-facing read of offers in the API » - that title belongs to
        // `listForDemande` below, which is the screen he accepts and PAYS from.)
        //
        // 🛑 A SPREAD, AND THE ONLY SITE THAT SPREADS `ACCEPTABLE_OFFER_WHERE` SPECIFICALLY -
        // `listForDemande` below spreads the narrower `UNSUSPENDED_REPAIRER_WHERE`, so "the only
        // spread in B2" would read as false at a glance. Safe because the
        // sibling key below is `demande:`, not `repairer:` - a sibling `repairer:` would REPLACE
        // the suspension clause outright, silently, with no type error. If this `where` ever
        // needs its own `repairer:` filter, switch to `AND: [ACCEPTABLE_OFFER_WHERE, { … }]`
        // rather than adding the key. The `repairer:` in the `select` below is a different
        // object and does not interact with this.
        ...ACCEPTABLE_OFFER_WHERE,
        // Both `deletedAt`s: a moderation removal on either side must take the row out, or the
        // list offers a route to a demande the client can no longer open.
        // CF6-14: Client specification: « Mes offres reçues : offres envoyées par les réparateurs
        // en réponse aux demandes publiques. » Using PUBLIC_DEMANDE_WHERE enforces targetRepairerUserId: null.
        demande: { authorUserId: userId, ...PUBLIC_DEMANDE_WHERE },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        demandeId: true,
        priceCents: true,
        delayHours: true,
        status: true,
        createdAt: true,
        // `status` and `commandes` are selected for the progress predicate below, NOT for the
        // response - `ReceivedOfferListItem` carries no demande status. Deriving it here rather
        // than shipping it keeps one definition of the chain on the client's screens.
        //
        // 🛑 `commandes` IS PLURAL AND THAT IS NOT A NAMING QUIRK. A demande holds one row per
        // checkout attempt because `resolvePending` reaps rather than deletes, so « the
        // demande's commande » is a CHOICE. `pickCommande` is the one place that makes it, and
        // the select mirrors its `Row` type exactly - `createdAt` included, because its
        // abandoned-only branch sorts by it. Writing `find(...)` here instead would be a second
        // rule, and an abandoned-then-repaid demande would then read as still awaiting offers on
        // this screen and as paid on every other one.
        //
        // `tsc` caught this and `test:unit` could not: the stubbed Prisma in the spec returns
        // whatever shape the spec declares, so the singular key passed nine green tests.
        demande: {
          select: {
            title: true,
            status: true,
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
                dispute: { select: { status: true } },
              },
            },
          },
        },
        repairer: { select: { username: true, repairerProfile: { select: { displayName: true } } } },
      },
    });

    return rows
      .filter((r) =>
        offersStillMatter(
          repairStatus(
            {
              demandeStatus: r.demande.status,
              offerCount: 0,
              commande: pickCommande(
                r.demande.commandes.map((c) => ({ ...c, disputeOpen: isDisputeOpen(c.dispute) })),
              ),
            },
            'CLIENT',
          ),
        ),
      )
      .map((r) => ({
        id: r.id,
        demandeId: r.demandeId,
        demandeTitle: r.demande.title,
        repairerName: publicIdentity({
          username: r.repairer.username,
          displayName: r.repairer.repairerProfile?.displayName ?? null,
        }),
        priceCents: r.priceCents,
        delayHours: r.delayHours,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
  }

  async listForDemande(userId: string, demandeId: string): Promise<OfferDto[]> {
    // Author-only, expressed in the WHERE. A réparateur bidding on this demande
    // is a legitimate participant and still must not read sibling offers: blind
    // bidding is a product requirement, not an incidental restriction.
    const demande = await this.prisma.demande.findFirst({
      where: { id: demandeId, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      select: { lat: true, lng: true },
    });
    if (!demande) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    const to: Coords | null =
      demande.lat != null && demande.lng != null
        ? { lat: demande.lat, lng: demande.lng }
        : null;

    // Withdrawn offers stay: the client asked to keep the trail, because a
    // réparateur who changes price withdraws and re-offers. deletedAt is a
    // different thing entirely - a moderation removal - and stays filtered.
    //
    /**
     * 🛑 B2 §5.2, AND DELIBERATELY BROADER THAN THE WITHDRAWN-TRAIL RULE DIRECTLY ABOVE.
     *
     * `UNSUSPENDED_REPAIRER_WHERE` carries NO `status`, so it removes a suspended réparateur's
     * offers from this screen **whatever their status** - the withdrawn ones too. That is the
     * point rather than an over-reach: the trail exists as the client's history of offers he
     * COULD HAVE ACCEPTED, and a suspended réparateur's were never among them. Keeping his
     * withdrawn rows while hiding his live one would leave the trail asserting he was once a
     * choice, which is the opposite of what a suspension means.
     *
     * 🛑 IT WAS MISSING, AND THAT WAS THE REACHABLE DEFECT IN THIS PIECE. This read filters no
     * status at all, so the `grep "status: 'SENT'"` that enumerated §5.2's eleven sites
     * structurally could not see it - the grep-built-table failure one level out from the one
     * §5.2 warns about. Until this line existed, « Mes demandes » read « Aucune offre » from an
     * ACCEPTABLE `_count` while this screen one tap later counted the same offer as « 1 offre
     * reçue » and let the client accept and pay. `createCheckout` now carries the matching guard.
     *
     * `ACCEPTABLE_OFFER_WHERE` was not usable here: it asserts `status: 'SENT'` and would have
     * silently deleted the trail. Spread, not assigned, and safe - the siblings are `demandeId`
     * and `deletedAt`, neither of which is `repairer:`.
     */
    const offers = await this.prisma.offer.findMany({
      where: { demandeId, deletedAt: null, ...UNSUSPENDED_REPAIRER_WHERE },
      orderBy: { createdAt: 'desc' },
      include: OFFER_WITH_GEOGRAPHY,
    });

    // ONE aggregate for the whole list rather than one per offer. Two réparateurs may
    // appear twice here (a re-quote leaves both offers in the trail), and passing the
    // ids with duplicates is harmless: `in` deduplicates and the map is read by key.
    const stats = await repairerStats(
      this.prisma,
      offers.map((o) => o.repairerUserId),
    );

    return offers.map((o) => {
      const p = o.repairer.repairerProfile;
      const from: Coords | null =
        p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null;
      const km = distanceKm(from, to);
      return this.present(
        o,
        km === null ? null : Math.round(km * 10) / 10,
        stats.get(o.repairerUserId) ?? NO_REPAIRER_STATS,
      );
    });
  }

  /**
   * CF-31: *« La garantie doit être réservée aux professionnels. Un réparateur
   * particulier ne doit donc pas pouvoir proposer une garantie professionnelle. »*
   *
   * **Expressed as "refuse what we would not display", not as its own condition.** The
   * test is `warrantyLabelFor(level, sent) !== sent`, the same shared derivation
   * `present` uses one screen over, so the write rule and the read rule are a single
   * expression and cannot be edited apart. A second `!mayOfferWarranty(level) && …`
   * here would compile, agree today, and be free to drift tomorrow.
   *
   * **Not in `createOfferSchema`**, because refusing a garantie needs the caller's
   * identity and a Zod parse has none. And **not in `verification/gate.ts`**, whose
   * every export is switched by a `*_GATE_ENABLED` flag: this is a permanent product
   * rule with no flag, and filing it beside two flagged asserts would invite someone
   * to give it one.
   *
   * Placed with the identity-derived gates in `create` rather than after the demande
   * lookup, matching what `assertBasicVerified` and `assertIdentityVerified` already
   * do - so an offer refused for this reason answers 403 before 404, exactly as one
   * refused by those two does.
   */
  private async assertWarrantyAllowed(
    userId: string,
    warrantyLabel: string,
  ): Promise<void> {
    // Cheapest-first, like business.service.ts: « Aucune » is legal for everybody, so
    // the common case costs no query at all.
    if (warrantyLabel === WARRANTY_NONE) return;

    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { verificationLevel: true },
    });
    // Absent profile → 'NONE' → refused. Fails CLOSED, the same fallback `present`
    // applies to the badge.
    const level = profile?.verificationLevel ?? 'NONE';
    if (warrantyLabelFor(level, warrantyLabel) !== warrantyLabel) {
      throw new AppException(
        'FORBIDDEN',
        'La garantie est réservée aux professionnels avec une entreprise vérifiée.',
      );
    }
  }

  private async assertRepairerEnabled(userId: string): Promise<void> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      // 🛑 repairerSuspendedAt is SELECTED, not just filtered on. Prisma returns undefined
      // for an unselected field, and `undefined !== null` is TRUE, so omitting this select
      // would make the guard refuse EVERY réparateur (a total outage of offer creation),
      // and tsc would reject it first with TS2339.
      select: { repairerEnabled: true, repairerSuspendedAt: true },
    });
    if (!profile?.repairerEnabled) {
      throw new AppException(
        'FORBIDDEN',
        'Activez le mode réparateur pour proposer une offre.',
      );
    }
    /**
     * 🛑 B2 GUARD 6, AND IT IS NOT REDUNDANT WITH THE CHECK ABOVE. A réparateur-scoped
     * suspension deliberately leaves `repairerEnabled` TRUE, so his client side keeps
     * working - which means the mode check cannot see it. Without this, a suspended
     * réparateur keeps quoting on demandes he can no longer be found through. Spec §5.3.
     *
     * 🛑 DELIBERATELY READS ONLY `repairerSuspendedAt`, NOT `repairerSuspendedUntil`.
     * A suspension ends only when an operator clears the marker - it does not self-expire.
     * `repairerSuspendedUntil` is the operator's recorded intent for display on the fiche
     * and in the admin list, not an authoritative expiry. Ch.8 contrasts « Suspendre
     * temporairement » against « Désactiver définitivement » to mean *reversible versus
     * permanent*, not *auto-expiring versus manual*. Auto-expiry is a follow-up.
     */
    if (profile.repairerSuspendedAt !== null) {
      throw new AppException('FORBIDDEN', REPAIRER_SUSPENDED);
    }
  }

  present(
    offer: {
      id: string; priceCents: number; delayHours: number; warrantyLabel: string;
      partsLabel: string; travel: OfferDto['travel']; acceptsParcel: boolean;
      comment: string | null; status: OfferDto['status']; createdAt: Date; repairerUserId: string;
      repairer: {
        username: string;
        profile: { verificationLevel: MeResponse['profile']['verificationLevel'] } | null;
        repairerProfile: { displayName: string } | null;
      };
    },
    distanceKm: number | null,
    /**
     * Passed in rather than fetched here, mirroring `distanceKm` for the same reason:
     * `present` is synchronous and per-offer, and querying inside it would be an N+1
     * over a list. Both callers do one aggregate for the whole set.
     */
    stats: RepairerStats,
  ): OfferDto {
    const level = offer.repairer.profile?.verificationLevel ?? 'NONE';
    return {
      id: offer.id,
      repairerName: publicIdentity({
        username: offer.repairer.username,
        displayName: offer.repairer.repairerProfile?.displayName ?? null,
      }),
      repairerUserId: offer.repairerUserId,
      priceCents: offer.priceCents,
      delayHours: offer.delayHours,
      // CF-31, and this is the site that makes the rule true of offers that ALREADY
      // exist. `create` refuses a garantie from a non-professional, but 44 of the 47
      // rows in production predate that refusal - the form defaulted to « 3 mois » -
      // so without this line a client would still be comparing « Garantie 3 mois »
      // written by a particulier. Derived from the same level as the badge below and
      // through the same shared helper the conversation recap uses, so no presenter
      // can answer this differently.
      warrantyLabel: warrantyLabelFor(level, offer.warrantyLabel),
      partsLabel: offer.partsLabel,
      travel: offer.travel,
      acceptsParcel: offer.acceptsParcel,
      comment: offer.comment,
      distanceKm,
      // IDENTITY or BUSINESS, never BASIC and never NONE. BASIC means a verified
      // email or phone, which says nothing about who the person is, and this
      // renders as a badge on the screen a client uses to decide who gets paid
      // work. An absent profile therefore falls through to null: the trust signal
      // fails closed.
      //
      // Two rules the shape must keep. The badges are ranked EQUAL on purpose -
      // the client requires that level 3 never be a requirement, so nothing may
      // sort by the enum's ordinal. And « Professionnel vérifié » derives
      // strictly from BUSINESS: `repairerProfile.kind` is self-declared, and it is
      // absent from both this parameter's type and the query's select, so the
      // fabricated badge is unreachable rather than merely forbidden.
      // Extracted to `verifiedBadgeFor` in piece C, which gave it a second caller.
      // The reasoning above did not move, because this is still the site where it matters.
      verifiedBadge: verifiedBadgeFor(level),
      rating: stats.rating,
      reviewCount: stats.reviewCount,
      repairCount: stats.repairCount,
      status: offer.status,
      createdAt: offer.createdAt.toISOString(),
    };
  }
}
