import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service.js';
import type {
  CommandeDto,
  CommandeListItem,
  CommandeListQuery,
  CommandeRole,
  CommandeStep,
  ParcelOption,
  ShipmentDto,
  ShippingAddressInput,
  ShippingLegPrices,
} from '@revime/shared';
import {
  splitShippingByLeg,
  canRequestReleaseAfterTimeout,
  DISPUTE_MOTIFS,
  formatDisputeReference,
  frPhoneSchema,
  labelReady,
  nextStepFor,
  orderNumberFor,
  publicIdentity,
  SCAN_ADVANCES,
  STEP_CLAIMANT,
  trackingStatusLabel,
  type AdvanceStepInput,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { repairerFiscalComplete } from '../fiscal/fiscal-gate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { CANCELLATION_PENDING } from '@revime/shared';
import { AdminAlertsService } from '../admin/admin-alerts.service.js';
import { unreadFor } from '../disputes/disputes.service.js';
import { arePaymentsEnabled } from '../payments/config.js';
import { connectGateway } from '../connect/gateway.js';
import { isConnectEnabled } from '../connect/config.js';
import { paymentsGateway } from '../payments/gateway.js';
import { sendParcelOpsMail } from './ops-mail.js';
import { recordStep } from './record-step.js';
import { isDisputeOpen } from './dispute-open.js';
import { partialRefundOf } from './refund-plan.js';
import { isShippingQuotesEnabled } from '../shipping/config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import { CommandeAnnouncer } from './commande-announcer.service.js';
import { paidLegPair } from '../shipping/shipping-quotes.service.js';

const NOT_FOUND = 'Ressource introuvable.';
/**
 * CF4-12/13/14, design §4.2. Same value as `DemandesService`'s `READ_URL_TTL_SECONDS` -
 * this signs the same demande photos plus both parties' avatars for the details page, and
 * a second TTL here would be a second number to keep in sync with that one.
 */
const READ_URL_TTL_SECONDS = 3600;
const TRACKING_OFF = "Le suivi de commande n'est pas encore disponible.";
const NOT_PAID = "Cette commande n'est pas encore payée.";
const NOT_NEXT_STEP = "Cette étape n'est pas la prochaine de la commande.";
const OTHER_PARTY = "Cette étape doit être confirmée par l'autre partie.";
const USE_VALIDATION = 'Utilisez la validation pour débloquer les fonds.';
const PAYMENTS_OFF = "Les paiements ne sont pas encore disponibles.";
const RELEASE_OFF = "Le déblocage des fonds n'est pas encore disponible.";
const CLIENT_ONLY = 'Seul le client peut valider la réparation.';
const NOT_FINISHED = "La réparation n'est pas encore terminée.";
const ALREADY_RELEASED = 'Les fonds ont déjà été débloqués.';
const CHARGE_MISSING =
  'Ce paiement ne peut pas encore être débloqué. Nous vérifions la transaction.';
const ACCOUNT_UNREADABLE =
  'Vérification du compte du réparateur impossible pour le moment. Réessayez.';
const TRANSFER_FAILED = 'Le déblocage a échoué. Réessayez dans quelques minutes.';
const UNDER_REVIEW = "Ce paiement fait l'objet d'une vérification.";
const ALREADY_REFUNDED = 'Ce paiement a déjà été remboursé.';
/** CF5-04. While a dispute is open, REVIME's decision settles the order; no party moves a step. */
const DISPUTE_OPEN = "Un litige est en cours : l'étape de la commande ne peut pas être modifiée.";
const REFUND_STATE_UNKNOWN =
  "L'état du remboursement n'a pas pu être vérifié. Réessayez dans quelques minutes.";
const REPAIRER_BANNED = 'Ce réparateur ne peut plus recevoir de paiement.';
const NOT_PARCEL = "Cette commande n'est pas un envoi par colis.";
const LABELS_ISSUED = 'Les étiquettes ont déjà été émises.';
const LABEL_NOT_ISSUED = "Votre étiquette n'a pas encore été émise.";
const TIMEOUT_NOT_REACHED = "Vous ne pouvez pas encore demander le déblocage.";
// Livraison Boxtal, spec §7.4.
const MOBILE_REQUIRED = 'Indiquez un numéro de mobile : le transporteur envoie les avis de passage par SMS.';
const RELAY_REQUIRED = 'Choisissez un point relais.';

type ShipmentRow = {
  leg: 'OUTBOUND' | 'RETURN';
  status: ShipmentDto['status'];
  carrierLabel: string;
  labelStoragePath: string | null;
  events: { status: string; occurredAt: Date; raw: unknown }[];
};

/**
 * V7 A9 (U8, `DEC7-23`). The order's delivery price per leg, split on the pair it was paid on
 * (`paidLegPair`: the insured one when insured). Null without a quote - a local order, or a parcel
 * paid under the manual driver - so the app keeps one line rather than invent a split (Q6). Read
 * from the quote row at every GET, not stored: the order keeps its quote, so expiry changes nothing.
 */
export function shippingLegsFor(row: {
  delivery: string;
  parcelOption: ParcelOption | null;
  shippingCents: number;
  insuranceCents: number;
  shippingQuote: { legs: unknown } | null;
}): ShippingLegPrices | null {
  const pair = paidLegPair(row);
  return pair ? splitShippingByLeg(row.shippingCents, pair) : null;
}

/**
 * Livraison Boxtal. Pure, so the timeline shape is unit-tested with no database. Newest event
 * first; the tracking URL is whatever the newest event that carries one says.
 */
export function presentShipments(rows: ShipmentRow[]): ShipmentDto[] {
  return rows.map((s) => {
    const events = [...s.events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const withUrl = events.find(
      (e) => typeof (e.raw as { packageTrackingUrl?: unknown } | null)?.packageTrackingUrl === 'string',
    );
    return {
      leg: s.leg,
      status: s.status,
      carrierLabel: s.carrierLabel,
      labelReady: s.labelStoragePath !== null,
      trackingUrl: withUrl ? (withUrl.raw as { packageTrackingUrl: string }).packageTrackingUrl : null,
      latestStatus: events[0]?.status ?? null,
      events: events.map((e) => ({
        status: e.status,
        label: trackingStatusLabel(e.status),
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  });
}

/**
 * The one `select` behind `findOne`, shared by its read and by the re-read after a payment
 * reconciliation (CF6-04) so the two cannot drift. The rationale comments below were written for
 * the inline version and moved here with it.
 */
export const COMMANDE_FIND_ONE_SELECT = {
  id: true,
  demandeId: true,
  offerId: true,
  delivery: true,
  repairCents: true,
  shippingCents: true,
  protectionCents: true,
  totalCents: true,
  transferredCents: true,
  status: true,
  step: true,
  executionDelayPreference: true,
  withdrawalWaiverAcceptedAt: true,
  withdrawalPeriodEndsAt: true,
  paidAt: true,
  releaseRequestedAt: true,
  releasedAt: true,
  stripeTransferId: true,
  returnSentAt: true,
  refundedAt: true,
  refundedCents: true,
  // CF4-D task 8 (spec §5-6). The flexible refund breakdown, once one exists - null on a legacy
  // refund or before any refund at all (`CommandeDto.refund`).
  refundRepairCents: true,
  refundShippingCents: true,
  refundProtectionCents: true,
  disputedAt: true,
  outboundTrackingNumber: true,
  returnTrackingNumber: true,
  shippingAddresses: { select: { role: true, parcelPointCode: true } },
  // Livraison Boxtal (spec §5.3).
  parcelOption: true,
  insuranceCents: true,
  parcelWeightGrams: true,
  parcelLengthCm: true,
  parcelWidthCm: true,
  parcelHeightCm: true,
  parcelValueCents: true,
  // V7 A9: the paid pair's legs, for `CommandeDto.shippingLegs`.
  shippingQuote: { select: { legs: true } },
  shipments: {
    select: {
      leg: true,
      status: true,
      carrierLabel: true,
      labelStoragePath: true,
      events: { select: { status: true, occurredAt: true, raw: true } },
    },
    orderBy: { leg: 'asc' },
  },
  clientUserId: true,
  repairerUserId: true,
  demande: {
    select: {
      title: true,
      description: true,
      locationLabel: true,
      postalCode: true,
      photos: { orderBy: { sortOrder: 'asc' }, select: { storagePath: true } },
    },
  },
  // Deliberately NOT filtered on deletedAt -- see CommandeDto.reviewed. Singular, because
  // Review.commandeId is @unique, so Prisma types this as `Review | null`.
  review: { select: { id: true } },
  client: {
    select: { username: true, profile: { select: { avatarPath: true } } },
  },
  repairer: {
    select: {
      username: true,
      repairerProfile: { select: { displayName: true, serviceAreaLabel: true, postalCode: true } },
      profile: { select: { avatarPath: true } },
    },
  },
  // CF4-12/13/14, design §4.2. D1: only OPEN/IN_REVIEW read as `disputeOpen` - `isDisputeOpen` is
  // the one place that decides it.
  dispute: {
    select: {
      id: true,
      number: true,
      motif: true,
      reason: true,
      status: true,
      initiator: true,
      createdAt: true,
      assignedAt: true,
      resolvedAt: true,
      verdict: true,
      resolutionNote: true,
      clientLastReadAt: true,
      repairerLastReadAt: true,
      messages: {
        select: {
          space: true,
          author: true,
          createdAt: true,
        },
      },
    },
  },
  // Oldest first, so the timeline card reads top-to-bottom as it happened.
  stepEvents: { orderBy: { at: 'asc' }, select: { step: true, at: true } },
  // CF4-27 (spec §4.4). The latest request only - `findOne` needs no history, just "is one pending
  // / what was the outcome of the last one". `take: 1` avoids fetching a whole history for a value
  // only the newest row of which is ever read.
  cancellationRequests: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, reason: true, comment: true, refusalNote: true, createdAt: true },
  },
  // CF6-04. Read only so a PENDING_PAYMENT order can be reconciled against its PaymentIntent.
  stripePaymentIntentId: true,
} as const;

/**
 * CF6-04. How long `findOne` waits for Stripe while reconciling a pending payment. `findOne` is a
 * GET the app polls every 2 s, and the Stripe client has no timeout of its own, so without a budget
 * a slow Stripe would hold every poll for as long as it likes. Same shape and reasoning as
 * `POLL_BUDGET_MS` in `shipments.service.ts`, which bounds the other on-read poll in this GET.
 */
export const RECONCILE_BUDGET_MS = 4_000;

function withinReconcileBudget<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`payment reconciliation exceeded ${RECONCILE_BUDGET_MS} ms`)),
      RECONCILE_BUDGET_MS,
    );
  });
  return Promise.race([work, budget]).finally(() => clearTimeout(timer));
}

/**
 * `findOne` moved here from `payments.service.ts`, which was 497 lines and
 * already owned checkout plus the charge webhook. `payments/` keeps the money-in
 * path; this module owns the lifecycle and the money-out.
 *
 * NEITHER read is flag-guarded, matching what P1 shipped and P2's M8 correction:
 * a read is how the app decides whether to render a surface at all, so it must
 * succeed and report nothing rather than fail.
 *
 * 🛑 CF6-04: `findOne` is no longer a pure read. While payments are enabled, an order still in
 * PENDING_PAYMENT is reconciled against Stripe and may be finalised or abandoned before it is
 * returned. That keeps the rule above (a Stripe failure or a slow Stripe is logged and the pending
 * order is returned), but every caller of `findOne` now shares the side effect, including a
 * réparateur's GET. The write itself lives in `PaymentsService` and is idempotent.
 */
/**
 * « Released to the réparateur, never transferred, and nothing says it must not be »: the orders
 * `payoutStrandedCommandes` pays and the cron sweep looks for. Held because the Connect account was
 * not active, or (CMP-D3) the fiscal declaration was incomplete. Its refusals are `releaseInternal`'s
 * and `payoutBlocker`'s (admin-payouts.service.ts); change one and the others must follow.
 */
const HELD_PAYOUT_WHERE = {
  status: 'PAID',
  step: 'RELEASED',
  stripeTransferId: null,
  disputedAt: null,
  cancellationRequestedAt: null,
  stripeRefundId: null,
  stripeTransferReversalId: null,
} satisfies Prisma.CommandeWhereInput;

@Injectable()
export class CommandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly announcer: CommandeAnnouncer,
    @Optional()
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments?: PaymentsService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  /**
   * F7. A transfer to a réparateur that Stripe refused is the « échec de virement » the admin bell
   * exists for: the funds stay in escrow and nobody is told unless this runs. Deduplicated per
   * commande for 15 minutes by the alerts service, so the cron retrying every tick raises one alert.
   */
  private async reportPayoutFailure(commandeId: string, context: 'release' | 'stranded', err: unknown): Promise<void> {
    await this.alerts?.raise({
      type: 'PAYMENT_FAILED',
      title: 'Échec de versement au réparateur',
      message: `Stripe a refusé le transfert de la commande ${orderNumberFor(commandeId)} (${context === 'release' ? 'libération des fonds' : 'versement en attente'}). Les fonds restent en séquestre : relancer depuis Versements une fois la cause levée.`,
      targetType: 'Commande',
      targetId: commandeId,
      link: `/commandes/${commandeId}`,
      metadata: { context, error: String(err).slice(0, 300) },
    });
  }

  async list(userId: string, query: CommandeListQuery): Promise<CommandeListItem[]> {
    const rows = await this.prisma.commande.findMany({
      where: {
        ...(query.role === 'client'
          ? { clientUserId: userId }
          : { repairerUserId: userId }),
        // BOTH conditions, and now a widened status. `REFUNDED` is included
        // because a refunded commande is still the client's record of what
        // happened - filtering to PAID alone made it vanish from both parties'
        // lists, which the P5 spec §4.4 found by grepping readers of `status`.
        // `step: { not: null }` still earns its place: it is what makes
        // CommandeListItem.step's non-nullable type TRUE rather than
        // true-by-coalesce. The two are not redundant.
        status: { in: ['PAID', 'REFUNDED'] },
        step: { not: null },
      },
      select: {
        id: true,
        demandeId: true,
        delivery: true,
        step: true,
        status: true,
        repairCents: true,
        transferredCents: true,
        totalCents: true,
        // CF4-15 / spec §6 (fix round 1). Selected alongside `status`/`totalCents` so
        // `partialRefundOf` can compute `CommandeListItem.partialRefund` below - the
        // réparateur's commandes list badge needs the same signal the order details
        // page does.
        refundedCents: true,
        createdAt: true,
        releasedAt: true,
        stripeTransferId: true,
        // CF4-27. Drives `CommandeListItem.cancellationPending` - the frozen-order tag.
        cancellationRequestedAt: true,
        demande: { select: { title: true } },
        client: { select: { username: true } },
        repairer: {
          select: { username: true, repairerProfile: { select: { displayName: true } } },
        },
        dispute: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      demandeId: row.demandeId,
      demandeTitle: row.demande.title,
      counterpartyName:
        query.role === 'client'
          ? publicIdentity({
              username: row.repairer.username,
              displayName: row.repairer.repairerProfile?.displayName ?? null,
            })
          : publicIdentity({ username: row.client.username, displayName: null }),
      delivery: row.delivery,
      // Unreachable: the `where` above requires a non-null step. Present only
      // because Prisma cannot narrow a `not: null` filter into the row type.
      step: row.step ?? 'PAID',
      status: row.status,
      payoutCents: row.transferredCents ?? row.repairCents,
      totalCents: row.totalCents,
      createdAt: row.createdAt.toISOString(),
      releasedAt: row.releasedAt?.toISOString() ?? null,
      hasStripeTransfer: row.stripeTransferId !== null,
      disputeOpen: isDisputeOpen(row.dispute),
      // CF4-15 / spec §6 (fix round 1, controller ruling R7). Same `partialRefundOf`
      // derivation `findOne` and `pickCommande` use, so a partial refund reads
      // « Remboursée partiellement » on this list too, not just the details page.
      partialRefund: partialRefundOf(row),
      // CF4-27. Same derivation `pickCommande` uses: non-null exactly while a PENDING row exists.
      cancellationPending: row.cancellationRequestedAt !== null,
    }));
  }

  async findOne(userId: string, commandeId: string): Promise<CommandeDto> {
    // Only the order's own client or réparateur may read it, and the re-read after a
    // reconciliation below must apply the same filter.
    const visibleToViewer = {
      id: commandeId,
      OR: [{ clientUserId: userId }, { repairerUserId: userId }],
    };
    let row = await this.prisma.commande.findFirst({
      where: visibleToViewer,
      select: COMMANDE_FIND_ONE_SELECT,
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    // CF6-04: Active reconciliation for PENDING_PAYMENT commandes.
    // If the client completed payment and arrived on acceptee.tsx before the Stripe webhook landed,
    // or if the webhook was delayed/lost, query Stripe gateway and finalize immediately.
    if (arePaymentsEnabled() && row.status === 'PENDING_PAYMENT' && row.stripePaymentIntentId && this.payments) {
      try {
        const intent = await withinReconcileBudget(
          paymentsGateway().retrievePaymentIntent(row.stripePaymentIntentId),
        );
        let reconciled = false;
        if (intent.status === 'succeeded') {
          await this.payments.completeByPaymentIntent(row.stripePaymentIntentId, intent.chargeId);
          reconciled = true;
        } else if (intent.status === 'canceled') {
          await this.payments.abandonByPaymentIntentId(row.stripePaymentIntentId);
          reconciled = true;
        }

        if (reconciled) {
          const updatedRow = await this.prisma.commande.findFirst({
            where: visibleToViewer,
            select: COMMANDE_FIND_ONE_SELECT,
          });
          if (updatedRow) {
            row = updatedRow;
          }
        }
      } catch (e) {
        console.warn(`[commandes] active payment reconciliation failed on findOne: ${commandeId}`, e);
      }
    }

    const viewerRole: CommandeRole = row.clientUserId === userId ? 'CLIENT' : 'REPAIRER';

    // The conversation between the two parties for THIS demande - `Conversation` is keyed
    // `[demandeId, repairerUserId]` (@@unique, schema.prisma), so a plain lookup on those two
    // plus `clientUserId` finds it without a second choice to make, unlike `pickCommande`'s.
    // `Commande.demandeId` is non-nullable (schema.prisma), so this can never match a direct
    // (demandeId null) conversation. `deletedAt: null` matches every other Conversation read
    // in `conversations.service.ts`: a moderator-closed thread must yield `conversationId: null`
    // here so the app falls back to get-or-create, which applies the closed guard.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        demandeId: row.demandeId,
        clientUserId: row.clientUserId,
        repairerUserId: row.repairerUserId,
        deletedAt: null,
      },
      select: { id: true },
    });

    // ONE batched signing call for the demande's photos plus both avatars - same helper and
    // TTL (`AVATAR_READ_TTL_SECONDS` below, matching `READ_URL_TTL_SECONDS` in
    // `DemandesService`) that `DemandesService.present` uses for `photoUrls`, and that
    // `ConversationsService` uses for an avatar. No new signing path.
    const demandePhotoPaths = row.demande.photos.map((p) => p.storagePath);
    const avatarPaths = [row.client.profile?.avatarPath, row.repairer.profile?.avatarPath].filter(
      (p): p is string => p !== null && p !== undefined,
    );
    const toSign = [...demandePhotoPaths, ...avatarPaths];
    const signed =
      toSign.length === 0 || !isStorageConfigured()
        ? new Map<string, string>()
        : await storageGateway().createSignedReadUrls(toSign, READ_URL_TTL_SECONDS);
    const photoUrls = demandePhotoPaths
      .map((p) => signed.get(p))
      .filter((u): u is string => u !== undefined);
    const disputeOpen = isDisputeOpen(row.dispute);

    return {
      id: row.id,
      demandeId: row.demandeId,
      offerId: row.offerId,
      demandeTitle: row.demande.title,
      repairerName: publicIdentity({
        username: row.repairer.username,
        displayName: row.repairer.repairerProfile?.displayName ?? null,
      }),
      delivery: row.delivery,
      repairCents: row.repairCents,
      shippingCents: row.shippingCents,
      protectionCents: row.protectionCents,
      totalCents: row.totalCents,
      executionDelayPreference: row.executionDelayPreference,
      withdrawalWaiverAcceptedAt: row.withdrawalWaiverAcceptedAt?.toISOString() ?? null,
      withdrawalPeriodEndsAt: row.withdrawalPeriodEndsAt?.toISOString() ?? null,
      // repairCents until released, then whatever was actually transferred.
      // CF4-D task 8 (spec §5-6): on a REFUNDED row with a recorded breakdown
      // (`refundRepairCents !== null`), the réparateur's payout is repair minus
      // whatever of the repair line was refunded back to the client - 0 when the
      // whole repair line was refunded. A REFUNDED row with NO breakdown (legacy
      // full refund, no columns ever written) pays out 0, same as today. Every
      // other status keeps the pre-existing rule unchanged.
      payoutCents:
        row.status === 'REFUNDED'
          ? row.refundRepairCents !== null
            ? row.repairCents - row.refundRepairCents
            : 0
          : (row.transferredCents ?? row.repairCents),
      status: row.status,
      step: row.step,
      viewerRole,
      paidAt: row.paidAt?.toISOString() ?? null,
      releaseRequestedAt: row.releaseRequestedAt?.toISOString() ?? null,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      hasStripeTransfer: row.stripeTransferId !== null,
      returnSentAt: row.returnSentAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      refundedCents: row.refundedCents,
      // CF4-D task 8 (spec §5-6). Present only once a breakdown was recorded
      // (`refundRepairCents !== null`) - null before any refund and for a legacy
      // full refund with no breakdown columns written.
      refund:
        row.refundRepairCents !== null
          ? {
              repairCents: row.refundRepairCents,
              shippingCents: row.refundShippingCents ?? 0,
              protectionCents: row.refundProtectionCents ?? 0,
              totalCents: row.refundedCents ?? 0,
            }
          : null,
      outboundTrackingNumber: row.outboundTrackingNumber,
      returnTrackingNumber: row.returnTrackingNumber,
      // Derived from the viewer's role rather than returned as two raw rows: the
      // screen asks "is it my turn", and handing it both parties' addresses would
      // put one party's home address in the other's API response for no reason.
      // Since Livraison Boxtal an address counts as submitted only once the relay point is
      // chosen where the option needs one - so parcelStage() needs no new branch (spec §5.3).
      myAddressSubmitted: row.shippingAddresses.some(
        (a) => a.role === viewerRole && (row.parcelOption !== 'RELAY' || a.parcelPointCode !== null),
      ),
      counterpartyAddressSubmitted: row.shippingAddresses.some(
        (a) => a.role !== viewerRole && (row.parcelOption !== 'RELAY' || a.parcelPointCode !== null),
      ),
      counterpartAddress: (() => {
        if (row.status !== 'PAID' && row.step === null) return null;
        if (row.delivery === 'HOME' && viewerRole === 'REPAIRER') {
          return row.demande.locationLabel;
        }
        if (row.delivery === 'WORKSHOP' && viewerRole === 'CLIENT') {
          return (
            row.repairer.repairerProfile?.serviceAreaLabel ??
            (row.repairer.repairerProfile?.postalCode
              ? `Atelier (${row.repairer.repairerProfile.postalCode})`
              : null)
          );
        }
        return null;
      })(),
      paymentUnderReview: row.disputedAt !== null && !disputeOpen,
      // Livraison Boxtal (spec §5.3). Null / empty for local orders and manual-driver parcels.
      parcelOption: row.parcelOption,
      insuranceCents: row.insuranceCents,
      shippingLegs: shippingLegsFor(row),
      parcel:
        row.parcelWeightGrams !== null &&
        row.parcelLengthCm !== null &&
        row.parcelWidthCm !== null &&
        row.parcelHeightCm !== null &&
        row.parcelValueCents !== null
          ? {
              weightGrams: row.parcelWeightGrams,
              lengthCm: row.parcelLengthCm,
              widthCm: row.parcelWidthCm,
              heightCm: row.parcelHeightCm,
              valueCents: row.parcelValueCents,
            }
          : null,
      myParcelPointRequired:
        row.parcelOption === 'RELAY' &&
        !row.shippingAddresses.some((a) => a.role === viewerRole && a.parcelPointCode !== null),
      shipments: presentShipments(row.shipments),
      // Not `deletedAt: null` anywhere in this path, and that is the load-bearing half:
      // the unique index cannot see `deletedAt`, so a soft-deleted review still blocks a
      // second one. Reporting false after a removal would restore the button and make the
      // next tap a 422.
      reviewed: row.review !== null,
      orderNumber: orderNumberFor(row.id),
      demandeDescription: row.demande.description,
      photoUrls,
      client: {
        name: publicIdentity({ username: row.client.username, displayName: null }),
        avatarUrl:
          row.client.profile?.avatarPath == null
            ? null
            : (signed.get(row.client.profile.avatarPath) ?? null),
      },
      repairer: {
        userId: row.repairerUserId,
        name: publicIdentity({
          username: row.repairer.username,
          displayName: row.repairer.repairerProfile?.displayName ?? null,
        }),
        avatarUrl:
          row.repairer.profile?.avatarPath == null
            ? null
            : (signed.get(row.repairer.profile.avatarPath) ?? null),
      },
      disputeOpen,
      disputeOpenedAt: disputeOpen ? (row.dispute?.createdAt.toISOString() ?? null) : null,
      dispute: row.dispute
        ? {
            number: row.dispute.number,
            reference: formatDisputeReference(row.dispute.number),
            status: row.dispute.status,
            motifLabel: row.dispute.motif
              ? (DISPUTE_MOTIFS[row.dispute.motif]?.label ?? null)
              : (row.dispute.reason ?? null),
            openedAt: row.dispute.createdAt.toISOString(),
            assignedAt: row.dispute.assignedAt?.toISOString() ?? null,
            resolvedAt: row.dispute.resolvedAt?.toISOString() ?? null,
            verdict: row.dispute.verdict ?? null,
            resolutionNote: row.dispute.resolutionNote ?? null,
            openedBySide:
              row.dispute.initiator === 'CLIENT'
                ? 'CLIENT'
                : row.dispute.initiator === 'REPAIRER'
                  ? 'REPAIRER'
                  : 'REVIME',
            unread: unreadFor(row.dispute, viewerRole === 'CLIENT' ? 'CLIENT' : 'REPAIRER'),
          }
        : null,
      // CF4-15 / spec §6 (fix round 1, controller ruling R7). Read straight off
      // `partialRefundOf(row)` - `findOne`'s select already carries `status`,
      // `refundedCents` and `totalCents` - so the order details badge can say
      // « Remboursée partiellement » instead of the plain « Remboursée ».
      partialRefund: partialRefundOf(row),
      stepEvents: row.stepEvents.map((e) => ({ step: e.step, at: e.at.toISOString() })),
      conversationId: conversation?.id ?? null,
      // CF4-27 (spec §4.4, I6). `comment` null for the réparateur viewer - he sees the reason,
      // never the client's own words.
      cancellationRequest: row.cancellationRequests[0]
        ? {
            id: row.cancellationRequests[0].id,
            status: row.cancellationRequests[0].status,
            reason: row.cancellationRequests[0].reason,
            comment: viewerRole === 'REPAIRER' ? null : row.cancellationRequests[0].comment,
            refusalNote: row.cancellationRequests[0].refusalNote,
            createdAt: row.cancellationRequests[0].createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Each party supplies their OWN address, once. Idempotent, so a second submit
   * corrects a typo rather than failing.
   *
   * The role comes from the session and never from the body. That is P3 §11's
   * lesson from `GET /connect/refresh?u=`: a party-identifying parameter in a
   * request is a parameter someone can change.
   */
  async submitShippingAddress(
    userId: string,
    commandeId: string,
    input: ShippingAddressInput,
  ): Promise<CommandeDto> {
    if (!arePaymentsEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', TRACKING_OFF);
    }

    const row = await this.prisma.commande.findFirst({
      where: {
        id: commandeId,
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      select: {
        id: true,
        status: true,
        step: true,
        delivery: true,
        clientUserId: true,
        outboundTrackingNumber: true,
        parcelOption: true,
        cancellationRequestedAt: true,
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (row.delivery !== 'PARCEL') {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PARCEL);
    }
    // Before the status check, because NOT_PAID ("pas encore payée") is a FALSE
    // statement about a refunded commande - it was paid, and then repaid. Reachable
    // from a mobile screen loaded before the refund landed.
    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    if (row.status !== 'PAID' || row.step === null) {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PAID);
    }
    // CF4-27 (spec §4.3). Before the label-issued check: the address write is what buys the
    // label under the Boxtal driver (the controller calls `afterAddressWrite` right after this
    // method returns), so freezing it here is what stops a label purchase while a request is
    // pending - never reached, so `afterAddressWrite` is never reached either.
    if (row.cancellationRequestedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCELLATION_PENDING);
    }
    // An address edited after a label is printed is a lie the app would be
    // telling about where a parcel is going.
    if (row.outboundTrackingNumber !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', LABELS_ISSUED);
    }

    // Spec §7.4. Boxtal's contact phone is a MOBILE (« numéro de téléphone portable »); P4's
    // landline allowance stays for the manual driver, where a human reads the number.
    if (isShippingQuotesEnabled() && !frPhoneSchema.safeParse(input.phone).success) {
      throw new AppException('UNPROCESSABLE_ENTITY', MOBILE_REQUIRED, { phone: MOBILE_REQUIRED });
    }
    if (row.parcelOption === 'RELAY' && !input.parcelPoint) {
      throw new AppException('UNPROCESSABLE_ENTITY', RELAY_REQUIRED, { parcelPoint: RELAY_REQUIRED });
    }

    const role: CommandeRole = row.clientUserId === userId ? 'CLIENT' : 'REPAIRER';
    const data = {
      line1: input.line1,
      line2: input.line2 ?? null,
      postalCode: input.postalCode,
      city: input.city,
      phone: input.phone,
      // Livraison Boxtal: the relay where THIS party collects; null under HOME and the manual driver.
      parcelPointCode: input.parcelPoint?.code ?? null,
      parcelPointNetwork: input.parcelPoint?.network ?? null,
      parcelPointName: input.parcelPoint?.name ?? null,
      parcelPointAddress: input.parcelPoint?.address ?? null,
    };

    await this.prisma.shippingAddress.upsert({
      where: { commandeId_role: { commandeId, role } },
      create: { commandeId, role, ...data },
      update: data,
    });

    // AFTER the write commits, and only when the pair is complete and labels have
    // not been issued yet. Re-read rather than reasoning from `role`: the other
    // party may have landed theirs concurrently, and one address is not actionable
    // - nobody can buy a label with one end of a journey.
    const complete = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        demande: { select: { title: true } },
        client: { select: { name: true, firstName: true, lastName: true } },
        repairer: { select: { name: true, firstName: true, lastName: true } },
        shippingAddresses: true,
        outboundTrackingNumber: true,
      },
    });
    const client = complete?.shippingAddresses.find((a) => a.role === 'CLIENT');
    const repairer = complete?.shippingAddresses.find((a) => a.role === 'REPAIRER');
    // Send whenever both rows are present and no labels have been issued yet. The
    // labels-issued guard above already refuses any write once outboundTrackingNumber
    // is set, so "both present" implies "labels not yet issued" and nothing more is
    // needed to send on address correction before labels exist.
    // Under the Boxtal driver the server buys the labels itself (ShipmentsService.afterAddressWrite,
    // called by the controller after this write), so the operator's « buy two labels » mail is the
    // MANUAL driver's alone; the Boxtal path mails ops on failures only (Task 13).
    if (!isShippingQuotesEnabled() && complete && client && repairer && complete.outboundTrackingNumber === null) {
      const party = (
        u: { name: string; firstName: string | null; lastName: string | null },
        a: typeof client,
      ) => ({
        name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name,
        line1: a.line1,
        line2: a.line2,
        postalCode: a.postalCode,
        city: a.city,
        phone: a.phone,
      });
      await sendParcelOpsMail({
        commandeId,
        demandeTitle: complete.demande.title,
        client: party(complete.client, client),
        repairer: party(complete.repairer, repairer),
      });
    }

    return this.findOne(userId, commandeId);
  }

  /**
   * A compare-and-swap on the step, taking the step being CLAIMED rather than
   * "advance by one" - which is what makes a double tap harmless without a
   * client-side lock. Same shape as P1's `claimed` write.
   */
  async advance(
    userId: string,
    commandeId: string,
    input: AdvanceStepInput,
  ): Promise<CommandeDto> {
    if (!arePaymentsEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', TRACKING_OFF);
    }

    const row = await this.prisma.commande.findFirst({
      where: {
        id: commandeId,
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      select: {
        id: true,
        demandeId: true,
        status: true,
        step: true,
        delivery: true,
        clientUserId: true,
        repairerUserId: true,
        outboundTrackingNumber: true,
        returnTrackingNumber: true,
        returnSentAt: true,
        cancellationRequestedAt: true,
        disputedAt: true,
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    // Before the status check, because NOT_PAID ("pas encore payée") is a FALSE
    // statement about a refunded commande - it was paid, and then repaid. Reachable
    // from a mobile screen loaded before the refund landed.
    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    if (row.status !== 'PAID' || row.step === null) {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PAID);
    }
    // CF4-27 (spec §4.3, Review Focus 3). Before the successor/claimant checks, and
    // deliberately so both roles get the SAME refusal: label purchases happen on a step
    // claim, so they stop with it, and this is the one guard that must not distinguish
    // who is asking.
    if (row.cancellationRequestedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCELLATION_PENDING);
    }
    // CF5-04. Same placement and same reasoning as the cancellation freeze: both roles get
    // the same refusal. `disputedAt` covers app disputes and Stripe chargebacks alike, and is
    // the flag the release paths already check. The CAS below repeats it, so a dispute opened
    // after this read still blocks the write. `advanceBySystem` (carrier scans) is NOT frozen.
    if (row.disputedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_OPEN);
    }

    // BEFORE the successor check, and this ordering is the point. At
    // AWAITING_VALIDATION, RELEASED really is the successor and the client
    // really is the party who causes it - so the successor check passes and the
    // claimant check would refuse it with a message that is simply false.
    // STEP_CLAIMANT.RELEASED is null so this is belt and braces, which is what
    // it deserves: without it the row reads « Fonds débloqués » with no transfer
    // and §7.3's reconciliation query can no longer find it.
    if (input.step === 'RELEASED') {
      throw new AppException('UNPROCESSABLE_ENTITY', USE_VALIDATION);
    }

    // The RETURN_SENT skip, and it sits HERE deliberately. A réparateur claiming
    // AWAITING_VALIDATION from RETURN_SENT fails the successor check below,
    // because nextStepFor('RETURN_SENT','PARCEL') is RETURN_RECEIVED - so the
    // permission has to be granted before that check, not by loosening it.
    //
    // It bypasses the successor check ONLY. The claimant check still runs, which
    // is what stops a client riding this, and labelReady still runs and is a
    // no-op for this step because LABEL_REQUIRED_BY holds only PARCEL_SENT and
    // RETURN_SENT. See the P5 spec §5.2.
    const timeoutSkip =
      input.step === 'AWAITING_VALIDATION' && row.step === 'RETURN_SENT';
    if (timeoutSkip) {
      const open = canRequestReleaseAfterTimeout(
        {
          delivery: row.delivery,
          step: row.step,
          returnSentAt: row.returnSentAt?.toISOString() ?? null,
        },
        new Date(),
      );
      if (!open) {
        throw new AppException('UNPROCESSABLE_ENTITY', TIMEOUT_NOT_REACHED);
      }
    }

    const expected = nextStepFor(row.step, row.delivery);
    if (!timeoutSkip && (expected === null || expected !== input.step)) {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_NEXT_STEP);
    }

    const role: CommandeRole = row.clientUserId === userId ? 'CLIENT' : 'REPAIRER';
    if (STEP_CLAIMANT[input.step] !== role) {
      throw new AppException('FORBIDDEN', OTHER_PARTY);
    }

    // Last, deliberately. A wrong step or the wrong party is a truer thing to
    // say than "your label is not ready", and the earlier guards say it. This is
    // the same function the button reads, so a client is never offered a step
    // the server will refuse here.
    if (!labelReady(input.step, row)) {
      throw new AppException('UNPROCESSABLE_ENTITY', LABEL_NOT_ISSUED);
    }

    // FIX 2: Zero rows means a sibling request already moved it and already sent
    // the notification, so emitting here would double it.
    const written = await this.prisma.$transaction(async (tx) => {
      const result = await tx.commande.updateMany({
        where: { id: commandeId, status: 'PAID', step: row.step, disputedAt: null },
        data: {
          step: input.step,
          ...(input.step === 'AWAITING_VALIDATION'
            ? { releaseRequestedAt: new Date() }
            : {}),
          // The fact the timeout measures from. Stamped here rather than derived,
          // because a step is a state and this is an event.
          ...(input.step === 'RETURN_SENT' ? { returnSentAt: new Date() } : {}),
        },
      });
      if (result.count > 0) await recordStep(tx, commandeId, input.step);
      return result;
    });

    // The party who did NOT cause this step, per STEP_CLAIMANT - the single source
    // of truth for who causes what, so this cannot drift from the guard above. Design §4.2.
    //
    // A null claimant means PAID or RELEASED, and neither is notified from HERE: RELEASED is
    // covered by FUNDS_RELEASED, and PAID never reaches `advanceStep` at all - the payment
    // webhook sets it. 🛑 Do not read this guard as « PAID is not notified »: since CF-43 it
    // IS, to the client, from `completeBySessionId` via `notifyClientOfPaidCommande`. What
    // this branch still guarantees is that no step notification is addressed to the party who
    // caused it, and that a claimant-less step is not announced twice.
    const claimant = STEP_CLAIMANT[input.step];
    if (claimant !== null && written.count > 0) {
      const parties = await this.prisma.commande.findFirst({
        where: { id: commandeId },
        select: {
          demande: { select: { title: true } },
          client: { select: { username: true } },
          repairer: {
            select: { username: true, repairerProfile: { select: { displayName: true } } },
          },
        },
      });
      const recipientIsClient = claimant === 'REPAIRER';
      await this.notifications.emit({
        userId: recipientIsClient ? row.clientUserId : row.repairerUserId,
        mode: recipientIsClient ? 'CLIENT' : 'REPAIRER',
        type: 'COMMANDE_STEP',
        step: input.step,
        // The CLAIMANT's name, because the copy reads « X a démarré la réparation ».
        actorName: parties
          ? (recipientIsClient
              ? publicIdentity({
                  username: parties.repairer.username,
                  displayName: parties.repairer.repairerProfile?.displayName ?? null,
                })
              : publicIdentity({ username: parties.client.username, displayName: null }))
          : null,
        subject: parties?.demande.title ?? null,
        commandeId,
      });
    }

    if (written.count > 0) {
      if (input.step === 'REPAIR_STARTED') {
        await this.announcer.postSystemMessage(row, "🔧 Réparation en cours : le réparateur a commencé l'intervention.");
      } else if (input.step === 'REPAIR_DONE') {
        await this.announcer.postSystemMessage(row, "✅ Réparation terminée : le réparateur a terminé l'intervention.");
      } else if (input.step === 'AWAITING_VALIDATION') {
        await this.announcer.postSystemMessage(row, "⏳ En attente de validation : le réparateur demande la validation de la réparation.");
      }
    }

    return this.findOne(userId, commandeId);
  }

  /**
   * Livraison Boxtal (spec §8.5). The carrier's first scan moves a SENDING step. Beside
   * `releaseInternal` as the second internal caller: no userId, no claimant check, and `step`
   * is restricted to the two SCAN_ADVANCES values - anything else throws, and a test pins it.
   * The successor check stays (the party may already have tapped), and so does `labelReady`,
   * and so does the CAS write stamping `returnSentAt`, so P5's clock keeps its input.
   */
  async advanceBySystem(commandeId: string, step: CommandeStep): Promise<'advanced' | 'skipped'> {
    if (!(Object.values(SCAN_ADVANCES) as CommandeStep[]).includes(step)) {
      throw new Error(`advanceBySystem refuses ${step}: only a sending step may follow a scan`);
    }
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId },
      select: {
        id: true,
        demandeId: true,
        status: true,
        step: true,
        delivery: true,
        clientUserId: true,
        repairerUserId: true,
        outboundTrackingNumber: true,
        returnTrackingNumber: true,
      },
    });
    if (!row || row.status !== 'PAID' || row.step === null || row.delivery !== 'PARCEL') return 'skipped';
    if (nextStepFor(row.step, row.delivery) !== step) return 'skipped';
    if (!labelReady(step, row)) return 'skipped';

    const written = await this.prisma.$transaction(async (tx) => {
      const result = await tx.commande.updateMany({
        where: { id: commandeId, status: 'PAID', step: row.step },
        data: { step, ...(step === 'RETURN_SENT' ? { returnSentAt: new Date() } : {}) },
      });
      if (result.count > 0) await recordStep(tx, commandeId, step);
      return result;
    });
    if (written.count === 0) return 'skipped';

    if (step === 'PARCEL_SENT') {
      await this.announcer.postSystemMessage(row, "📦 Colis expédié : le colis est en cours d'acheminement.");
    } else if (step === 'RETURN_SENT') {
      await this.announcer.postSystemMessage(row, "📦 Colis retour expédié : l'objet réparé est en route vers le client.");
    }

    const parties = await this.prisma.commande.findFirst({
      where: { id: commandeId },
      select: { demande: { select: { title: true } } },
    });
    // The party who did NOT send: the réparateur for PARCEL_SENT, the client for RETURN_SENT.
    const recipientIsClient = step === 'RETURN_SENT';
    await this.notifications.emit({
      userId: recipientIsClient ? row.clientUserId : row.repairerUserId,
      mode: recipientIsClient ? 'CLIENT' : 'REPAIRER',
      type: 'COMMANDE_STEP',
      step,
      actorName: 'le transporteur',
      subject: parties?.demande.title ?? null,
      commandeId,
    });
    return 'advanced';
  }

  /**
   * The client validates and the réparateur is paid.
   *
   * This method owns ONE thing the cron does not: proving the caller is the
   * client. Everything else is `releaseInternal`, so the button and the
   * auto-release job cannot come to disagree about what a release is.
   */
  async release(userId: string, commandeId: string): Promise<CommandeDto> {
    if (!arePaymentsEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', PAYMENTS_OFF);
    }
    if (!isConnectEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', RELEASE_OFF);
    }

    const owner = await this.prisma.commande.findFirst({
      where: { id: commandeId, OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
      select: { clientUserId: true },
    });
    if (!owner) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (owner.clientUserId !== userId) {
      throw new AppException('FORBIDDEN', CLIENT_ONLY);
    }

    await this.releaseInternal(commandeId);
    return this.findOne(userId, commandeId);
  }

  /**
   * The release sequence, with NO caller identity. The client's route and the
   * auto-release job both come through here.
   *
   * Ordering is the design and not an implementation detail - see the P3 spec §7.
   * Do not "tidy" it into a transaction: a network call cannot go inside a Prisma
   * transaction, which is what makes the ordering a real choice.
   */
  async releaseInternal(commandeId: string): Promise<'released' | 'healed' | 'skipped'> {
    if (!arePaymentsEnabled() || !isConnectEnabled()) {
      console.warn(
        '[commandes] release skipped for commande %s: PAYMENTS_ENABLED=%s CONNECT_ENABLED=%s',
        commandeId,
        process.env.PAYMENTS_ENABLED,
        process.env.CONNECT_ENABLED,
      );
      return 'skipped';
    }

    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        id: true,
        status: true,
        step: true,
        repairCents: true,
        stripeChargeId: true,
        stripeTransferId: true,
        disputedAt: true,
        cancellationRequestedAt: true,
        stripeRefundId: true,
        stripeTransferReversalId: true,
        clientUserId: true,
        repairerUserId: true,
        demandeId: true,
        repairer: { select: { banned: true } },
        demande: { select: { title: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    // Before the step check: an already-released row is at RELEASED, and
    // NOT_FINISHED would be a misleading thing to tell someone about it.
    if (row.stripeTransferId) {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_RELEASED);
    }
    // BEFORE the step check. A disputed commande is usually at
    // AWAITING_VALIDATION, so NOT_FINISHED would be a false thing to say about
    // it - and releasing here would pay the réparateur out of money that is
    // being clawed back, which is a double loss.
    if (row.disputedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', UNDER_REVIEW);
    }
    // CF4-27 (spec §4.3, Review Focus 3). Checked beside `disputedAt`, same shape: releasing
    // while a cancellation request is pending would pay the réparateur while REVIME is still
    // deciding whether to refund the client - the same double-loss `disputedAt` guards
    // against. `releaseInternal`'s final CAS write is NOT changed (spec §4.2's release race);
    // this guard is what stops normal releases, and the race is accepted deliberately (see
    // that transition table note) rather than closed here too.
    if (row.cancellationRequestedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCELLATION_PENDING);
    }
    // A recorded reversal means a clawback really happened: money left the
    // réparateur's balance. Never release such a row.
    if (row.stripeTransferReversalId) {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    // Same class as advance()'s message fix: NOT_FINISHED is a false thing to say
    // about a refunded commande. Reachable in the webhook-lag window where the row
    // reads REFUNDED and Stripe already reports the refund failed - the row's
    // disposition is what the client sees, so it is what we answer with. Before the
    // refund gate below, which is about PAID rows and would spend a Stripe read.
    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    // C-1 + final review: a refund id on a PAID row does NOT prove the client
    // was repaid. `syncRefundState` puts a failed refund's row back to PAID and
    // keeps the id, so the id alone cannot distinguish "already refunded" from
    // "a refund was attempted and Stripe refused it". A refund Stripe reports as
    // failed moved no money, so THAT refund leaves the escrow intact.
    //
    // A narrow claim, deliberately: this reads the one refund the row records, not
    // the charge's refunded total. The two differ in exactly one state - a
    // replacement refund that succeeded and whose persist failed leaves the OLD
    // failed id here. What stops that from releasing money the client already got
    // back is not this check: Stripe refuses a source_transaction transfer on a
    // fully-refunded charge. That backstop disappears the day partial refunds
    // exist, and on that day this gate must read the charge, not one refund id.
    if (row.stripeRefundId) {
      const existing = await paymentsGateway()
        .retrieveRefund(row.stripeRefundId)
        .catch((e: unknown) => {
          // Refuse rather than pay out against an unknown refund state.
          console.error(
            '[commandes] could not read refund %s for commande %s',
            row.stripeRefundId,
            commandeId,
            e,
          );
          throw new AppException('UNPROCESSABLE_ENTITY', REFUND_STATE_UNKNOWN);
        });
      if (existing.status !== 'failed' && existing.status !== 'canceled') {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
      }
    }
    // I-7: A réparateur banned for fraud after the repair is auto-paid seven days
    // later, and J1 removes the last human who might have noticed. The client's
    // button and J1 both go through this method.
    if (row.repairer.banned) {
      throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_BANNED);
    }
    if (row.status !== 'PAID' || row.step !== 'AWAITING_VALIDATION') {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_FINISHED);
    }
    if (!row.stripeChargeId) {
      // P1's amendment: the PAID early return means no redelivery backfills this,
      // so the row is permanently unreleasable until reconciled by hand. Loud.
      console.error('[commandes] release blocked: PAID commande with no charge id', commandeId);
      throw new AppException('UNPROCESSABLE_ENTITY', CHARGE_MISSING);
    }

    const account = await this.prisma.connectAccount.findUnique({
      where: { userId: row.repairerUserId },
      select: { stripeAccountId: true },
    });
    // V8 B2. NO Connect account is a HOLD, not a refusal. It used to throw « Le réparateur ne peut pas
    // encore recevoir de paiement. », so a réparateur who had never opened « Virements » blocked the
    // client's validation AND the auto-release (production order a5c6ceba, V8 FND8-015), while an
    // inactive account was already held. Held the same way, it is paid by `payoutStrandedCommandes`
    // once his account activates (`connect.service.ts`: a new row starts with `transfersActive` false,
    // so its first activation fires it) or by the cron's `heldPayouts` sweep.
    //
    // FROM STRIPE, not from the row, when there is an account. P2 §16 requires it, and P2's own I2
    // finding was a bug caused by trusting a `VERIFIED` row that had gone stale - the row is only as
    // fresh as the last account.updated webhook.
    const transfersActive = account
      ? (
          await connectGateway()
            .retrieveAccount(account.stripeAccountId)
            .catch((e: unknown) => {
              // An outage is retryable: refuse with its own message rather than hold on a guess.
              console.error(
                '[commandes] could not read the connected account',
                account.stripeAccountId,
                e,
              );
              throw new AppException('UNPROCESSABLE_ENTITY', ACCOUNT_UNREADABLE);
            })
        ).transfersActive
      : false;
    // CMP-D3, the golden rule: no payout while the réparateur's fiscal information (DAC7) is
    // incomplete. The funds stay in the platform's escrow (the row goes RELEASED with no transfer)
    // and `payoutStrandedCommandes` pays them when the declaration lands. The predicate is the one
    // every transfer site shares, see fiscal-gate.ts.
    const fiscalComplete = await repairerFiscalComplete(this.prisma, row.repairerUserId);

    if (!account || !transfersActive || !fiscalComplete) {
      if (!account) {
        console.warn(
          '[commandes] transfer held for commande %s: repairer %s has no Connect account yet (V8 B2)',
          commandeId,
          row.repairerUserId,
        );
      }
      if (!fiscalComplete) {
        console.warn(
          '[commandes] transfer held for commande %s: repairer %s has not completed fiscal declaration (CMP-D3)',
          commandeId,
          row.repairerUserId,
        );
      }
      const written = await this.prisma.$transaction(async (tx) => {
        const result = await tx.commande.updateMany({
          where: { id: commandeId, step: 'AWAITING_VALIDATION', stripeTransferId: null, status: 'PAID' },
          data: {
            step: 'RELEASED',
            releasedAt: new Date(),
          },
        });
        if (result.count > 0) await recordStep(tx, commandeId, 'RELEASED');
        return result;
      });
      if (written.count > 0) {
        await this.emitFundsReleased(
          row.clientUserId,
          row.repairerUserId,
          row.repairCents,
          row.demande.title,
          commandeId,
          true,
        );
        await this.announcer.announce(commandeId, 'FUNDS_RELEASED');
      }
      return 'released';
    }

    // 🛑 THE DOUBLE-PAY GUARD, and it runs on EVERY release rather than only past
    // the 24-hour idempotency window. P3 §7.2 named this as the one failure mode
    // in that piece able to pay twice, and shipped a documented query. A query is
    // not a guard: it only helps if a human runs it before retrying.
    //
    // It runs for the CLIENT'S route too, not only the cron. A cron-only
    // mitigation would leave the human-triggered path open, which is the path a
    // client actually retries.
    //
    // One extra Stripe read on a rare operation, with no window arithmetic to get
    // wrong, against paying a réparateur twice. See the P5 spec §5.5.
    const already = await paymentsGateway()
      .findTransferBySource({
        destination: account.stripeAccountId,
        sourceTransaction: row.stripeChargeId,
      })
      .catch((e: unknown) => {
        // Refuse rather than transfer blind. An outage here must not become a
        // second payment.
        console.error('[commandes] could not check for an existing transfer', commandeId, e);
        throw new AppException('UNPROCESSABLE_ENTITY', TRANSFER_FAILED);
      });

    if (already) {
      if (already.amountCents !== row.repairCents) {
        console.error(
          '[commandes] amount mismatch on heal for commande %s: row has %d, transfer %s has %d',
          commandeId,
          row.repairCents,
          already.id,
          already.amountCents,
        );
      }
      // status: 'PAID' defends against a refund landing between releaseInternal's
      // read and this write.
      const healed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.commande.updateMany({
          where: { id: commandeId, step: 'AWAITING_VALIDATION', stripeTransferId: null, status: 'PAID' },
          data: {
            step: 'RELEASED',
            releasedAt: new Date(),
            stripeTransferId: already.id,
            transferredCents: already.amountCents,
            transferredAt: new Date(),
          },
        });
        if (result.count > 0) await recordStep(tx, commandeId, 'RELEASED');
        return result;
      });
      if (healed.count === 0) {
        console.warn(
          '[commandes] transfer %s already healed or concurrent release for commande %s',
          already.id,
          commandeId,
        );
      } else {
        console.warn(
          '[commandes] healed a stranded release for commande %s from transfer %s',
          commandeId,
          already.id,
        );
        // FIX 1: Emit on the healed path too, so both parties are told when funds
        // release succeeds via the heal rather than via the normal write.
        await this.emitFundsReleased(
          row.clientUserId,
          row.repairerUserId,
          already.amountCents,
          row.demande.title,
          commandeId,
          false,
        );
        await this.announcer.announce(commandeId, 'FUNDS_RELEASED');
      }
      return 'healed';
    }

    // TRANSFER BEFORE THE WRITE, deliberately. A crash between the two leaves the
    // money moved and the row at AWAITING_VALIDATION, so a retry replays the same
    // transfer under the same key and completes - self-healing. The reverse order
    // leaves RELEASED with no money moved, the client reading « Fonds débloqués »,
    // and the step guard refusing the correction. Spec §7.1. Note a network call
    // cannot go inside a $transaction, which is what makes this a real choice.
    const transfer = await paymentsGateway()
      .createTransfer(
        {
          amountCents: row.repairCents,
          destination: account.stripeAccountId,
          sourceTransaction: row.stripeChargeId,
          transferGroup: commandeId,
        },
        `release:${commandeId}`,
      )
      .catch(async (e: unknown) => {
        console.error('[commandes] transfer failed for commande', commandeId, e);
        await this.reportPayoutFailure(commandeId, 'release', e);
        throw new AppException('UNPROCESSABLE_ENTITY', TRANSFER_FAILED);
      });

    // The durable double-pay guard, because the idempotency key above expires
    // after 24 hours. Spec §7.2. status: 'PAID' defends against a refund landing
    // between releaseInternal's read and this write.
    const written = await this.prisma.$transaction(async (tx) => {
      const result = await tx.commande.updateMany({
        where: { id: commandeId, step: 'AWAITING_VALIDATION', stripeTransferId: null, status: 'PAID' },
        data: {
          step: 'RELEASED',
          releasedAt: new Date(),
          stripeTransferId: transfer.id,
          transferredCents: row.repairCents,
          transferredAt: new Date(),
        },
      });
      if (result.count > 0) await recordStep(tx, commandeId, 'RELEASED');
      return result;
    });
    if (written.count === 0) {
      // Money HAS moved. Benign today - a sibling request wrote the same replayed
      // transfer id - but this is the one branch that could otherwise go silent
      // after a real transfer, and it is what the reconciliation query looks for.
      console.error(
        '[commandes] transfer %s succeeded but wrote no row for commande %s',
        transfer.id,
        commandeId,
      );
    }

    // FIX 2: Only emit when the write succeeded. Zero rows means a sibling request
    // wrote the same replayed transfer id and already sent the notification, so
    // emitting here would double it.
    if (written.count > 0) {
      await this.emitFundsReleased(
        row.clientUserId,
        row.repairerUserId,
        row.repairCents,
        row.demande.title,
        commandeId,
        false,
      );
      await this.announcer.announce(commandeId, 'FUNDS_RELEASED');
    }

    return 'released';
  }

  /**
   * Pays the orders that were released to a réparateur but never transferred: the Connect account was
   * not active yet, or (CMP-D3) the fiscal declaration was incomplete. Called when the situation that
   * held them changes (declaration submitted, account activated) and by the cron's held-payout sweep,
   * so a call that fails or finds nothing to do is retried rather than lost.
   *
   * It applies the same refusals as `releaseInternal` (dispute, pending cancellation, refund,
   * reversal, ban, fiscal) and the same two double-pay guards: Stripe is asked whether a transfer
   * already exists for the charge (the idempotency key expires after 24 hours and a held order waits
   * far longer than that), and the row is written with a compare-and-set on `stripeTransferId`.
   */
  async payoutStrandedCommandes(repairerUserId: string): Promise<{ paid: number; failed: number }> {
    const outcome = { paid: 0, failed: 0 };
    const stranded = await this.prisma.commande.findMany({
      where: { repairerUserId, ...HELD_PAYOUT_WHERE },
      select: {
        id: true,
        repairCents: true,
        stripeChargeId: true,
        demande: { select: { title: true } },
      },
    });

    if (stranded.length === 0) return outcome;

    const account = await this.prisma.connectAccount.findUnique({
      where: { userId: repairerUserId },
      select: { stripeAccountId: true },
    });
    if (!account) return outcome;

    const live = await connectGateway().retrieveAccount(account.stripeAccountId).catch(() => null);
    if (!live || !live.transfersActive) return outcome;

    const repairer = await this.prisma.user.findUnique({
      where: { id: repairerUserId },
      select: { banned: true },
    });
    if (repairer?.banned) return outcome;

    if (!(await repairerFiscalComplete(this.prisma, repairerUserId))) {
      console.warn(
        '[commandes] stranded payout held for repairer %s: fiscal declaration incomplete (CMP-D3)',
        repairerUserId,
      );
      return outcome;
    }

    for (const row of stranded) {
      if (!row.stripeChargeId) continue;

      try {
        const already = await paymentsGateway().findTransferBySource({
          destination: account.stripeAccountId,
          sourceTransaction: row.stripeChargeId,
        });
        const transfer = already
          ? { id: already.id, amountCents: already.amountCents }
          : {
              id: (
                await paymentsGateway().createTransfer(
                  {
                    amountCents: row.repairCents,
                    destination: account.stripeAccountId,
                    sourceTransaction: row.stripeChargeId,
                    transferGroup: row.id,
                  },
                  `release:${row.id}`,
                )
              ).id,
              amountCents: row.repairCents,
            };

        const written = await this.prisma.commande.updateMany({
          where: { id: row.id, status: 'PAID', step: 'RELEASED', stripeTransferId: null },
          data: {
            stripeTransferId: transfer.id,
            transferredCents: transfer.amountCents,
            transferredAt: new Date(),
          },
        });
        if (written.count === 0) {
          // Money HAS moved (or already had): a concurrent sweep wrote the same transfer.
          console.error(
            '[commandes] stranded transfer %s wrote no row for commande %s',
            transfer.id,
            row.id,
          );
          continue;
        }

        // The client was told « Fonds débloqués » when the order was released; the réparateur was
        // told to complete his declaration. This is the message he has been waiting for.
        await this.notifications.emit({
          userId: repairerUserId,
          mode: 'REPAIRER',
          type: 'FUNDS_RELEASED',
          amountCents: transfer.amountCents,
          subject: row.demande.title,
          commandeId: row.id,
        });
        outcome.paid += 1;
      } catch (e) {
        console.error('[commandes] stranded payout failed for commande', row.id, e);
        outcome.failed += 1;
        await this.reportPayoutFailure(row.id, 'stranded', e);
      }
    }
    return outcome;
  }

  /**
   * The cron's safety net for held payouts. The triggers that call `payoutStrandedCommandes` (a
   * declaration submitted, a Connect account activated) fire once and swallow a Stripe outage; a
   * business verification approved by an operator fires nothing at all. Without this sweep an order
   * held for any of those reasons waits until somebody notices. Each réparateur goes through the
   * same guards and double-pay checks as the triggered call, so running it every few hours is safe.
   */
  async payoutHeldCommandes(): Promise<{ scanned: number; acted: number; failed: number }> {
    const holders = await this.prisma.commande.findMany({
      where: HELD_PAYOUT_WHERE,
      select: { repairerUserId: true },
      distinct: ['repairerUserId'],
    });
    let acted = 0;
    let failed = 0;
    for (const { repairerUserId } of holders) {
      try {
        const outcome = await this.payoutStrandedCommandes(repairerUserId);
        acted += outcome.paid;
        failed += outcome.failed;
      } catch (e) {
        console.error('[commandes] held payout sweep failed for repairer', repairerUserId, e);
        failed += 1;
      }
    }
    return { scanned: holders.length, acted, failed };
  }

  /**
   * Emit FUNDS_RELEASED to both parties. Factored out so both the normal release path
   * and the healed path notify identically - which is what stops them drifting apart.
   * The healed path is the reason this helper exists.
   *
   * `payoutHeld` (CMP-D3, widened by V8 B2): the client's money did leave escrow, so the client still
   * reads « Fonds débloqués ». The réparateur was NOT paid, so he gets PAYOUT_WAITING, the client's
   * own sentence « Votre paiement de X vous attend : terminez votre configuration pour le recevoir. »,
   * whatever held it (no Connect account, account not active, fiscal information missing). It used to
   * be FISCAL_DECLARATION_REQUIRED for a fiscal hold and FUNDS_RELEASED (« versés sur votre compte »,
   * false) for an account hold. `payoutStrandedCommandes` sends the real FUNDS_RELEASED later.
   */
  private async emitFundsReleased(
    clientUserId: string,
    repairerUserId: string,
    amountCents: number,
    subject: string,
    commandeId: string,
    payoutHeld: boolean,
  ): Promise<void> {
    await this.notifications.emit({
      userId: clientUserId,
      mode: 'CLIENT',
      type: 'FUNDS_RELEASED',
      amountCents,
      subject,
      commandeId,
    });
    await this.notifications.emit(
      payoutHeld
        ? {
            userId: repairerUserId,
            mode: 'REPAIRER',
            type: 'PAYOUT_WAITING',
            amountCents,
            subject,
            commandeId,
          }
        : {
            userId: repairerUserId,
            mode: 'REPAIRER',
            type: 'FUNDS_RELEASED',
            amountCents,
            subject,
            commandeId,
          },
    );
  }
}
