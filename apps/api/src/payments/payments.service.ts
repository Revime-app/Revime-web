import { Injectable, Optional } from '@nestjs/common';
import type {
  CheckoutSessionResponse,
  CreateCheckoutInput,
  DeliveryMode,
  ExecutionDelayPreference,
  ParcelDetails,
  ParcelOption,
  QuotedShipping,
  ShipmentLeg,
} from '@revime/shared';
import {
  computeAmounts,
  CURRENT_WITHDRAWAL_WAIVER_VERSION,
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
  orderNumberFor,
  publicIdentity,
  verifiedBadgeFor,
} from '@revime/shared';
import { AdminAlertsService } from '../admin/admin-alerts.service.js';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { claimStripeEvent } from '../common/stripe-event-claim.js';
import { recordStep } from '../commandes/record-step.js';
import { VISIBLE_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { isMessagingEnabled } from '../conversations/flag.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsentProofsService } from '../compliance/consent-proofs.service.js';
import { isShippingQuotesEnabled } from '../shipping/config.js';
import type { LegOffer } from '../shipping/gateway.js';
import { paidLegPair, type LegPair, type QuoteLegs } from '../shipping/shipping-quotes.service.js';
import {
  arePaymentsEnabled,
  assertPaymentAmountAllowed,
  GATEWAY_GRACE_MS,
  isStripeTestMode,
} from './config.js';
import { paymentsGateway, type PaymentIntentSummary } from './gateway.js';
import { openConversationForPaidCommande } from './open-conversation.js';
import {
  notifyClientOfAbandonedPayment,
  notifyClientOfPaidCommande,
} from './payment-notifications.js';

/** Stripe's minimum session lifetime is 30 minutes; this is comfortably inside its maximum of 24 hours. */
export const SESSION_TTL_SECONDS = 60 * 60;

/**
 * The compliance backstop, not the product's release timer. Stripe caps holding
 * at 90 days outside the US, so a commande nobody ever validates still has a
 * dated obligation attached to it. P3 recomputes this from a repair-finished
 * event.
 */
const AUTO_RELEASE_DAYS = 60;

const PAYMENTS_OFF = "Le paiement n'est pas encore disponible.";
const OFFER_UNAVAILABLE = "Cette offre n'est plus disponible.";
const ALREADY_PAYING = 'Un paiement est déjà en cours pour cette demande.';
const ALREADY_PAID = 'Ce paiement a déjà été effectué.';
const PARCEL_REFUSED = "Ce réparateur n'accepte pas l'envoi par colis.";

// Livraison Boxtal, spec §7.2.
const QUOTE_REQUIRED = 'Devis de livraison requis.';
const QUOTE_EXPIRED = 'Le devis de livraison a expiré.';
const OPTION_UNAVAILABLE = "Cette option de livraison n'est pas disponible.";
const INSURANCE_UNAVAILABLE = "L'assurance n'est pas disponible pour cette valeur.";

/**
 * The two fields that tell the app which Stripe mode it is paying in, for EVERY checkout response
 * (a new intent, a reused intent, a reused hosted session). One builder so a retry path cannot
 * omit them (CF6-07 found two that did). The publishable key is what the app pays with, so a
 * mismatch with the secret key is refused upstream by `arePaymentsEnabled()` (PRE-4).
 */
function checkoutModeFields(): { publishableKey?: string; isTestMode: boolean } {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  return {
    ...(publishableKey ? { publishableKey } : {}),
    isTestMode: isStripeTestMode(),
  };
}

/**
 * What checkout read off the `ShippingQuote` row for the pair the client is paying for. `legs`
 * is THAT pair - the insured one when `insured`, which may be a dearer carrier than the
 * uninsured cheapest (spec « Amendment, 2026-09-04 », Task 10 addendum) - so Task 13 orders
 * exactly what was priced.
 */
export type ResolvedQuote = {
  quoteId: string;
  parcelOption: ParcelOption;
  quoted: QuotedShipping;
  parcel: ParcelDetails;
  legs: Record<ShipmentLeg, LegOffer>;
  insured: boolean;
};

@Injectable()
export class PaymentsService {
  private readonly consentProofs?: ConsentProofsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly conversations: ConversationsService,
    consentProofs?: ConsentProofsService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {
    this.consentProofs = consentProofs ?? ((prisma as any)?.consentProof ? new ConsentProofsService(prisma) : undefined);
  }

  async createCheckout(
    userId: string,
    offerId: string,
    input: CreateCheckoutInput,
  ): Promise<CheckoutSessionResponse> {
    if (!arePaymentsEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', PAYMENTS_OFF);
    }

    // Authorship is in the WHERE, so an offer on someone else's demande 404s
    // indistinguishably from a nonexistent one.
    const offer = await this.prisma.offer.findFirst({
      where: {
        id: offerId,
        deletedAt: null,
        demande: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },
      },
      select: {
        id: true,
        status: true,
        priceCents: true,
        acceptsParcel: true,
        repairerUserId: true,
        demandeId: true,
        demande: {
          select: { status: true, author: { select: { email: true } } },
        },
        // 🛑 B2 §8.3. SELECTED so the suspension guard below can read it. Through
        // `repairer.profile` and never `repairer.repairerProfile`, which is optional - see
        // `offer-predicates.ts`. Prisma returns `undefined` for an unselected field and
        // `undefined` is falsy, so dropping this select would silently disarm that guard; `tsc`
        // refuses it first with TS2339, which is the only reason that is safe to rely on.
        repairer: {
          select: {
            profile: {
              select: {
                verificationLevel: true,
                repairerSuspendedAt: true,
              },
            },
          },
        },
      },
    });
    if (!offer) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    // Findable but not payable, so a reason rather than a 404.
    if (offer.status !== 'SENT') {
      throw new AppException('UNPROCESSABLE_ENTITY', OFFER_UNAVAILABLE);
    }
    if (offer.demande.status !== 'OPEN') {
      throw new AppException('UNPROCESSABLE_ENTITY', OFFER_UNAVAILABLE);
    }

    /**
     * 🛑 B2 §8.3, AND THE ONLY PLACE THE SUSPENSION RULE TOUCHES MONEY. §5.2 makes a suspended
     * réparateur's offers invisible on every read - including `listForDemande`, the screen this
     * request comes from - but a read filter is not a guard. A client holding a screen loaded
     * before the suspension, or replaying the request, would otherwise accept and pay a
     * réparateur the platform has just stopped listing. Nothing writes `WITHDRAWN` on suspension
     * (`CF-D7` part 2 refused that), so `offer.status` is still `SENT` and the check above passes.
     *
     * AFTER the two status checks, not before: those are cheaper, they are the far commoner
     * refusal, and keeping them adjacent leaves one « findable but not payable » block.
     *
     * 🛑 `OFFER_UNAVAILABLE`, REUSED DELIBERATELY, and the wording is the decision rather than a
     * default. Three reasons. It is true and actionable for the client - the offer really is no
     * longer available to him. It discloses no moderation action taken against a third party:
     * `repairerSuspendedReason` is the operator's internal note (`users.service.ts`), and a
     * client is not an audience for it. And it is INDISTINGUISHABLE from the two refusals above,
     * so a client cannot probe which réparateurs are suspended by comparing error strings - the
     * same non-enumeration reasoning the authorship filter in the WHERE above already applies.
     * `REPAIRER_SUSPENDED` was the alternative and is wrong here: it is written in the second
     * person to the réparateur himself.
     *
     * Truthiness on the `Date`, matching `admin-repairers-write.service.ts`'s own test of this
     * column. `profile` is optional in the schema, so `?.` is required; it is never null in
     * practice, and a null one would fail OPEN here - acceptable because the state cannot occur
     * and because refusing a real payment over a data anomaly is the worse of the two.
     */
    if (offer.repairer.profile?.repairerSuspendedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', OFFER_UNAVAILABLE);
    }

    const isPro = verifiedBadgeFor(offer.repairer.profile?.verificationLevel) === 'BUSINESS';
    const delayPref = input.delayPreference ?? 'IMMEDIATE';
    if (isPro) {
      if (delayPref === 'IMMEDIATE') {
        if (
          !input.withdrawalWaiver ||
          input.withdrawalWaiver.accepted !== true ||
          input.withdrawalWaiver.acceptedText !== LEGAL_WITHDRAWAL_WAIVER_TEXT
        ) {
          throw new AppException(
            'UNPROCESSABLE_ENTITY',
            "L'accord préalable et exprès de renonciation au droit de rétractation est obligatoire pour démarrer la réparation immédiatement auprès d'un professionnel.",
          );
        }
      }
    }

    // BEFORE the amount is computed and before any row exists, so a refused
    // delivery mode can never produce a Stripe session for a 1900-cent line
    // that will not be honoured.
    if (input.delivery === 'PARCEL' && !offer.acceptsParcel) {
      throw new AppException('UNPROCESSABLE_ENTITY', PARCEL_REFUSED);
    }

    // AFTER the acceptsParcel guard and BEFORE computeAmounts (spec §7.2): the amounts a
    // parcel is charged come from the quote ROW, never from the request.
    const resolved = await this.resolveQuote(userId, offer, input);

    const reusable = await this.resolvePending(
      offer.demandeId,
      offer.id,
      input.delivery,
      resolved,
      delayPref,
    );
    if (reusable) return reusable;

    const amounts = computeAmounts(offer.priceCents, input.delivery, resolved?.quoted);

    try {
      assertPaymentAmountAllowed(amounts.totalCents);
    } catch (e) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        e instanceof Error ? e.message : 'Montant non autorise.',
      );
    }

    // The row exists before the session, so the unique index is what serialises
    // two concurrent taps rather than a check-then-create window.
    const commande = await this.prisma.commande
      .create({
        data: {
          demandeId: offer.demandeId,
          offerId: offer.id,
          clientUserId: userId,
          repairerUserId: offer.repairerUserId,
          delivery: input.delivery,
          executionDelayPreference: delayPref,
          withdrawalWaiverAcceptedAt:
            isPro && delayPref === 'IMMEDIATE' && input.withdrawalWaiver
              ? new Date(input.withdrawalWaiver.acceptedAt)
              : null,
          withdrawalWaiverText:
            isPro && delayPref === 'IMMEDIATE' && input.withdrawalWaiver
              ? input.withdrawalWaiver.acceptedText
              : null,
          // `amounts` carries insuranceCents (0 unless a quoted, insured parcel).
          ...amounts,
          // Livraison Boxtal: the parcel the price was bought against, and the quote it came from.
          ...(resolved
            ? {
                parcelOption: resolved.parcelOption,
                parcelWeightGrams: resolved.parcel.weightGrams,
                parcelLengthCm: resolved.parcel.lengthCm,
                parcelWidthCm: resolved.parcel.widthCm,
                parcelHeightCm: resolved.parcel.heightCm,
                parcelValueCents: resolved.parcel.valueCents,
                shippingQuoteId: resolved.quoteId,
              }
            : {}),
        },
        select: { id: true },
      })
      .catch((e: unknown) => {
        // P2002 on Commande_demandeId_key means another attempt won the race.
        if (isUniqueViolation(e))
          throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAYING);
        throw e;
      });

    // Record immutable legal compliance proof (CF6-18).
    //
    // The proof's timestamp is the SERVER's clock: a device clock is not evidence. The moment the
    // client says he ticked the box is kept in `metadata.clientAcceptedAt`. A failure here must not
    // strand the commande for the two-minute gateway grace that `resolvePending` applies to a row
    // with no Stripe id, so the row is abandoned before the error propagates.
    if (this.consentProofs) {
      try {
        if (isPro && delayPref === 'IMMEDIATE' && input.withdrawalWaiver) {
          await this.consentProofs.recordProof({
            userId,
            kind: 'WITHDRAWAL_WAIVER_IMMEDIATE',
            commandeId: commande.id,
            waiverTextVersion: CURRENT_WITHDRAWAL_WAIVER_VERSION,
            legalTextSnapshot: input.withdrawalWaiver.acceptedText,
            actionProof: 'CHECKBOX_TICKED_AND_CHECKOUT_SUBMITTED',
            metadata: {
              offerId: offer.id,
              priceCents: offer.priceCents,
              delivery: input.delivery,
              isPro: true,
              clientAcceptedAt: input.withdrawalWaiver.acceptedAt,
            },
          });
        } else if (delayPref === 'WAIT_14_DAYS') {
          await this.consentProofs.recordProof({
            userId,
            kind: 'WITHDRAWAL_WAIVER_WAIT_14_DAYS',
            commandeId: commande.id,
            waiverTextVersion: CURRENT_WITHDRAWAL_WAIVER_VERSION,
            legalTextSnapshot: "L'utilisateur a choisi d'attendre l'expiration du délai légal de rétractation de 14 jours avant le début de la prestation.",
            actionProof: 'TOGGLE_WAIT_14_DAYS_SELECTED',
            metadata: { offerId: offer.id, priceCents: offer.priceCents, delivery: input.delivery, isPro },
          });
        }
      } catch (e) {
        await this.abandon(commande.id);
        throw e;
      }
    }

    // A gateway failure (V7 FND7-078: an expired Stripe key) must not leave the row PENDING_PAYMENT
    // with no intent id: `resolvePending` would read it as a live sibling for GATEWAY_GRACE_MS and
    // answer every retry « paiement déjà en cours » instead of the real error. Abandoned first, as
    // the consent-proof failure above is. No client secret was returned, so even an intent Stripe
    // created before failing cannot be paid.
    let intent: PaymentIntentSummary;
    try {
      intent = await paymentsGateway().createPaymentIntent({
        commandeId: commande.id,
        demandeId: offer.demandeId,
        offerId: offer.id,
        customerEmail: offer.demande.author.email,
        amountCents: amounts.totalCents,
        metadata: {
          commandeId: commande.id,
          demandeId: offer.demandeId,
          offerId: offer.id,
        },
      });
    } catch (e) {
      await this.abandon(commande.id);
      throw e;
    }

    const claimed = await this.prisma.commande.updateMany({
      where: { id: commande.id, status: 'PENDING_PAYMENT' },
      data: { stripePaymentIntentId: intent.id },
    });
    if (claimed.count === 0) {
      // Our row was reaped while we were at the gateway. Cancel the intent we just
      // created so nobody can pay it, and refuse rather than return its secret.
      await paymentsGateway().cancelPaymentIntent(intent.id);
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAYING);
    }

    return {
      paymentIntentClientSecret: intent.clientSecret,
      commandeId: commande.id,
      ...checkoutModeFields(),
    };
  }

  /**
   * Spec §7.2. Null means « the flat path applies »: a local delivery, or a parcel under the
   * manual driver - where a stray quoteId is IGNORED and not persisted (deliberate break #8).
   * Amounts come from the ROW, never from the request, and the pair returned is the one the
   * client's `insured` flag names: the insured variant carries its own shipping price, because
   * the cheapest carrier may not insure this value (spec Amendment, 2026-09-04).
   */
  async resolveQuote(
    userId: string,
    offer: { id: string },
    input: CreateCheckoutInput,
  ): Promise<ResolvedQuote | null> {
    if (input.delivery !== 'PARCEL' || !isShippingQuotesEnabled()) return null;
    if (!input.quoteId || !input.parcelOption) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_REQUIRED);
    }
    const row = await this.prisma.shippingQuote.findFirst({
      where: { id: input.quoteId, offerId: offer.id, clientUserId: userId },
    });
    if (!row) throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    if (row.expiresAt.getTime() < Date.now()) throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_EXPIRED);

    const option = (row.legs as QuoteLegs)[input.parcelOption];
    const shippingCents = input.parcelOption === 'RELAY' ? row.relayShippingCents : row.homeShippingCents;
    if (!option || shippingCents === null) throw new AppException('UNPROCESSABLE_ENTITY', OPTION_UNAVAILABLE);
    const parcel: ParcelDetails = {
      weightGrams: row.parcelWeightGrams,
      lengthCm: row.parcelLengthCm,
      widthCm: row.parcelWidthCm,
      heightCm: row.parcelHeightCm,
      valueCents: row.parcelValueCents,
    };

    if (input.insured !== true) {
      return {
        quoteId: row.id,
        parcelOption: input.parcelOption,
        quoted: { shippingCents, insuranceCents: 0 },
        parcel,
        legs: { OUTBOUND: option.OUTBOUND, RETURN: option.RETURN },
        insured: false,
      };
    }

    const insuredShippingCents = input.parcelOption === 'RELAY' ? row.relayInsuredShippingCents : row.homeInsuredShippingCents;
    const insuranceCents = input.parcelOption === 'RELAY' ? row.relayInsuranceCents : row.homeInsuranceCents;
    const insuredPair: LegPair | null = option.insured;
    if (!insuredPair || insuredShippingCents === null || insuranceCents === null) {
      throw new AppException('UNPROCESSABLE_ENTITY', INSURANCE_UNAVAILABLE);
    }
    return {
      quoteId: row.id,
      parcelOption: input.parcelOption,
      quoted: { shippingCents: insuredShippingCents, insuranceCents },
      parcel,
      legs: insuredPair,
      insured: true,
    };
  }

  /**
   * Handles the client who abandoned the hosted page and tapped « Payer » again,
   * or who changed his delivery choice and tried again.
   *
   * Returns a session to reuse, or null to create a fresh pair. Refuses rather
   * than reaps when: (1) the pending attempt is for a DIFFERENT réparateur, which
   * would silently switch who he is paying mid-payment; (2) a sibling request is
   * inside the gateway RIGHT NOW, which would hand him two payable URLs; or (3) he
   * has already paid and the webhook simply has not landed yet, which would let
   * him pay twice for the same repair.
   *
   * Reaps and returns null when: (1) the Stripe session is expired; (2) the
   * delivery mode has changed, so the amount he is about to be charged is not the
   * amount his screen showed him; or (3) a process died mid-flight long enough ago
   * that we can distinguish it from a live sibling.
   *
   * The session URL is retrieved, never stored - a stored URL is a second source
   * of truth that can outlive the session it names.
   */
  private async resolvePending(
    demandeId: string,
    offerId: string,
    delivery: DeliveryMode,
    resolved: ResolvedQuote | null,
    delayPreference: ExecutionDelayPreference,
  ): Promise<CheckoutSessionResponse | null> {
    const pending = await this.prisma.commande.findFirst({
      where: { demandeId, status: 'PENDING_PAYMENT' },
      select: {
        id: true,
        offerId: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        delivery: true,
        executionDelayPreference: true,
        parcelOption: true,
        insuranceCents: true,
        shippingQuoteId: true,
        createdAt: true,
      },
    });
    if (!pending) return null;

    // A different réparateur. Refused rather than reaped: reaping would silently
    // switch who the client is paying, mid-payment.
    if (pending.offerId !== offerId) {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAYING);
    }

    // No session/intent id yet means a sibling request is inside the gateway RIGHT NOW,
    // or a process died mid-flight. Those are indistinguishable from here, so the
    // age decides: refuse a live sibling, reap a corpse. Reaping a live sibling is
    // what hands one client two payable sessions.
    if (!pending.stripePaymentIntentId && !pending.stripeSessionId) {
      if (Date.now() - pending.createdAt.getTime() < GATEWAY_GRACE_MS) {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAYING);
      }
      await this.abandon(pending.id);
      return null;
    }

    if (pending.stripePaymentIntentId) {
      const intent = await paymentsGateway().retrievePaymentIntent(
        pending.stripePaymentIntentId,
      );

      // He has already paid; the webhook simply has not landed yet. Reaping here is
      // what would let him pay a second time for the same repair.
      if (intent.status === 'succeeded') {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAID);
      }

      if (intent.status === 'canceled') {
        await this.abandon(pending.id);
        return null;
      }

      // Still open. Reuse it only if he wants the SAME thing he chose before - mode, option,
      // insurance and quote (Livraison Boxtal, spec §7.2). Otherwise the amount he is about to
      // be charged is not the amount his screen showed him.
      const same =
        pending.delivery === delivery &&
        (pending.executionDelayPreference ?? 'IMMEDIATE') === delayPreference &&
        (pending.parcelOption ?? null) === (resolved?.parcelOption ?? null) &&
        pending.insuranceCents === (resolved?.quoted.insuranceCents ?? 0) &&
        (pending.shippingQuoteId ?? null) === (resolved?.quoteId ?? null);
      if (!same) {
        await paymentsGateway().cancelPaymentIntent(pending.stripePaymentIntentId);
        await this.abandon(pending.id);
        return null;
      }

      return {
        paymentIntentClientSecret: intent.clientSecret,
        commandeId: pending.id,
        ...checkoutModeFields(),
      };
    }

    if (pending.stripeSessionId) {
      const session = await paymentsGateway().retrieveCheckoutSession(
        pending.stripeSessionId,
      );

      if (session.status === 'complete') {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_PAID);
      }

      if (session.status === 'expired') {
        await this.abandon(pending.id);
        return null;
      }

      const same =
        pending.delivery === delivery &&
        (pending.executionDelayPreference ?? 'IMMEDIATE') === delayPreference &&
        (pending.parcelOption ?? null) === (resolved?.parcelOption ?? null) &&
        pending.insuranceCents === (resolved?.quoted.insuranceCents ?? 0) &&
        (pending.shippingQuoteId ?? null) === (resolved?.quoteId ?? null);
      if (!same) {
        await paymentsGateway().expireCheckoutSession(pending.stripeSessionId);
        await this.abandon(pending.id);
        return null;
      }

      return {
        paymentIntentClientSecret: session.paymentIntentId ?? '',
        commandeId: pending.id,
        ...checkoutModeFields(),
        url: session.url,
      };
    }

    return null;
  }

  private async abandon(id: string): Promise<void> {
    await this.prisma.commande.updateMany({
      where: { id, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });
  }

  /**
   * Every Stripe delivery lands here.
   *
   * Order matters. Verify, then claim the event id, then act. Claiming first is
   * what makes a redelivery a no-op: Stripe retries on any non-2xx and on its own
   * schedule, so the same event arrives more than once as a matter of course
   * rather than as a fault.
   */
  async handleWebhook(
    raw: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    if (!signature) {
      throw new AppException('VALIDATION_FAILED', 'Signature manquante.');
    }

    // A missing secret is OUR fault, not the caller's. Distinguished from a bad
    // signature deliberately: conflating them turns a rotated-and-not-redeployed
    // secret into what looks like an attack, on the one route that handles money.
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new AppException(
        'INTERNAL',
        'Configuration de paiement incomplète.',
      );
    }

    let event;
    try {
      event = paymentsGateway().constructEvent(raw, signature);
    } catch {
      // Deliberately opaque to the caller. Logged for us, because the alternative
      // is a silent 400 on every real event.
      console.warn('[payments] webhook signature verification failed');
      throw new AppException('VALIDATION_FAILED', 'Signature invalide.');
    }

    const claimed = await claimStripeEvent(this.prisma, event.id, event.type);
    if (!claimed) return;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const sessionId = this.extractSessionId(event.object);
          if (!sessionId) return;
          await this.completeBySessionId(sessionId);
          return;
        }
        case 'checkout.session.expired':
          await this.abandonBySessionId(this.extractSessionId(event.object));
          return;
        case 'payment_intent.succeeded': {
          const intentId = typeof event.object?.id === 'string' ? event.object.id : null;
          const latestCharge = event.object?.latest_charge;
          const chargeId =
            typeof latestCharge === 'string'
              ? latestCharge
              : typeof (latestCharge as { id?: unknown })?.id === 'string'
                ? ((latestCharge as { id: string }).id)
                : null;
          if (intentId) await this.completeByPaymentIntent(intentId, chargeId);
          return;
        }
        case 'payment_intent.canceled': {
          const intentId = typeof event.object?.id === 'string' ? event.object.id : null;
          if (intentId) await this.abandonByPaymentIntentId(intentId);
          return;
        }
        // P5. Two PLATFORM events, so they belong on P1's existing endpoint -
        // widening `enabled_events` does not roll a signing secret, which is why
        // P5 adds no endpoint and no blocker row.
        case 'charge.dispute.created':
          await this.markDisputed(event.object);
          return;
        case 'refund.updated':
          await this.syncRefundState(event.object);
          return;
        // charge.refunded is deliberately NOT subscribed, for the same reason as
        // charge.dispute.closed: it delivers a Charge (whose `status` is the
        // payment status and whose `id` is a charge id), duplicating information
        // refund.updated already carries, and we would act on none of it. A
        // subscribed-but-dropped event misleads the next reader.
        default:
          // An unhandled type is not an error. Throwing would make Stripe retry it
          // for three days and fill the dashboard with failures for events we
          // never asked for.
          return;
      }
    } catch (e) {
      // The claim is what makes a redelivery a no-op, so a failed action must give
      // it back - otherwise Stripe's retry is discarded as a duplicate and a paid
      // event is lost for good. Stripe retries any non-2xx for three days, so
      // releasing the claim and rethrowing is what lets the retry actually work.
      await this.prisma.stripeEvent
        .delete({ where: { id: event.id } })
        .catch(() => undefined);
      throw e;
    }
  }

  /**
   * The accept transaction, keyed on a session id so the webhook and P5's
   * orphan-session job call ONE method. Two implementations of the accept
   * transaction is how a real charge comes to have no accepted offer.
   *
   * The webhook/J4 race is CAS: `updateMany` with `status: 'PENDING_PAYMENT'` in
   * the `where`, so the loser finds `count: 0` and stops rewriting
   * `paidAt`/`autoReleaseDueAt`. Without it, both would write and the row's
   * timestamps would be whichever thread finished last. The early return above is
   * the check; the CAS is the act.
   *
   * All four writes, or none. Partially applied, the client sees two accepted
   * offers, or an accepted offer on an open demande. That is why this is one
   * `$transaction` and why the test counts rows rather than trusting a 200.
   *
   * It runs from the webhook rather than from a request on purpose: there is no
   * accepted-but-unpaid state to be in. Payment is the commitment.
   */
  async completeBySessionId(sessionId: string): Promise<void> {
    const commande = await this.prisma.commande.findFirst({
      where: { stripeSessionId: sessionId },
      select: {
        id: true,
        status: true,
        demandeId: true,
        offerId: true,
        repairerUserId: true,
        clientUserId: true,
        repairCents: true,
        executionDelayPreference: true,
        // Livraison Boxtal: the pair the client paid for, so the completion can create its legs.
        delivery: true,
        parcelOption: true,
        insuranceCents: true,
        shippingQuoteId: true,
        shippingQuote: { select: { legs: true } },
      },
    });
    // Not ours, or already gone. Returning quietly is what stops Stripe retrying
    // for three days over an event we can do nothing with.
    if (!commande) return;

    // The second idempotency layer. The StripeEvent ledger catches a redelivery
    // of the SAME event; this catches a different event describing the same
    // outcome, which the ledger cannot see.
    if (commande.status !== 'PENDING_PAYMENT') {
      if (commande.status !== 'PAID') {
        // Unreachable today, and only by non-local reasoning: every abandon path
        // expires its Stripe session first, so no completed event can name an
        // abandoned row. If that ever stops being true this is two real charges,
        // so it must be loud rather than a quiet accept.
        console.error(
          '[payments] completed event for a non-pending commande',
          commande.id,
          commande.status,
        );
      }
      return;
    }

    const session = await paymentsGateway().retrieveCheckoutSession(sessionId);

    if (session.status !== 'complete') {
      // The event says paid and Stripe's own record does not agree. Throwing rather
      // than returning is deliberate: a quiet return would leave a real charge with
      // no accepted offer and the claim consumed, which is exactly the loss the
      // compensation exists to prevent. Throwing releases the claim so Stripe's
      // retry gets another chance.
      console.error(
        '[payments] completed event for a non-complete session',
        sessionId,
        session.status,
      );
      throw new Error(
        `Session ${sessionId} is ${session.status}, not complete`,
      );
    }

    if (!session.chargeId) {
      // A later piece needs this as Stripe's `source_transaction`, and the PAID
      // exit below means no redelivery will ever backfill it. Loud rather than
      // silent, because the alternative is discovering it at payout time.
      console.error(
        '[payments] paid session has no charge id',
        sessionId,
        commande.id,
      );
    }

    await this.finalizePaidCommande(
      commande,
      session.paymentIntentId,
      session.chargeId,
    );
  }

  async completeByPaymentIntent(
    intentId: string,
    chargeId?: string | null,
  ): Promise<void> {
    const commande = await this.prisma.commande.findFirst({
      where: { stripePaymentIntentId: intentId },
      select: {
        id: true,
        status: true,
        demandeId: true,
        offerId: true,
        repairerUserId: true,
        clientUserId: true,
        repairCents: true,
        executionDelayPreference: true,
        delivery: true,
        parcelOption: true,
        insuranceCents: true,
        shippingQuoteId: true,
        shippingQuote: { select: { legs: true } },
      },
    });
    if (!commande) return;

    if (commande.status !== 'PENDING_PAYMENT') {
      if (commande.status !== 'PAID') {
        console.error(
          '[payments] completed event for a non-pending commande',
          commande.id,
          commande.status,
        );
      }
      return;
    }

    const intent = await paymentsGateway().retrievePaymentIntent(intentId);

    if (intent.status !== 'succeeded') {
      console.error(
        '[payments] completed event for a non-succeeded payment intent',
        intentId,
        intent.status,
      );
      throw new Error(
        `PaymentIntent ${intentId} is ${intent.status}, not succeeded`,
      );
    }

    const effectiveChargeId = chargeId ?? intent.chargeId;
    if (!effectiveChargeId) {
      console.error(
        '[payments] paid payment intent has no charge id',
        intentId,
        commande.id,
      );
    }

    await this.finalizePaidCommande(
      commande,
      intentId,
      effectiveChargeId,
    );
  }

  private async finalizePaidCommande(
    commande: {
      id: string;
      demandeId: string;
      offerId: string;
      repairerUserId: string;
      clientUserId: string;
      repairCents: number;
      executionDelayPreference: ExecutionDelayPreference;
      delivery: DeliveryMode;
      parcelOption: ParcelOption | null;
      insuranceCents: number;
      shippingQuoteId: string | null;
      shippingQuote: { legs: unknown } | null;
    },
    paymentIntentId: string | null,
    chargeId: string | null,
  ): Promise<void> {
    const paidAt = new Date();
    const autoReleaseDueAt = new Date(
      paidAt.getTime() + AUTO_RELEASE_DAYS * 86_400_000,
    );
    const withdrawalPeriodEndsAt =
      commande.executionDelayPreference === 'WAIT_14_DAYS'
        ? new Date(paidAt.getTime() + 14 * 24 * 60 * 60 * 1000)
        : null;

    /**
     * THE SIBLING OFFERS THIS PAYMENT DEFEATS - read once, written once, and now ONE object.
     *
     * 🛑 IT IS A LOCAL CONST BECAUSE THE READ AND THE WRITE MUST SELECT THE SAME ROWS, and until
     * B2 they were two byte-identical literals bound only by a comment saying so, with nothing
     * asserting it - the exact drift shape this piece exists to remove, sitting on the money path.
     * One expression is worth more than a comment claiming two agree.
     *
     * 🛑 IT KEEPS ITS OWN KEY SET AND MUST NOT BE SWITCHED TO A NAMED PREDICATE. The rule, not a
     * disagreement with anything: these three keys and **no `deletedAt`**. `LIVE_OFFER_WHERE`
     * carries `deletedAt: null`, so adopting it would add a clause to a WRITE on the money path and
     * change which rows the lifecycle touches. **B2 spec §5.2 says the same, so the code and the
     * spec agree** - an earlier draft of this comment pointed at a disagreement that had since been
     * corrected out of the spec, which would have led a reader to make the substitution both now
     * forbid. See `offer-predicates.ts` for why these notes state the rule rather than a verdict on
     * another document.
     *
     * Not ACCEPTABLE for the reason that matters more: filter by suspension here and a suspended
     * réparateur's offer on a demande somebody else just paid for stays `SENT` forever, so he is
     * never told he lost and the row is left contradicting the commande. `createCheckout` is where
     * suspension stops a payment; by this point the money has moved and the losers must be closed.
     *
     * Local rather than module-level, deliberately: it closes over `commande` and it is nobody
     * else's predicate. `Prisma.OfferWhereInput` is not annotated for the same reason - inference
     * off one literal keeps `id: { not: … }` checked without importing the namespace.
     */
    const defeatedSiblingsWhere = {
      demandeId: commande.demandeId,
      status: 'SENT' as const,
      id: { not: commande.offerId },
    };

    // Collected BEFORE the transaction, and this ordering is the whole point. The
    // updateMany below flips every sibling to REJECTED and returns a COUNT, not rows - so
    // afterwards these réparateurs are indistinguishable from anyone rejected by an
    // earlier commande on the same demande. Design §8.1.
    const losers = await this.prisma.offer.findMany({
      where: defeatedSiblingsWhere,
      select: { repairerUserId: true },
    });

    // The demande title and the client's handle, snapshotted for the same reason every
    // other snapshot in this table exists.
    const context = await this.prisma.demande.findFirst({
      where: { id: commande.demandeId },
      select: { title: true, author: { select: { username: true } } },
    });

    // Livraison Boxtal: the pair the client PAID for - the insured variant when the row carries
    // insurance, else the uninsured cheapest - read off the quote the commande points at. Null
    // for local orders and for parcels paid under the manual driver. `paidLegPair` is shared with
    // the order's per-leg prices (V7 A9), so the label orders and the screen read one pair.
    const paidLegs: LegPair | null = paidLegPair(commande);

    // INTERACTIVE form since Livraison Boxtal (the plan's second deliberate deviation): the CAS
    // on PENDING_PAYMENT must gate the Shipment rows too, and the array form cannot read its
    // own count. The four writes CF-36 proved keep their order. No catch around the shipment
    // creates: inside an interactive transaction a P2002 poisons it anyway, and the CAS plus
    // the (commandeId, leg) unique index are what make a redelivery a no-op.
    //
    // CF6-04: the transaction REPORTS whether it won the CAS, and everything after it is skipped
    // when it did not. Two paths now reach this method for one order: the payment_intent webhook
    // (de-duplicated by its event claim) and the poll-time reconciliation in
    // `CommandesService.findOne` (not covered by any claim). The loser used to fall through and
    // open the conversation and emit the whole notification round a second time.
    // Trade-off, accepted: a process that dies between this commit and the emits below is no
    // longer healed by a later redelivery, which previously re-ran them.
    const finalized = await this.prisma.$transaction(async (tx) => {
      const written = await tx.commande.updateMany({
        where: { id: commande.id, status: 'PENDING_PAYMENT' },
        data: {
          status: 'PAID',
          // Beside status in the SAME transaction, deliberately: this is the only
          // writer of either, so the two cannot diverge and no paid row can exist
          // without a lifecycle. P3 spec §4.2.
          step: 'PAID',
          paidAt,
          autoReleaseDueAt,
          ...(withdrawalPeriodEndsAt ? { withdrawalPeriodEndsAt } : {}),
          ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
          ...(chargeId ? { stripeChargeId: chargeId } : {}),
        },
      });
      if (written.count === 0) return false;
      await recordStep(tx, commande.id, 'PAID');
      await tx.offer.update({
        where: { id: commande.offerId },
        data: { status: 'ACCEPTED' },
      });
      // 🛑 THE SAME OBJECT the `losers` read used, not a copy of it - see its declaration for why
      // that is load-bearing and why neither named predicate fits. Scoped to SENT, so a WITHDRAWN
      // sibling stays withdrawn: rewriting it to REJECTED would tell a réparateur he lost a bid he
      // had already pulled.
      await tx.offer.updateMany({
        where: defeatedSiblingsWhere,
        data: { status: 'REJECTED' },
      });
      await tx.demande.update({
        where: { id: commande.demandeId },
        data: { status: 'IN_PROGRESS' },
      });
      if (paidLegs) {
        for (const leg of ['OUTBOUND', 'RETURN'] as const) {
          const o = paidLegs[leg];
          await tx.shipment.create({
            data: {
              commandeId: commande.id,
              leg,
              carrierCode: o.carrierCode,
              serviceCode: o.serviceCode,
              carrierLabel: o.carrierLabel,
              quotedCostExclTaxCents: o.costExclTaxCents,
              quotedCostInclTaxCents: o.costInclTaxCents,
              insured: commande.insuranceCents > 0,
              quotedInsuranceCents: commande.insuranceCents > 0 ? (o.insuranceInclTaxCents ?? 0) : 0,
            },
          });
        }
      }
      return true;
    });
    if (!finalized) return;

    // CF-41/CF-42. A SECOND transaction, deliberately not part of the one above: that one
    // is CF-36's proven money path and is not reopened. This one may fail; see
    // `open-conversation.ts` for why the failure is swallowed and what the residual is.
    await openConversationForPaidCommande(
      this.conversations,
      {
        demandeId: commande.demandeId,
        clientUserId: commande.clientUserId,
        repairerUserId: commande.repairerUserId,
      },
      isMessagingEnabled(),
    );

    // CF-43. The CLIENT first, because until this slice he was the one party this event did
    // not notify: the réparateur got OFFER_ACCEPTED below and every loser got OFFER_DECLINED,
    // while the person who actually paid got nothing, leaving his list running « Nouvelle
    // offre reçue » straight into « Colis reçu ». Same post-transaction placement and the same
    // never-throws reasoning as the emit below.
    await notifyClientOfPaidCommande(this.notifications, commande, context?.title ?? null);

    // After the transaction, never inside it. emit() never throws, which is what makes
    // this safe HERE in particular: a throw inside this webhook releases Stripe's claim
    // and re-enters the compensation path. Design §5.2.
    await this.notifications.emit({
      userId: commande.repairerUserId,
      mode: 'REPAIRER',
      type: 'OFFER_ACCEPTED',
      // The client's HANDLE, never their name. This notification goes to the winning
      // réparateur and actorName is interpolated into the copy, so a legal name here is
      // as public as one on a screen. `displayName: null` unconditionally: a demande
      // author is a client BY POSITION, and passing a trade name would sign the line as
      // a réparateur.
      actorName: context
        ? publicIdentity({ username: context.author.username, displayName: null })
        : null,
      subject: context?.title ?? null,
      amountCents: commande.repairCents,
      demandeId: commande.demandeId,
      // The COMMANDE, not the demande: by now a commande exists and paid, the demande is
      // IN_PROGRESS, and his next action lives entirely on the commande screen.
      commandeId: commande.id,
    });

    for (const loser of losers) {
      await this.notifications.emit({
        userId: loser.repairerUserId,
        mode: 'REPAIRER',
        type: 'OFFER_DECLINED',
        // No actor: being outbid is not something to attach a person to.
        subject: context?.title ?? null,
        demandeId: commande.demandeId,
      });
    }
  }

  /** Read session ID with type checking, never pass untyped indexed values. */
  private extractSessionId(object: Record<string, unknown>): string {
    return typeof object?.id === 'string' ? object.id : '';
  }

  /**
   * Webhook variant of abandon. Uses updateMany because an expired session for a
   * commande that has already moved on must not throw and make Stripe retry.
   *
   * Also called by P5's orphan-session job for an expired session that outlived
   * its webhook.
   */
  async abandonBySessionId(sessionId: string): Promise<void> {
    if (!sessionId) return;
    const changed = await this.prisma.commande.updateMany({
      where: { stripeSessionId: sessionId, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });

    if (changed.count < 1) return;
    const row = await this.prisma.commande.findFirst({
      where: { stripeSessionId: sessionId },
      select: {
        id: true,
        demandeId: true,
        clientUserId: true,
        demande: { select: { title: true } },
      },
    });
    if (!row) return;

    await notifyClientOfAbandonedPayment(
      this.notifications,
      row,
      row.demande.title,
      changed.count,
    );
  }

  async abandonByPaymentIntentId(intentId: string): Promise<void> {
    if (!intentId) return;
    const changed = await this.prisma.commande.updateMany({
      where: { stripePaymentIntentId: intentId, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });

    if (changed.count < 1) return;
    const row = await this.prisma.commande.findFirst({
      where: { stripePaymentIntentId: intentId },
      select: {
        id: true,
        demandeId: true,
        clientUserId: true,
        demande: { select: { title: true } },
      },
    });
    if (!row) return;

    await notifyClientOfAbandonedPayment(
      this.notifications,
      row,
      row.demande.title,
      changed.count,
    );
  }

  /**
   * Where the browser goes after the hosted page.
   *
   * Deliberately unauthenticated and deliberately trust-free: it reads nothing
   * from the query string except which commande to look up, and the app fetches
   * authoritative state through `GET /commandes/:id` with its own session cookie
   * once it lands. So `r=ok` on a cancelled payment misleads nobody.
   */
  async returnTarget(commandeId: string, outcome: string): Promise<string> {
    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: { id: true, demandeId: true, offerId: true },
    });
    if (!row) return 'revime://';

    return outcome === 'ok'
      ? `revime://demande/${row.demandeId}/acceptee?c=${row.id}`
      // CF-40. Was `paiement?...&cancelled=1`, an inline banner on the payment screen.
      // The client asked for a real result page for the unhappy path, so this is now a
      // screen of its own. `paiement.tsx`'s `cancelled=1` handler is deliberately KEPT
      // as a fallback for the fake gateway and for stale deep links.
      : `revime://demande/${row.demandeId}/echec?offerId=${row.offerId}`;
  }

  /**
   * P5. Stamps disputedAt when a charge is disputed. Both the auto-release job
   * and the client's own « Valider » refuse on it. A TIMESTAMP rather than a
   * status: a dispute can be WON and a DISPUTED status would have no way back.
   *
   * Reversing a disputed charge stays the operator's deliberate act, not the
   * webhook's. A dispute can be won; reversing automatically would claw money
   * back from a réparateur who did nothing wrong, and re-transferring afterwards
   * is subject to cross-border restrictions. The freeze is automatic because it
   * is reversible; the clawback is manual because it is not.
   *
   * charge.dispute.closed is deliberately NOT subscribed: deciding what to do
   * when a dispute is won is product behaviour V1 does not have, and subscribing
   * to an event we would silently drop invites the next reader to assume it is
   * handled. The default case already tolerates it if it ever arrives.
   *
   * Uses updateMany so an event for a charge that has moved on cannot throw and
   * make Stripe retry. An event for a charge that is not ours returns quietly -
   * not throw - for the same reason.
   */
  private async markDisputed(object: Record<string, unknown>): Promise<void> {
    const chargeId = typeof object?.charge === 'string' ? object.charge : null;
    if (!chargeId) return;

    await this.prisma.commande.updateMany({
      where: { stripeChargeId: chargeId },
      data: { disputedAt: new Date() },
    });

    const commande = await this.prisma.commande.findFirst({
      where: { stripeChargeId: chargeId },
      select: { id: true },
    });

    if (commande) {
      const disputeStripeId = typeof object?.id === 'string' ? object.id : '';
      const dispute = await this.prisma.dispute.upsert({
        where: { commandeId: commande.id },
        create: {
          commandeId: commande.id,
          status: 'OPEN',
          initiator: 'STRIPE',
          reason: 'Contestation de paiement Stripe (chargeback)',
          description: `Dispute Stripe: ${disputeStripeId}`,
        },
        update: {
          status: 'OPEN',
          initiator: 'STRIPE',
        },
      });

      // F7: a chargeback is a dispute the admin must answer within Stripe's deadline.
      await this.alerts?.raise({
        type: 'DISPUTE_NEW',
        title: 'Contestation de paiement Stripe (chargeback)',
        message: `Le client de la commande ${orderNumberFor(commande.id)} a contesté son paiement auprès de sa banque (${disputeStripeId}). Répondre dans le tableau de bord Stripe avant l'échéance.`,
        targetType: 'Dispute',
        targetId: dispute.id,
        link: `/litiges?disputeId=${dispute.id}`,
        metadata: { commandeId: commande.id, stripeDisputeId: disputeStripeId },
      });
    }
  }

  /**
   * P5. Keeps the refund's recorded state honest. A refund can be PENDING, unlike
   * a transfer, so a failed one must not leave the row claiming the client was
   * repaid.
   *
   * A refund reported failed or canceled must UN-DO the REFUNDED disposition:
   * clear refundedAt, refundedCents and status (back to PAID), keep stripeRefundId
   * so the failed attempt stays traceable, and restore the Demande to IN_PROGRESS
   * so the row pair stays consistent. The synchronous half of this is already
   * handled - RefundService inspects the status it gets back and refuses
   * failed/canceled - so this covers the case where Stripe reports pending first
   * and the failure arrives later.
   *
   * Uses updateMany so an event about a row that has moved on cannot throw and
   * make Stripe retry.
   */
  private async syncRefundState(object: Record<string, unknown>): Promise<void> {
    const refundId = typeof object?.id === 'string' ? object.id : null;
    const status = typeof object?.status === 'string' ? object.status : null;
    if (!refundId || !status) return;

    // pending deliberately stays REFUNDED: refundedAt records when the refund
    // was CREATED, the refund service already treats pending as created, and
    // Stripe settles it later.
    if (status === 'pending') return;

    // succeeded leaves the row REFUNDED - no change needed.
    if (status === 'succeeded') return;

    // failed or canceled means no money moved. Un-do the REFUNDED disposition.
    if (status === 'failed' || status === 'canceled') {
      const row = await this.prisma.commande.findFirst({
        where: { stripeRefundId: refundId },
        select: { id: true, demandeId: true },
      });
      if (!row) return;

      const updated = await this.prisma.commande.updateMany({
        where: { id: row.id, status: 'REFUNDED' },
        data: {
          status: 'PAID',
          refundedAt: null,
          refundedCents: null,
          // CF4-D: undo the breakdown too - a refund that did not happen must not
          // leave the row claiming which amounts were refunded.
          refundRepairCents: null,
          refundShippingCents: null,
          refundProtectionCents: null,
          refundMotif: null,
          // Keep stripeRefundId so the failed attempt is still traceable.
        },
      });

      // The CAS matched zero rows: the commande moved under us and this event no
      // longer applies. Do not touch the demande - it must never be reverted for
      // a commande that was not.
      if (updated.count === 0) {
        console.warn(
          '[payments] refund %s reported %s but commande %s is no longer REFUNDED',
          refundId,
          status,
          row.id,
        );
        return;
      }

      // The CAS succeeded: restore the demande so the pair stays consistent.
      await this.prisma.demande.update({
        where: { id: row.demandeId },
        data: { status: 'IN_PROGRESS' },
      });

      // B11. The refund closed the dispute still open on this commande, and it did not happen:
      // a dispute reading « Remboursé au client » over a client who was not refunded would
      // hide the one case that needs an operator. Back to review, with the flag the refund cleared.
      const reopened = await this.prisma.dispute.updateMany({
        where: { commandeId: row.id, status: 'RESOLVED_REFUNDED' },
        data: {
          status: 'IN_REVIEW',
          resolvedAt: null,
          resolvedByUserId: null,
          verdict: null,
          resolutionNote: null,
        },
      });
      if (reopened.count > 0) {
        await this.prisma.commande.update({
          where: { id: row.id },
          data: { disputedAt: new Date() },
        });
      }
      return;
    }

    // requires_action or an unrecognised status: leave the row alone (we do not
    // know that money moved) but log loudly so an unhandled terminal state is
    // not invisible.
    const row = await this.prisma.commande.findFirst({
      where: { stripeRefundId: refundId },
      select: { id: true },
    });
    console.error(
      '[payments] refund %s has unhandled status %s -- commande %s left unchanged',
      refundId,
      status,
      row?.id ?? '(not found)',
    );
  }
}
