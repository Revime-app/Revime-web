import { Injectable } from '@nestjs/common';
import type {
  AdminChangeCategoryInput,
  AdminDeleteDemandeInput,
  AdminHideDemandeInput,
} from '@revime/shared';
import { USABLE_CATEGORY } from '../catalog/usable-category.js';
import { AppException } from '../common/app-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LIVE_OFFER_WHERE } from '../offers/offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * 🛑 ITS OWN CONSTANTS, sharing NOTHING with the two other admin write services, and that
 * is a measurement rather than laziness. B2's follow-up #9 records `NOT_FOUND`, `SELF`,
 * `IS_ADMIN` and `IS_DELETED` duplicated across `admin-users-write` and
 * `admin-repairers-write` - both of which take a `User` target. None of the four applies
 * here: this targets a `Demande`, so the not-found message names a resource rather than a
 * user, and `SELF` and `IS_ADMIN` protect an ACCOUNT from an operator acting on itself and
 * have no analogue on a demande. Follow-up #9 stays open between those two, unchanged.
 */
const NOT_FOUND = 'Ressource introuvable.';
const ALREADY_HIDDEN = 'Cette demande est déjà masquée.';
const NOT_HIDDEN = "Cette demande n'est pas masquée.";
const PAYMENT_IN_FLIGHT = 'Un paiement est en cours sur cette demande.';
const BAD_CATEGORY = 'Catégorie invalide.';

type Target = { id: string; title: string; deletedAt: Date | null; hiddenAt: Date | null };

@Injectable()
export class AdminDemandesWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** No visibility filter: an operator acts on rows nobody else can see. */
  private async load(demandeId: string): Promise<Target> {
    const row = await this.prisma.demande.findUnique({
      where: { id: demandeId },
      select: { id: true, title: true, deletedAt: true, hiddenAt: true },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    return row;
  }

  /**
   * A deleted demande is gone for every purpose, so every action treats it as absent rather
   * than as a distinct refusal. Returning NOT_FOUND and not a fourth message is deliberate:
   * the operator's list already shows the state, and inventing « déjà supprimée » would
   * imply an undelete exists.
   */
  private assertNotDeleted(target: Target): void {
    if (target.deletedAt) throw new AppException('NOT_FOUND', NOT_FOUND);
  }

  /**
   * 🛑 THE ONE MONEY GUARD, lifted verbatim from demandes.service.ts's softDelete, whose own
   * comment is the argument: "The client is on the Stripe-hosted page right now. Deleting
   * would strand a live payment against a demande that no longer exists, so the state is
   * made unreachable rather than compensated. An ABANDONED or expired attempt does not
   * count - only one in flight."
   *
   * 🛑 It does NOT consult `status`. Hide and delete are allowed at any lifecycle state, which
   * is deliberately wider than the author's own rule (`demandeEditPolicy` allows a delete
   * only while OPEN): content moderation must not be blockable by an escrow in progress, and
   * the marker touches no money. Do not "align" the two.
   */
  private async assertNoPaymentInFlight(demandeId: string): Promise<void> {
    const pending = await this.prisma.commande.count({
      where: { demandeId, status: 'PENDING_PAYMENT' },
    });
    if (pending > 0) throw new AppException('UNPROCESSABLE_ENTITY', PAYMENT_IN_FLIGHT);
  }

  async changeCategory(
    _actorUserId: string,
    demandeId: string,
    input: AdminChangeCategoryInput,
  ): Promise<void> {
    const target = await this.load(demandeId);
    this.assertNotDeleted(target);
    // Deliberately NO payment guard and NO hidden guard: fixing a miscategorised demande is
    // a CORRECTION, not a removal. It takes nothing away from anyone, so refusing it while a
    // payment is in flight would block the operator from repairing the very row a client is
    // paying against.

    // 🛑 USABLE_CATEGORY spread LAST. Its own file says so: it is
    // `{ active: true, OR: [{ parentId: null }, { parent: { active: true } }] }`, and a
    // sibling condition using OR silently clobbers the parent-activeness key. Here the
    // sibling is `id`, which cannot collide - spread it last anyway, because the next
    // person to add a condition will add it before this one.
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, ...USABLE_CATEGORY },
      select: { id: true },
    });
    // « if a category cannot be offered to a client, it cannot be accepted from one » -
    // demandes.service.ts's own words for the same predicate. It cannot be ASSIGNED by an
    // operator either, or he produces a state the app is unable to create.
    if (!category) throw new AppException('UNPROCESSABLE_ENTITY', BAD_CATEGORY);

    await this.prisma.demande.update({
      where: { id: demandeId },
      data: { categoryId: input.categoryId },
    });
  }

  async hide(actorUserId: string, demandeId: string, input: AdminHideDemandeInput): Promise<void> {
    const target = await this.load(demandeId);
    this.assertNotDeleted(target);
    // 🛑 REFUSED rather than re-stamped, diverging from moderation-admin.service.ts's
    // idempotent convention on purpose: hiddenReason and hiddenByUserId are EVIDENCE, and a
    // re-stamp overwrites the first operator's record with the second's. Safe because the
    // fiche renders the current state and offers « Réafficher » once hidden, so a stale page
    // is the only route in.
    if (target.hiddenAt) throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_HIDDEN);
    await this.assertNoPaymentInFlight(demandeId);

    // One statement, so the marker and its attribution cannot come apart. That is the whole
    // argument for these being columns rather than a derived read of AdminAuditLog, which
    // the interceptor writes AFTER this returns and can therefore be missing.
    await this.prisma.demande.update({
      where: { id: demandeId },
      data: {
        hiddenAt: new Date(),
        hiddenByUserId: actorUserId,
        hiddenReason: input.reason,
      },
    });

    // 🛑 NOTIFIES NOBODY, and that is decision 4 rather than an omission. A notification
    // cannot be retracted, so telling the réparateurs on the REVERSIBLE action manufactures
    // a false claim the moment an operator un-hides. Hide is triage; `remove` is the verdict
    // and it is what notifies. Recorded limitation: a hide nobody ever reverses is a silent
    // removal for the réparateurs who quoted.
  }

  async unhide(_actorUserId: string, demandeId: string): Promise<void> {
    // 🛑 The observed marker is PINNED IN THE `where` rather than checked in advance, so the
    // read and the write cannot disagree under a concurrent second click. B2's follow-up #11
    // records that `clearVerificationRevocation` failed to pin its marker while its
    // counterpart did, and called the asymmetry an invitation to complete the pattern wrongly.
    const { count } = await this.prisma.demande.updateMany({
      where: { id: demandeId, hiddenAt: { not: null }, deletedAt: null },
      data: { hiddenAt: null, hiddenByUserId: null, hiddenReason: null },
    });
    // All three cleared: leaving the reason behind would render « Masquée » evidence beside a
    // visible demande. The HISTORY of the hide is the audit row, not these columns.
    if (count === 0) throw new AppException('UNPROCESSABLE_ENTITY', NOT_HIDDEN);
  }

  async remove(
    actorUserId: string,
    demandeId: string,
    input: AdminDeleteDemandeInput,
  ): Promise<void> {
    const target = await this.load(demandeId);
    this.assertNotDeleted(target);
    // 🛑 NO `hiddenAt` guard, unlike `hide`: a hidden demande CAN be deleted, which is the
    // triage-then-verdict path the two verbs exist to express.
    await this.assertNoPaymentInFlight(demandeId);

    await this.prisma.demande.update({
      where: { id: demandeId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: actorUserId,
        deletedReason: input.reason,
      },
    });

    // 🛑 THE OFFERS ARE NOT TOUCHED. `demandes.service.ts`'s softDelete records that writing
    // WITHDRAWN on a réparateur's behalf « was explicitly rejected » (CF-D7 part 2). They
    // leave the client's surfaces through VISIBLE_DEMANDE_WHERE instead.

    // 🛑 LIVE_OFFER_WHERE, NOT ACCEPTABLE. This is a NOTIFICATION list: a suspended
    // réparateur's offer is invisible to the client, and he is still told what became of
    // his work. demandes.service.ts's two emit sites carry the identical note.
    const quoting = await this.prisma.offer.findMany({
      where: { demandeId, ...LIVE_OFFER_WHERE },
      select: { repairerUserId: true },
    });
    for (const o of quoting) {
      await this.notifications.emit({
        userId: o.repairerUserId,
        mode: 'REPAIRER',
        type: 'DEMANDE_MODERATED',
        // No actorName: the réparateur has no relationship with this operator, and the copy
        // names Revime. Follows DEMANDE_WITHDRAWN's own choice for the same reason.
        actorName: null,
        subject: target.title,
        // Carried so the row is attributable even though destinationFor returns null for
        // this type - the demande is gone, so any destination would be a guaranteed 404.
        demandeId,
      });
    }
  }
}
