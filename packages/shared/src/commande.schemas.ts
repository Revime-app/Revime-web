import { z } from 'zod';
import { frAnyPhoneSchema } from './phone.schemas.js';
import { postalCodeSchema } from './postal.schemas.js';
import {
  cancellationRequestStatusSchema,
  type CancellationRequestInfo,
  type CancellationRequestStatus,
} from './cancellation.js';
import { disputeStatusSchema, type DisputeStatusType } from './dispute.js';
import {
  parcelOptionSchema,
  parcelPointSchema,
  type ParcelDetails,
  type ParcelOption,
  type ShipmentDto,
  type ShippingLegPrices,
} from './parcel.schemas.js';
import type { RefundBreakdown } from './refund.schemas.js';
import type { AttentionReason, AdminAttentionItem } from './admin.schemas.js';
export type { AttentionReason, AdminAttentionItem };

export const deliveryModeSchema = z.enum(['HOME', 'WORKSHOP', 'PARCEL'], {
  message: 'Mode de livraison invalide.',
});
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;

export const commandeStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'ABANDONED',
  'REFUNDED',
]);
export type CommandeStatus = z.infer<typeof commandeStatusSchema>;

/**
 * « Protection Revime » - the FIXED part, in cents: 2,90 €.
 *
 * The client set this model himself on 2026-09-04 (thread log
 * `docs/client-messages/2026-09-03-04-thread-frais-livraison-et-rgpd.md`, « What this
 * round SETTLED »): a fixed part plus 4,5 % of the REPAIR amount only, rounded to the
 * cent, no cap, 0 % réparateur commission at launch. His own worked example: a 100 €
 * repair gives 7,40 €, so 107,40 € before delivery. It replaced the flat 6,40 € of
 * feedback round 4; commandes paid under that model keep their own persisted
 * `protectionCents`. Spec: `docs/superpowers/specs/2026-09-04-protection-revime-fee-model-design.md`.
 */
export const PROTECTION_FIXED_CENTS = 290;

/** The proportional part, in basis points of the repair amount. 450 bp = 4,5 %. */
export const PROTECTION_RATE_BP = 450;

/**
 * The Protection Revime line for one repair, in cents:
 * `PROTECTION_FIXED_CENTS + round_half_up(repairCents × PROTECTION_RATE_BP / 10 000)`.
 *
 * INTEGER arithmetic throughout, so an exact half (89 € → 400,5 → 401) rounds the
 * same way on every runtime - half-up is the commercial rule (« arrondi commercial »),
 * chosen because the client's « nearest cent » does not say which way a half goes.
 * Shipping is NOT in the base and neither is the fixed part. Throws on anything but a
 * non-negative integer, for the same reason `computeAmounts` throws on an unknown
 * delivery mode: a wrong fee is money, and a silent 0 or NaN would reach a Stripe line.
 */
export function protectionCentsFor(repairCents: number): number {
  if (!Number.isInteger(repairCents) || repairCents < 0) {
    throw new Error(`Invalid repair amount: ${String(repairCents)}`);
  }
  return PROTECTION_FIXED_CENTS + Math.floor((repairCents * PROTECTION_RATE_BP + 5000) / 10000);
}

/**
 * « 4,5 % », derived from PROTECTION_RATE_BP so a sentence about the rate cannot drift
 * from the rate that is charged. Plain space before the sign, matching `euros()`.
 */
export function protectionRateLabel(): string {
  return `${String(PROTECTION_RATE_BP / 100).replace('.', ',')} %`;
}

/**
 * Stripe's processing rate applied to the DELIVERY and INSURANCE lines, in basis points:
 * 3,25 % is the MEASURED non-EEA card rate (fitted to six real balance transactions, fee
 * decision spec 2026-08-19 head amendment) and the conservative one - a European card,
 * which most customers use, is closer to 1,5 %, so the difference is Revime's cushion
 * against quote drift (Q4). NOT applied to the repair or to Protection Revime, which the
 * fee model already covers.
 */
export const SHIPPING_STRIPE_RATE_BP = 325;

/**
 * `costCents / (1 − rate)`, rounded UP to the next 10 cents. Dividing rather than
 * multiplying is what covers Stripe's fee on the gross-up itself. Integer arithmetic:
 * ceil(cost × 10 000 / (10 000 − bp)) then up to a multiple of 10. Throws on anything but
 * a non-negative integer, for the reason `protectionCentsFor` does.
 */
export function grossUpForStripe(costCents: number): number {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new Error(`Invalid shipping cost: ${String(costCents)}`);
  }
  const divisor = 10_000 - SHIPPING_STRIPE_RATE_BP;
  const exact = Math.ceil((costCents * 10_000) / divisor);
  return Math.ceil(exact / 10) * 10;
}

/**
 * The colis fee, covering BOTH legs - the client ships the device to the
 * réparateur and it comes back.
 *
 * Raised from 600 on 2026-08-17 by the owner's decision. `SHIP_FEE = 6` in the
 * prototype was one flat line with no leg count, and P3's seven parcel steps had
 * no return shipment at all: a one-leg colis leaves the client's device at a
 * stranger's workshop with a second payment needed to retrieve it.
 *
 * 🛑 CORRECTED 2026-09-04 (Livraison Boxtal): this is the MANUAL driver's price, not an
 * estimate awaiting verification. Under `SHIPPING_DRIVER=boxtal` the server quotes both legs
 * live and `computeAmounts` receives `quoted`, so this constant is never charged. It stays for
 * the `manual` fallback and its test. Spec: docs/superpowers/specs/2026-09-04-livraison-boxtal-design.md.
 */
export const PARCEL_SHIPPING_CENTS = 1900;

/**
 * The picker, and the single source of every shipping fee.
 *
 * `computeAmounts` reads its fee from here rather than from a parallel switch, so
 * a label and a charge cannot drift apart - which is the one arithmetic bug in a
 * payment flow that a user notices immediately.
 */
export const DELIVERY_OPTIONS = [
  { id: 'HOME', label: 'À domicile', sub: 'Le réparateur se déplace', feeCents: 0 },
  { id: 'WORKSHOP', label: 'Dépôt en atelier', sub: "Vous déposez l'objet", feeCents: 0 },
  {
    id: 'PARCEL',
    label: 'Envoi par colis',
    sub: 'Aller-retour, prix selon l’objet',
    feeCents: PARCEL_SHIPPING_CENTS,
  },
] as const satisfies readonly { id: DeliveryMode; label: string; sub: string; feeCents: number }[];

export type Amounts = {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  /** Livraison Boxtal. 0 for every non-parcel order and for an uninsured parcel. */
  insuranceCents: number;
  totalCents: number;
};

/** What the server reads off a `ShippingQuote` row. Never supplied by the app. */
export type QuotedShipping = { shippingCents: number; insuranceCents: number };

/**
 * The breakdown, computed once and used by both the payment screen and the
 * server that creates the charge.
 *
 * Deliberately in `shared` rather than in the API: a second implementation on
 * the app side is how the total a user agreed to comes to differ from the amount
 * their card is debited.
 *
 * `quoted` is only ever supplied by the SERVER, from a `ShippingQuote` row, and only for
 * PARCEL: with it, the two quoted figures replace the flat fee; without it, behaviour is
 * exactly the pre-Boxtal one (`manual` driver). For HOME and WORKSHOP it is ignored.
 */
export function computeAmounts(
  repairCents: number,
  delivery: DeliveryMode,
  quoted?: QuotedShipping,
): Amounts {
  const option = DELIVERY_OPTIONS.find((o) => o.id === delivery);
  // Unreachable while the type holds; a throw rather than a silent 0 because a
  // wrong shipping fee is money.
  if (!option) throw new Error(`Unknown delivery mode: ${String(delivery)}`);

  let shippingCents: number = option.feeCents;
  let insuranceCents = 0;
  if (delivery === 'PARCEL' && quoted) {
    for (const [k, v] of Object.entries(quoted)) {
      if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid quoted ${k}: ${String(v)}`);
    }
    shippingCents = quoted.shippingCents;
    insuranceCents = quoted.insuranceCents;
  }
  const protectionCents = protectionCentsFor(repairCents);
  return {
    repairCents,
    shippingCents,
    protectionCents,
    insuranceCents,
    totalCents: repairCents + shippingCents + protectionCents + insuranceCents,
  };
}

export const LEGAL_WITHDRAWAL_WAIVER_TEXT =
  'Je veux que la réparation commence tout de suite, et je comprends que je ne pourrai plus me rétracter une fois la réparation terminée.';

export const executionDelayPreferenceSchema = z.enum(['IMMEDIATE', 'WAIT_14_DAYS']);
export type ExecutionDelayPreference = z.infer<typeof executionDelayPreferenceSchema>;

export const withdrawalWaiverSchema = z.object({
  accepted: z.literal(true, { message: 'La renonciation doit être acceptée.' }),
  acceptedAt: z.string().datetime({ message: 'Horodatage invalide.' }),
  acceptedText: z.literal(LEGAL_WITHDRAWAL_WAIVER_TEXT, {
    message: 'Le texte de renonciation au droit de rétractation doit être exact.',
  }),
});
export type WithdrawalWaiverInput = z.infer<typeof withdrawalWaiverSchema>;

/**
 * `quoteId`, `parcelOption` and `insured` are OPTIONAL in the schema and REQUIRED by the
 * server for a PARCEL when quoting is on (spec §7.2) - the same binary must still pay for a
 * parcel under the `manual` driver, so the schema cannot know.
 */
export const createCheckoutSchema = z.object({
  delivery: deliveryModeSchema,
  quoteId: z.string().uuid({ message: 'Devis invalide.' }).optional(),
  parcelOption: parcelOptionSchema.optional(),
  insured: z.boolean().optional(),
  delayPreference: executionDelayPreferenceSchema.default('IMMEDIATE'),
  withdrawalWaiver: withdrawalWaiverSchema.nullable().optional(),
});
export type CreateCheckoutInput = z.input<typeof createCheckoutSchema>;

export const checkoutSessionResponseSchema = z.object({
  paymentIntentClientSecret: z.string().min(1),
  commandeId: z.string().uuid(),
  publishableKey: z.string().optional(),
  url: z.string().url().optional(),
  isTestMode: z.boolean().optional(),
});
export type CheckoutSessionResponse = z.infer<typeof checkoutSessionResponseSchema>;

/** One commande, as either party sees it. */
export type CommandeDto = {
  id: string;
  demandeId: string;
  offerId: string;
  demandeTitle: string;
  repairerName: string;
  delivery: DeliveryMode;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  totalCents: number;
  executionDelayPreference: ExecutionDelayPreference;
  withdrawalWaiverAcceptedAt: string | null;
  withdrawalPeriodEndsAt: string | null;
  /**
   * What the réparateur actually receives: `repairCents` today, because the owner
   * decided on 2026-08-17 that he is paid 100% of his quote and « Protection
   * Revime » is the platform's only revenue. Reads the recorded
   * `transferredCents` once released, so a historical row keeps reporting what
   * was actually paid even if the fee model changes.
   */
  payoutCents: number;
  status: CommandeStatus;
  /** Null until the commande is PAID - the lifecycle has not started. */
  step: CommandeStep | null;
  /** Which side of this commande the caller is on. */
  viewerRole: CommandeRole;
  /** ISO string, or null while the commande is not PAID. */
  paidAt: string | null;
  /** ISO string. When the réparateur asked for release. */
  releaseRequestedAt: string | null;
  /** ISO string. When the transfer succeeded. */
  releasedAt: string | null;
  /**
   * CMP-D3: True if the payout transfer was executed via Stripe Connect.
   * False/null if held (e.g. pending fiscal declaration or incomplete Connect).
   */
  hasStripeTransfer?: boolean;
  /** ISO string. When the return parcel was posted. */
  returnSentAt: string | null;
  /** ISO string. When the refund completed. */
  refundedAt: string | null;
  /** How much was refunded. Null until a refund exists. */
  refundedCents: number | null;
  /** The client's outbound label, once the operator has issued it. */
  outboundTrackingNumber: string | null;
  /** The réparateur's return label. Issued at the same moment as the outbound. */
  returnTrackingNumber: string | null;
  /** Whether the CALLER has supplied their shipping address. */
  myAddressSubmitted: boolean;
  /** Whether the other party has. Drives the « en attente de … » copy. */
  counterpartyAddressSubmitted: boolean;
  /**
   * Post-payment counterpart address (CF3-05).
   * Revealed strictly when necessary:
   * - HOME intervention: client address revealed to the repairer.
   * - WORKSHOP deposit: repairer workshop address revealed to the client.
   * Null before payment or when not applicable.
   */
  counterpartAddress?: string | null;
  /**
   * True when Stripe is reviewing the charge - a chargeback challenge or a fraud
   * hold. Redefined (CF4-12/13/14, design §4.2) as `disputedAt !== null && !disputeOpen`:
   * an admin-opened REVIME dispute ALSO sets `disputedAt`, and without excluding
   * `disputeOpen` the page would show both the opaque review banner and the dispute
   * banner at once. Deliberately opaque about the Stripe case: surfacing the date would
   * tell the client we are watching his chargeback clock.
   */
  paymentUnderReview: boolean;
  /** Livraison Boxtal. Null for local orders and for parcels paid under the manual driver. */
  parcelOption: ParcelOption | null;
  insuranceCents: number;
  /**
   * V7 A9 (U8, `DEC7-23`): `shippingCents` split per leg with each leg's carrier, read from the
   * quote this order was paid on (the insured pair when insured). Null for an order with no quote
   * (local, or a parcel under the manual driver): the app then keeps one « Livraison » line rather
   * than invent a split (Q6). Optional so an app reading an older API behaves the same way.
   */
  shippingLegs?: ShippingLegPrices | null;
  parcel: ParcelDetails | null;
  /**
   * True when this party still owes a relay-point choice: the option is RELAY and their
   * address row has no `parcelPointCode`. Drives the picker; `myAddressSubmitted` is false
   * until it is chosen, so `parcelStage` needs no new branch.
   */
  myParcelPointRequired: boolean;
  /** One per leg once paid under the Boxtal driver; empty otherwise. */
  shipments: ShipmentDto[];
  /**
   * Whether a review exists for this commande - the condition on « Laisser un avis »
   * in the RELEASED block of `commande/[id].tsx`.
   *
   * **Ignores `deletedAt` on purpose.** `Review.commandeId` is a plain `@unique`
   * (`schema.prisma:730`, and the applied SQL carries no `WHERE` clause), so a second
   * insert fails even after an operator soft-deletes the first. Reporting `false` there
   * would put the button back and make the next tap a 422 the client discovers by
   * pressing it, which is this codebase's own « the button looks dead » anti-pattern.
   * Pinned by a test that soft-deletes and re-reads.
   *
   * True for both parties, not only the client. The button additionally checks
   * `viewerRole === 'CLIENT'`, because only the client may review.
   */
  reviewed: boolean;
  /**
   * CF4-12/13/14, design §4.2. `#CMD-` plus the commande id's first 8 characters,
   * upper-cased - `orderNumberFor` in `@revime/shared`, the one place this format is
   * decided.
   */
  orderNumber: string;
  /** The demande's own description, for the details page header card. Null if absent. */
  demandeDescription: string | null;
  /**
   * The demande's photos, signed - same signing helper and TTL as the demande screens
   * (`DemandesService.present`'s `photoUrls`), so a wording or TTL change there is not a
   * second thing to remember here. An unsignable entry is DROPPED, same reasoning as
   * `DemandeDto.photoUrls`.
   */
  photoUrls: string[];
  /** The client's public name, via `publicIdentity`, and avatar - null when none. */
  client: { name: string; avatarUrl: string | null };
  /** The réparateur's public name, via `publicIdentity`, and avatar - null when none. */
  repairer: { userId: string; name: string; avatarUrl: string | null };
  /**
   * D1 (design §3): true only for a REVIME dispute (`Dispute.status` OPEN or
   * IN_REVIEW). A Stripe-only chargeback leaves this false - see `paymentUnderReview`.
   */
  disputeOpen: boolean;
  /** The open dispute's `createdAt`, ISO, when `disputeOpen`; null otherwise. */
  disputeOpenedAt: string | null;
  /** `CommandeStepEvent` rows for this commande, oldest first, ISO timestamps. */
  stepEvents: { step: CommandeStep; at: string }[];
  /** The conversation between the two parties for this demande, when one exists. */
  conversationId: string | null;
  /**
   * CF4-D (spec §5). The flexible refund breakdown, once one exists; null before any
   * refund and for a legacy full refund with no recorded breakdown. Optional on the
   * wire so an old API response (no field at all) still decodes.
   *
   * 🛑 NOT populated by the API yet - the read side lands in Task 8. Declared here in
   * Task 1 only so later tasks' `CommandeDto` literals type-check against its final
   * shape from the start.
   */
  refund?: RefundBreakdown | null;
  /**
   * CF4-15 / spec §6. True when the REFUNDED disposition above was a flexible
   * PARTIAL refund, so `repairStatus()` can say « Remboursée partiellement »
   * rather than the plain « Remboursée » on the order details badge. Comes
   * straight from the API's `partialRefundOf(row)`. Optional on the wire: an
   * older API sends nothing at all, and mobile reads `?? false`.
   */
  partialRefund?: boolean;
  /**
   * CF4-I (spec §4.1, §4.4). The latest cancellation request against this commande, or null
   * when none has ever been made. `comment` is null for the réparateur viewer (I6). Optional
   * on the wire so an old API response (no field at all) still decodes - `?? null` at the
   * mobile entry point per `apps/mobile/AGENTS.md`'s DTO rule.
   *
   * 🛑 NOT populated by the API yet - the read side lands in Task 4. Declared here in Task 1
   * only so later tasks' `CommandeDto` literals type-check against its final shape from the
   * start, same reasoning as `refund` above.
   */
  cancellationRequest?: CancellationRequestInfo | null;
  /**
   * CF4-28/31 (spec §4.7), CF5-12. Order-level dispute summary. Null before any dispute exists.
   */
  dispute?: {
    number: number;
    reference?: string;
    status: DisputeStatusType;
    motifLabel: string | null;
    openedAt: string;
    assignedAt?: string | null;
    resolvedAt?: string | null;
    verdict?: string | null;
    resolutionNote?: string | null;
    openedBySide: 'CLIENT' | 'REPAIRER' | 'REVIME';
    unread: boolean;
  } | null;
};

/** Formats an incremental dispute number into its canonical reference string (e.g. 1 -> '#LIT-0001'). */
export function formatDisputeReference(number: number): string {
  return `#LIT-${String(number).padStart(4, '0')}`;
}

/** One row of `GET /commandes`. */
export type CommandeListItem = {
  id: string;
  demandeId: string;
  demandeTitle: string;
  /** The other party's display name - the client for a réparateur, and vice versa. */
  counterpartyName: string;
  delivery: DeliveryMode;
  step: CommandeStep;
  /**
   * The row's DISPOSITION, which `step` does not carry. Without it a REFUNDED
   * commande renders in both parties' lists as an ordinary live order - found by
   * reading the type, not by running anything. See the P5 spec §3.
   */
  status: CommandeStatus;
  payoutCents: number;
  totalCents: number;
  createdAt: string;
  /** ISO string. When the transfer succeeded - same meaning as `CommandeDto.releasedAt`. Null until then. */
  releasedAt: string | null;
  /**
   * CMP-D3: True if the payout transfer was executed via Stripe Connect.
   * False/null if held (e.g. pending fiscal declaration or incomplete Connect).
   */
  hasStripeTransfer?: boolean;
  /**
   * True when a REVIME dispute is open on this commande (`Dispute.status` OPEN or
   * IN_REVIEW). D1 (design §3): a Stripe-only chargeback does NOT set this - it keeps
   * today's opaque `paymentUnderReview` line on the detail screen instead.
   */
  disputeOpen: boolean;
  /**
   * CF4-15 / spec §6. True when `status` is REFUNDED and it was a flexible PARTIAL
   * refund - same `partialRefundOf(row)` derivation as `CommandeDto.partialRefund`,
   * so the réparateur's commandes list badge also reads « Remboursée partiellement ».
   * Optional on the wire: an older API sends nothing.
   */
  partialRefund?: boolean;
  /**
   * CF4-I. True while a PENDING cancellation request freezes this order - drives the
   * « Annulation demandée » ladder override and the frozen-order tag on the commandes list.
   * Optional on the wire: an older API sends nothing, read as unfrozen.
   */
  cancellationPending?: boolean;
};

/**
 * Is this commande live work - something the réparateur still has to do?
 *
 * Shared rather than inlined because two surfaces on the réparateur's Accueil read it: the
 * COMMANDES ACTIVES section and the « en cours » count on the activity card above it. Two
 * separate filters would let those two contradict each other inside one viewport, which is
 * the same argument that keeps the rating aggregate derived rather than stored.
 *
 * Three exclusions, and each is a different kind of "not active":
 *  - `status` REFUNDED or ABANDONED - the commande's DISPOSITION ended it. This is what
 *    `status` exists for; filtering on `step` alone shows a refunded order as live work.
 *  - `PENDING_PAYMENT` - checkout was started and never finished, so nothing is owed and no
 *    work is expected.
 *  - `step: 'RELEASED'` - the successful END. Work delivered, funds moved; it is history.
 */
export function isActiveCommande(c: Pick<CommandeListItem, 'status' | 'step'>): boolean {
  return c.status === 'PAID' && c.step !== 'RELEASED';
}

export const commandeStepSchema = z.enum(
  [
    'PAID',
    'PARCEL_SENT',
    'PARCEL_RECEIVED',
    'REPAIR_STARTED',
    'REPAIR_DONE',
    'RETURN_SENT',
    'RETURN_RECEIVED',
    'AWAITING_VALIDATION',
    'RELEASED',
  ],
  { message: 'Étape invalide.' },
);
export type CommandeStep = z.infer<typeof commandeStepSchema>;

export type CommandeRole = 'CLIENT' | 'REPAIRER';

/** The prototype's own labels, from `repareme-web/src/order.tsx:5-20`. */
export const STEP_LABEL: Record<CommandeStep, string> = {
  PAID: 'Paiement effectué',
  PARCEL_SENT: 'Colis envoyé',
  PARCEL_RECEIVED: 'Colis reçu',
  REPAIR_STARTED: 'Réparation en cours',
  REPAIR_DONE: 'Réparation terminée',
  RETURN_SENT: 'Colis retour envoyé',
  RETURN_RECEIVED: 'Colis retour reçu',
  AWAITING_VALIDATION: 'Validation client',
  RELEASED: 'Fonds débloqués',
};

/**
 * Who may claim each step through `POST /commandes/:id/steps` - NOT "whose step
 * is this".
 *
 * The two nulls are load-bearing and must not be "corrected" to roles.
 * `PAID` is written by P1's charge webhook, and `RELEASED` only by the release
 * route, which moves real money. Without the `RELEASED: null` a client could
 * claim it on the tracking route: he is the party who causes it and it IS the
 * successor of AWAITING_VALIDATION, so both other guards would pass, and the row
 * would read « Fonds débloqués » with no transfer and no way for the
 * reconciliation query to find it. See spec §6.3.
 *
 * The owner decided on 2026-08-17 that the CLIENT marks « Colis envoyé »: in
 * « Envoi par colis » it is the client who ships the device, and the approved
 * prototype had the réparateur attesting to it.
 */
export const STEP_CLAIMANT: Record<CommandeStep, CommandeRole | null> = {
  PAID: null,
  PARCEL_SENT: 'CLIENT',
  PARCEL_RECEIVED: 'REPAIRER',
  REPAIR_STARTED: 'REPAIRER',
  REPAIR_DONE: 'REPAIRER',
  // P4's return legs mirror the outbound pair: the réparateur ships the repaired
  // device back and the CLIENT confirms he has it. Same reason as above - neither
  // party attests to the other's act.
  RETURN_SENT: 'REPAIRER',
  RETURN_RECEIVED: 'CLIENT',
  AWAITING_VALIDATION: 'REPAIRER',
  RELEASED: null,
};

/**
 * Nine steps. The return legs sit BEFORE `AWAITING_VALIDATION`, deliberately:
 * the client must have the repaired device in his hands before he is asked to
 * release funds, which is the whole of escrow.
 *
 * The alternative - letting `RETURN_RECEIVED` be validated directly and dropping
 * `AWAITING_VALIDATION` from this sequence - saves two taps but changes
 * `canValidate`'s signature to take a delivery, ripples through P3's contract,
 * and removes the réparateur's way to say « j'ai terminé, payez-moi ». Recorded
 * so it is not re-proposed as an obvious simplification. See the P4 spec §4.1.
 */
const PARCEL_SEQUENCE: readonly CommandeStep[] = [
  'PAID',
  'PARCEL_SENT',
  'PARCEL_RECEIVED',
  'REPAIR_STARTED',
  'REPAIR_DONE',
  'RETURN_SENT',
  'RETURN_RECEIVED',
  'AWAITING_VALIDATION',
  'RELEASED',
];

const LOCAL_SEQUENCE: readonly CommandeStep[] = [
  'PAID',
  'REPAIR_STARTED',
  'REPAIR_DONE',
  'AWAITING_VALIDATION',
  'RELEASED',
];

/** Nine steps for a parcel, five for a local delivery. */
export function stepsFor(delivery: DeliveryMode): CommandeStep[] {
  return [...(delivery === 'PARCEL' ? PARCEL_SEQUENCE : LOCAL_SEQUENCE)];
}

/**
 * Null at the end of the sequence AND for a step that is not in this delivery's
 * sequence at all - which is what refuses a client claiming « Colis envoyé » on a
 * workshop commande.
 */
export function nextStepFor(step: CommandeStep, delivery: DeliveryMode): CommandeStep | null {
  const sequence = stepsFor(delivery);
  const at = sequence.indexOf(step);
  if (at < 0 || at === sequence.length - 1) return null;
  return sequence[at + 1] ?? null;
}

/**
 * True when `role` may claim the step that follows `step`.
 *
 * The server's guard and the button's visibility both call this. Two
 * implementations of "what comes next" is how a button offers a transition the
 * server refuses - the same reasoning as `computeAmounts` above.
 */
export function canAdvance(
  step: CommandeStep,
  delivery: DeliveryMode,
  role: CommandeRole,
): boolean {
  const next = nextStepFor(step, delivery);
  if (next === null) return false;
  // A null claimant never equals a role, so RELEASED falls out here.
  return STEP_CLAIMANT[next] === role;
}

export function canValidate(step: CommandeStep, role: CommandeRole): boolean {
  return step === 'AWAITING_VALIDATION' && role === 'CLIENT';
}

/**
 * The colis return leg's grace period, after which the réparateur may ask for
 * release himself. Sized on Colissimo domestic being 2–3 business days: 7 absorbs
 * a weekend and a relay-point pickup delay without him asking while the parcel is
 * genuinely still moving. See the P5 spec §2.3.
 */
export const RETURN_SENT_TIMEOUT_DAYS = 7;

/**
 * How long the client has to validate before funds release on their own.
 *
 * NOT named AUTO_RELEASE_DAYS: `payments.service.ts` already has one of those at
 * 60, and it means something entirely different - the compliance backstop against
 * Stripe's 90-day holding limit. Two similarly-named day counts on the money path
 * is a trap worth not setting.
 */
export const VALIDATION_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * Just the three fields the timeout reads, so a caller need not hold a whole DTO -
 * the same shape and the same reason as `LabelState`.
 *
 * `returnSentAt` is an ISO string on both sides: the app has one from JSON, and
 * the server converts its `Date` at the call site. A `string | Date` union here
 * would push that ambiguity into every reader.
 */
export type ReturnTimeoutState = {
  delivery: DeliveryMode;
  step: CommandeStep | null;
  returnSentAt: string | null;
};

/**
 * The date from which the réparateur may ask for release, or null when the
 * question does not apply.
 *
 * Exists so the button and the sentence above it cannot disagree: the screen needs
 * a date to print and a boolean to gate, and deriving both from one stamp is what
 * keeps them consistent.
 */
export function releaseRequestAvailableAt(c: ReturnTimeoutState): string | null {
  if (c.delivery !== 'PARCEL' || c.step !== 'RETURN_SENT' || c.returnSentAt === null) {
    return null;
  }
  return new Date(
    new Date(c.returnSentAt).getTime() + RETURN_SENT_TIMEOUT_DAYS * DAY_MS,
  ).toISOString();
}

/**
 * True when the réparateur may claim `AWAITING_VALIDATION` directly from
 * `RETURN_SENT`, skipping `RETURN_RECEIVED`.
 *
 * This is a SIBLING of `canAdvance` rather than a change to it, and deliberately:
 * `canAdvance` is pure and clock-free, and it is the single function the button's
 * visibility and the server's guard both read. Giving it a clock would put a time
 * bomb inside that invariant. Both sides read THIS instead, so the rule still has
 * one implementation.
 *
 * What he asserts by using it is « j'ai terminé, payez-moi » - which is what
 * `AWAITING_VALIDATION` exists for - and never that the client received anything.
 * `RETURN_RECEIVED` is skipped and claimed by nobody, which is the truthful
 * record. See the P5 spec §2.2.
 */
export function canRequestReleaseAfterTimeout(c: ReturnTimeoutState, now: Date): boolean {
  const availableAt = releaseRequestAvailableAt(c);
  if (availableAt === null) return false;
  return now.getTime() >= new Date(availableAt).getTime();
}

/**
 * When funds release on their own, or null while release has not been requested.
 *
 * The client's screen prints this, and the auto-release job computes its cutoff
 * from the same constant - a hard-coded interval in the query would be a second
 * copy of `VALIDATION_WINDOW_DAYS`, which is the drift `computeAmounts` exists to
 * prevent on the other side of the ledger.
 */
export function autoReleaseDueFrom(releaseRequestedAt: string | null): string | null {
  if (releaseRequestedAt === null) return null;
  return new Date(
    new Date(releaseRequestedAt).getTime() + VALIDATION_WINDOW_DAYS * DAY_MS,
  ).toISOString();
}

/**
 * The two steps nobody can perform without a label in hand.
 *
 * A map rather than two `if`s so the server guard and the button read one
 * structure - the same reasoning as `canAdvance`. Every other step is absent,
 * which is what makes `labelReady` total.
 */
export const LABEL_REQUIRED_BY: Partial<Record<CommandeStep, 'OUTBOUND' | 'RETURN'>> = {
  PARCEL_SENT: 'OUTBOUND',
  RETURN_SENT: 'RETURN',
};

/** Just the two numbers, so a caller need not hold a whole DTO. */
export type LabelState = {
  outboundTrackingNumber: string | null;
  returnTrackingNumber: string | null;
};

/**
 * True when `step` needs no label, or needs one and has it.
 *
 * The server's guard and the button's visibility both call this. A client cannot
 * ship without a label, so two implementations of "is the label ready" is how a
 * button offers a transition the server refuses.
 */
export function labelReady(step: CommandeStep, c: LabelState): boolean {
  const leg = LABEL_REQUIRED_BY[step];
  if (!leg) return true;
  return leg === 'OUTBOUND'
    ? c.outboundTrackingNumber !== null
    : c.returnTrackingNumber !== null;
}

export type ParcelStage =
  | 'NOT_PARCEL'
  | 'AWAITING_YOUR_ADDRESS'
  | 'AWAITING_OTHER_ADDRESS'
  | 'AWAITING_LABELS'
  | 'LABELS_ISSUED';

/**
 * One state for the tracking screen to switch on, derived rather than assembled
 * from three booleans scattered through JSX.
 *
 * Order matters: the viewer's own address is asked for FIRST even when the other
 * party has already answered, because that is the only thing he can act on.
 */
export function parcelStage(
  c: Pick<
    CommandeDto,
    'delivery' | 'myAddressSubmitted' | 'counterpartyAddressSubmitted' | 'outboundTrackingNumber'
  >,
): ParcelStage {
  if (c.delivery !== 'PARCEL') return 'NOT_PARCEL';
  if (c.outboundTrackingNumber !== null) return 'LABELS_ISSUED';
  if (!c.myAddressSubmitted) return 'AWAITING_YOUR_ADDRESS';
  if (!c.counterpartyAddressSubmitted) return 'AWAITING_OTHER_ADDRESS';
  return 'AWAITING_LABELS';
}

/**
 * A shipping address, as either party supplies it.
 *
 * `postalCodeSchema` and the phone validator are REUSED rather than re-authored:
 * a fourth literal copy of « Code postal invalide. » is exactly the duplication
 * already logged against phone.schemas.ts / auth.ts / auth-errors.ts.
 *
 * No country. Launch geography is France-only and the postal validator is a
 * five-digit French one, so a column that only ever holds `FR` is the
 * permanently-constant field P3 §4.4 refused for `trackingNumber`.
 */
export const shippingAddressSchema = z.object({
  line1: z
    .string()
    .trim()
    .min(1, { message: 'Adresse requise.' })
    .max(120, { message: 'Adresse trop longue.' }),
  line2: z.string().trim().max(120, { message: 'Complément trop long.' }).optional(),
  postalCode: postalCodeSchema,
  city: z
    .string()
    .trim()
    .min(1, { message: 'Ville requise.' })
    .max(80, { message: 'Ville trop longue.' }),
  phone: frAnyPhoneSchema,
  /** Required by the server when the commande's option is RELAY (spec §7.4). */
  parcelPoint: parcelPointSchema.optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

/**
 * A carrier tracking number, and deliberately LOOSE.
 *
 * A 13-character Colissimo validator would be correct today and wrong the first
 * time the operator uses a different service - and wrong in the most annoying
 * way, refusing a number written on a label he is holding.
 */
export const trackingNumberSchema = z
  .string()
  .trim()
  .min(5, { message: 'Numéro de suivi invalide.' })
  .max(40, { message: 'Numéro de suivi invalide.' })
  .regex(/^[A-Za-z0-9 ]+$/, { message: 'Numéro de suivi invalide.' });

export const issueLabelsSchema = z.object({
  outboundTrackingNumber: trackingNumberSchema,
  returnTrackingNumber: trackingNumberSchema,
});
export type IssueLabelsInput = z.infer<typeof issueLabelsSchema>;

export const advanceStepSchema = z.object({ step: commandeStepSchema });
export type AdvanceStepInput = z.infer<typeof advanceStepSchema>;

export const commandeListQuerySchema = z.object({
  // Required rather than defaulted. Stage 4b's `sort ?? 'recentes'` silently
  // broke two independent guards; a default here shows one party the wrong list.
  role: z.enum(['client', 'repairer'], { message: 'Rôle invalide.' }),
});
export type CommandeListQuery = z.infer<typeof commandeListQuerySchema>;

/** One job's outcome. Reported per job so a partial run is legible. */
export type CronJobResult = {
  job: string;
  scanned: number;
  acted: number;
  failed: number;
  /** Set only when the job itself threw, as opposed to individual rows failing. */
  error: string | null;
};

export type CronRunResponse = { jobs: CronJobResult[] };

/**
 * Why a commande needs the operator's attention. All six are derived from
 * existing columns rather than a new "attention" flag.
 *
 * STALLED: `autoReleaseDueAt` has passed and the step is earlier than
 * `AWAITING_VALIDATION`, so auto-releasing it would pay for work not done.
 *
 * DISPUTED: `disputedAt` is set.
 *
 * REVERSAL_FAILED: status is `REFUNDED`, a transfer succeeded, but no reversal
 * id - the operator clawed back the platform's money and the réparateur kept his.
 * Can false-positive when a clawback succeeded but its persist failed, or on the
 * documented past-24h retry path.
 *
 * CHARGE_MISSING: status is `PAID` but `stripeChargeId` is null, so the row is
 * permanently unreleasable - release refuses it, and the PAID early return means
 * no webhook redelivery will ever backfill it.
 *
 * REFUND_INCOMPLETE: status is `PAID` carrying EITHER Stripe id - a refund whose
 * disposition never settled, and no other reason here can see such a row. With a
 * reversal id: the clawback succeeded and the refund did not, so BOTH parties'
 * money is sitting on the platform. With only a refund id: either the final
 * transaction failed after the refund was created, or `refund.updated` un-did the
 * disposition because Stripe refused it. Opposite remedies; a human decides which.
 *
 * RELEASE_FAILING: J1-eligible (PAID, AWAITING_VALIDATION, past cutoff, no
 * transfer, not disputed, not refunded) yet still unreleased. The single state
 * where escrowed money is stuck and a human must act - typically no
 * ConnectAccount or `transfersActive: false`.
 *
 * SHIPMENT_FAILED / SHIPMENT_EXCEPTION: Livraison Boxtal - a leg Boxtal refused (status
 * FAILED, retried from /colis), or a leg whose newest carrier event is EXCEPTION or RETURNED.
 * SHARE_OWED: CF4-D (spec §7). Status is `REFUNDED` with a non-null `refundMotif` -
 * a flexible partial refund happened - and the réparateur's share of that refund
 * (protection/shipping kept back for him) has not been paid out yet. Only a partial
 * refund can leave money owed this way; a full refund by definition owes him nothing.
 */
export type AdminAttentionReason =
  | AttentionReason
  | 'SHIPMENT_FAILED'
  | 'SHIPMENT_EXCEPTION';

/**
 * Reasons « Marquer comme traité » cannot clear: they end by ACTING (answer the client who is
 * waiting, move the money still owed), so hiding them would lose a dossier. The API refuses to
 * hide an order carrying one, and the page does not offer the button.
 */
export const ATTENTION_UNDISMISSABLE_REASONS: readonly AdminAttentionReason[] = [
  'CANCELLATION_REQUESTED',
  'SHARE_OWED',
  'REVERSAL_FAILED',
];

/**
 * The operator-facing wording, here rather than in `attention-mail.ts` because the
 * digest and the /attention table are two views of one list: with the map living
 * next to the mail builder the page rendered the raw enum, so the same row read
 * `RELEASE_FAILING` on screen and « Déblocage en échec » in the email.
 *
 * `REVERSAL_FAILED` is deliberately NOT « Remboursement échoué »: in that state the
 * REFUND succeeded and the CLAWBACK failed, so the money is with the réparateur and
 * "refund failed" points the operator at the wrong remedy.
 */
export const ATTENTION_REASON_LABEL: Record<AdminAttentionReason, string> = {
  STALLED: 'Bloquée',
  DISPUTED: 'Contestée',
  REVERSAL_FAILED: 'Récupération des fonds échouée',
  CHARGE_MISSING: 'Charge Stripe manquante',
  REFUND_INCOMPLETE: 'Remboursement incomplet',
  RELEASE_FAILING: 'Déblocage en échec',
  SHIPMENT_FAILED: 'Étiquette Boxtal en échec',
  SHIPMENT_EXCEPTION: 'Incident transporteur',
  SHARE_OWED: 'Part du réparateur à verser',
  CANCELLATION_REQUESTED: 'Annulation demandée',
  DISPUTE_REPLY: 'Réponse dans un litige',
  PARCEL_BLOCKED: 'Colis bloqué',
  PARCEL_INCIDENT: 'Incident transporteur',
  PAYMENT_PENDING_STALE: 'Paiement en attente périmé',
};


/**
 * Echoed before every operator action (refund, label issue) so a mis-keyed
 * commande id is self-evident. P4's /colis review found that pasting a wrong id
 * passes every guard and sends a client's device to the wrong réparateur. The
 * same typo on the refund route moves real money in two directions. See the P5
 * spec §6.5.
 */
export type AdminCommandeSummary = {
  commandeId: string;
  demandeTitle: string;
  clientName: string;
  repairerName: string;
  clientCity: string | null;
  repairerCity: string | null;
  delivery: DeliveryMode;
  status: CommandeStatus;
  step: CommandeStep | null;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  totalCents: number;
  /** True when a transfer succeeded. */
  transferred: boolean;
  /**
   * True when the row carries a `stripeRefundId`. Deliberately NOT "was refunded":
   * a failed refund's id stays on the row, so this says a refund was ATTEMPTED. The
   * operator about to refund needs to see that before he acts either way.
   */
  refunded: boolean;
  /** True when `disputedAt` is set - a chargeback is open, and refunding is the wrong remedy. */
  disputed: boolean;
  /** Livraison Boxtal. Empty for local orders and for manual-driver parcels. */
  shipments: AdminShipmentSummary[];
  insuranceCents: number;
  /**
   * CF4-D task 5 (spec §2, §5, §7). The admin's starting point for a NEW refund
   * breakdown - always present, even on an already-refunded row, since the operator
   * may still need to see what a fresh refund would default to (e.g. after
   * `DISPUTE_DECISION`). Derived, not stored - `suggestedRefund` is pure.
   */
  suggestion: { repairCents: number; shippingCents: number; protectionCents: number };
  /**
   * What was ACTUALLY refunded, non-null only once a refund has landed
   * (`refundRepairCents !== null`). `null` on a row never refunded - distinct from
   * an all-zero breakdown, which would claim a refund of nothing happened.
   */
  refund: RefundBreakdown | null;
  /**
   * CF4-D task 5 (spec §3, §7). The réparateur's share still owed after a partial
   * refund, 0 when nothing is owed (full refund, no breakdown, or already paid).
   * Same derivation the SHARE_OWED attention reason and `payShare`'s refusal use.
   */
  shareOwedCents: number;
  /**
   * CF4-I (spec §4.5). True while a PENDING cancellation request freezes this order - drives
   * the « Remboursement » page's banner (a refund from here closes the request APPROVED).
   */
  cancellationPending: boolean;
  /** Bug B3: Whether a Stripe charge id is present on the order. */
  hasStripeCharge?: boolean;
};

/** One leg as the operator sees it on /colis: quoted versus billed, and why it failed if it did. */
export const adminShipmentSummarySchema = z.object({
  leg: z.enum(['OUTBOUND', 'INBOUND', 'RETURN']),
  status: z.string(),
  carrierLabel: z.string(),
  quotedCostExclTaxCents: z.number(),
  billedExclTaxCents: z.number().nullable(),
  boxtalOrderId: z.string().nullable(),
  labelReady: z.boolean(),
  failureReason: z.string().nullable(),
});
export type AdminShipmentSummary = z.infer<typeof adminShipmentSummarySchema>;

export const adminCommandeTimelineItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  timestamp: z.string().nullable(),
  completed: z.boolean(),
  current: z.boolean(),
});
export type AdminCommandeTimelineItem = z.infer<typeof adminCommandeTimelineItemSchema>;

export const adminCommandeDisputeSchema = z.object({
  id: z.string(),
  disputeNumber: z.string(),
  status: disputeStatusSchema,
  reason: z.string(),
  verdict: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type AdminCommandeDispute = z.infer<typeof adminCommandeDisputeSchema>;

export const adminCommandeReviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  published: z.boolean(),
  createdAt: z.string(),
});
export type AdminCommandeReview = z.infer<typeof adminCommandeReviewSchema>;

export const adminCommandeCancellationSchema = z.object({
  id: z.string(),
  requesterRole: z.enum(['CLIENT', 'REPAIRER', 'ADMIN']),
  reason: z.string().nullable(),
  status: cancellationRequestStatusSchema,
  createdAt: z.string(),
});
export type AdminCommandeCancellation = z.infer<typeof adminCommandeCancellationSchema>;

/**
 * F1 Fiche Commande payload returned by GET /admin/commandes/:id.
 * Unifies the order's entire journey into a single strongly-typed contract.
 */
export const adminCommandeDetailSchema = z.object({
  commandeId: z.string(),
  reference: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: commandeStatusSchema,
  step: commandeStepSchema.nullable(),
  delivery: deliveryModeSchema,

  amounts: z.object({
    repairCents: z.number(),
    shippingCents: z.number(),
    protectionCents: z.number(),
    totalCents: z.number(),
    shareOwedCents: z.number(),
    suggestedRefund: z.object({
      repairCents: z.number(),
      shippingCents: z.number(),
      protectionCents: z.number(),
    }),
    refund: z
      .object({
        repairCents: z.number(),
        shippingCents: z.number(),
        protectionCents: z.number(),
        totalCents: z.number(),
      })
      .nullable(),
  }),

  stripe: z.object({
    paymentIntentId: z.string().nullable(),
    chargeId: z.string().nullable(),
    transferId: z.string().nullable(),
    refundId: z.string().nullable(),
    transferSucceeded: z.boolean(),
    hasCharge: z.boolean(),
  }),

  demande: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    categoryLabel: z.string().nullable(),
    /** F12. The fault type the client picked; null for every demande until the app asks for one. */
    faultType: z.object({ id: z.string(), labelFr: z.string(), slug: z.string() }).nullable(),
    photos: z.array(z.string()),
    createdAt: z.string(),
  }),

  offer: z
    .object({
      id: z.string(),
      amountCents: z.number(),
      parts: z.string().nullable(),
      warranty: z.string().nullable(),
      message: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),

  client: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
  }),

  repairer: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
  }),

  shipments: z.array(adminShipmentSummarySchema),
  dispute: adminCommandeDisputeSchema.nullable(),
  review: adminCommandeReviewSchema.nullable(),
  cancellation: adminCommandeCancellationSchema.nullable(),
  timeline: z.array(adminCommandeTimelineItemSchema),
  conversationId: z.string().nullable(),
});

export type AdminCommandeDetail = z.infer<typeof adminCommandeDetailSchema>;

