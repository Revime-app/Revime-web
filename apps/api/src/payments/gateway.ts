import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

export type CheckoutSessionSummary = {
  id: string;
  url: string;
  status: 'open' | 'complete' | 'expired';
  paymentIntentId: string | null;
  chargeId: string | null;
};

export type PaymentIntentSummary = {
  id: string;
  clientSecret: string;
  status: string;
  chargeId: string | null;
};

export type CreatePaymentIntentInput = {
  commandeId: string;
  demandeId: string;
  offerId: string;
  customerEmail: string;
  amountCents: number;
  metadata: {
    commandeId: string;
    demandeId: string;
    offerId: string;
  };
};


export type CreateSessionInput = {
  commandeId: string;
  demandeId: string;
  offerId: string;
  customerEmail: string;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  /** Livraison Boxtal. 0 for every non-parcel order and for an uninsured parcel; a fourth line when > 0. */
  insuranceCents: number;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds. Stripe's minimum is 30 minutes from now. */
  expiresAt: number;
};

export type CreateTransferInput = {
  /** Always `repairCents`. The réparateur receives 100% of his quote. */
  amountCents: number;
  /** `ConnectAccount.stripeAccountId`. */
  destination: string;
  /** `Commande.stripeChargeId`. Lets the transfer move funds that are not yet available. */
  sourceTransaction: string;
  /** The commande id, so a stranded release is findable from Stripe's side. */
  transferGroup: string;
};

export type CreateRefundInput = {
  /** `Commande.stripeChargeId`. Refunds go against the charge, on the platform account. */
  chargeId: string;
  amountCents: number;
};

export type ReverseTransferInput = {
  /** `Commande.stripeTransferId`. */
  transferId: string;
  amountCents: number;
};

/**
 * A refund can be `pending` when the platform balance is short, and Stripe settles
 * it later. A Transfer never does this, which is why P3 could say a transfer
 * "returns an object or throws" and P5 cannot. See the P5 spec §3.
 */
export type RefundSummary = {
  id: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
};

export type TransferSummary = { id: string; amountCents: number };

export type StripeWebhookEvent = {
  id: string;
  type: string;
  object: Record<string, unknown>;
};

export interface PaymentsGateway {
  createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSessionSummary>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionSummary>;
  /** Kills a session so it can no longer be paid. Idempotent from our side. */
  expireCheckoutSession(id: string): Promise<void>;

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentSummary>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentSummary>;
  cancelPaymentIntent(id: string): Promise<void>;

  /** Throws when the signature does not verify. Never faked. */
  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent;
  /**
   * Created on the PLATFORM account - no `Stripe-Account` header - so this is not
   * a connected-account call and belongs here rather than in `connect/`.
   *
   * `application_fee_amount` is FORBIDDEN with separate charges and transfers:
   * the fee is collected by transferring less than the charge. The idempotency
   * key is a parameter rather than derived here, so a test can pin it.
   */
  createTransfer(
    input: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<{ id: string }>;

  /**
   * Refunds the client. Created on the PLATFORM account, so it belongs here.
   *
   * `reverse_transfer` is NOT passed and is not available to us: it is a
   * destination-charge parameter, and with separate charges and transfers
   * "refunding a charge doesn't affect any associated transfers". The clawback is
   * a separate `reverseTransfer` call, and it goes FIRST. See the P5 spec §3.
   */
  createRefund(input: CreateRefundInput, idempotencyKey: string): Promise<RefundSummary>;

  /**
   * Asks Stripe what a recorded refund actually IS. Necessary because a refund
   * reported `pending` can fail later, and the `refund.updated` handler puts the
   * row back to `PAID` while KEEPING `stripeRefundId` for traceability - so a
   * retry cannot tell "the refund happened, finish the job" from "the refund
   * failed, start over" by reading the row. Nothing in the row records a
   * refund's status. Stripe is the authority; the row is not.
   */
  retrieveRefund(refundId: string): Promise<RefundSummary>;

  /**
   * CF4-19 (spec §4). Read-only: fetches the charge's card brand and last 4 digits
   * for the refund detail page. Never writes anything and never creates a Stripe
   * object - the admin-refunds detail route calls this purely to show the payment
   * method beside the live refund status. `null` fields when Stripe has no card
   * details for the charge (e.g. a non-card payment method), not a thrown error -
   * the caller (AdminRefundsService.detail) is the one that decides "Indisponible"
   * vs a genuinely absent value.
   */
  retrieveChargePaymentMethod(chargeId: string): Promise<{ brand: string | null; last4: string | null }>;

  /**
   * The ONLY clawback mechanism - a transfer cannot be edited or deleted.
   *
   * Fails when the réparateur's Stripe balance no longer holds the funds, which is
   * a designed-for outcome rather than an error to swallow: P5 spec §6.2 still
   * refunds the client and records the failure.
   */
  reverseTransfer(input: ReverseTransferInput, idempotencyKey: string): Promise<{ id: string }>;

  /**
   * Does a transfer for this charge and this réparateur already exist?
   *
   * Keyed on `destination` + `source_transaction`, NOT on `transfer_group`.
   * Stripe's docs say a transfer inherits the SOURCE CHARGE's transfer_group when
   * the charge has one, so our explicit `transfer_group: commandeId` may not
   * survive - and a lookup that silently returns nothing would authorise a second
   * real transfer. This pair is exact. See the P5 spec §5.5.
   */
  findTransferBySource(input: {
    destination: string;
    sourceTransaction: string;
  }): Promise<TransferSummary | null>;
}

/**
 * Signature verification is pure local crypto - it needs the webhook secret and
 * nothing else - so both drivers share this and the fake verifies for real. A
 * faked signature check would fake the only thing protecting this route.
 */
function verify(raw: Buffer, signature: string): StripeWebhookEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

  const event = Stripe.webhooks.constructEvent(raw, signature, secret);
  return {
    id: event.id,
    type: event.type,
    object: event.data.object as unknown as Record<string, unknown>,
  };
}

/**
 * The three `line_items`, built inline so the hosted page itemises what the app's
 * breakdown shows.
 *
 * The « Livraison » line is OMITTED when it is zero: the in-app breakdown keeps
 * showing « Livraison 0 € » as the prototype does, but an empty row on a payment
 * page is noise.
 *
 * Exported for unit test - the money-shaped pure logic in this file.
 */
export function lineItems(input: CreateSessionInput): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const line = (name: string, unit_amount: number) => ({
    quantity: 1,
    price_data: { currency: 'eur', unit_amount, product_data: { name } },
  });

  return [
    line('Réparation', input.repairCents),
    // « aller-retour » since Livraison Boxtal: the line has always covered both legs, and the
    // hosted page is the one place the client reads it without our breakdown beside it.
    ...(input.shippingCents > 0 ? [line('Livraison aller-retour', input.shippingCents)] : []),
    line('Protection Revime', input.protectionCents),
    // Optional, the client's choice (spec §0.1). Omitted when zero, like Livraison.
    ...(input.insuranceCents > 0 ? [line('Assurance transport', input.insuranceCents)] : []),
  ];
}

/** Exported for unit test - the money-shaped pure logic in this file. */
export function summarise(session: Stripe.Checkout.Session): CheckoutSessionSummary {
  const intent = session.payment_intent;
  const paymentIntentId = typeof intent === 'string' ? intent : (intent?.id ?? null);
  const charge =
    typeof intent === 'string' || intent === null
      ? null
      : (intent.latest_charge ?? null);

  return {
    id: session.id,
    url: session.url ?? '',
    status: session.status === 'complete' ? 'complete' : session.status === 'expired' ? 'expired' : 'open',
    paymentIntentId,
    chargeId: typeof charge === 'string' ? charge : (charge?.id ?? null),
  };
}

class StripePaymentsGateway implements PaymentsGateway {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSessionSummary> {
    const session = await this.stripe.checkout.sessions.create({
      // `mode: 'payment'` captures immediately, which is the whole design. NEVER
      // add `payment_intent_data.capture_method: 'manual'`: Stripe cancels an
      // uncaptured PaymentIntent after 7 days, and a colis repair is ship ->
      // repair -> return -> validate. Funds are held on the platform BALANCE,
      // not as an authorization on the card.
      mode: 'payment',
      // Deliberately explicit rather than automatic payment methods: this makes
      // `checkout.session.completed` imply paid, so there is one synchronous
      // success path and no async_payment_succeeded branch to get wrong. Wallets
      // are not lost - Checkout surfaces Apple Pay and Google Pay under `card`.
      payment_method_types: ['card'],
      customer_email: input.customerEmail,
      client_reference_id: input.commandeId,
      metadata: {
        commandeId: input.commandeId,
        demandeId: input.demandeId,
        offerId: input.offerId,
      },
      line_items: lineItems(input),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: input.expiresAt,
    });
    return summarise(session);
  }

  async retrieveCheckoutSession(id: string): Promise<CheckoutSessionSummary> {
    // The charge id lives two hops down and P3 needs it, so expand rather than
    // make a second round trip at release time.
    const session = await this.stripe.checkout.sessions.retrieve(id, {
      expand: ['payment_intent'],
    });
    return summarise(session);
  }

  async expireCheckoutSession(id: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(id);
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: 'eur',
      payment_method_types: ['card'],
      receipt_email: input.customerEmail,
      metadata: input.metadata,
      capture_method: 'automatic',
      description: `Commande REVIME ${input.commandeId}`,
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? '',
      status: intent.status,
      chargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null),
    };
  }

  async retrievePaymentIntent(id: string): Promise<PaymentIntentSummary> {
    const intent = await this.stripe.paymentIntents.retrieve(id);
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? '',
      status: intent.status,
      chargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null),
    };
  }

  async cancelPaymentIntent(id: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(id);
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verify(raw, signature);
  }

  async createTransfer(
    input: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    const transfer = await this.stripe.transfers.create(
      {
        amount: input.amountCents,
        currency: 'eur',
        destination: input.destination,
        // The whole reason a release works the day after payment: payouts on this
        // account are `manual` with delay_days 3, so the funds are not available.
        source_transaction: input.sourceTransaction,
        transfer_group: input.transferGroup,
      },
      { idempotencyKey },
    );
    return { id: transfer.id };
  }

  async createRefund(
    input: CreateRefundInput,
    idempotencyKey: string,
  ): Promise<RefundSummary> {
    const refund = await this.stripe.refunds.create(
      { charge: input.chargeId, amount: input.amountCents },
      { idempotencyKey },
    );
    return {
      id: refund.id,
      status:
        refund.status === 'succeeded' ||
        refund.status === 'pending' ||
        refund.status === 'requires_action' ||
        refund.status === 'failed' ||
        refund.status === 'canceled'
          ? refund.status
          : 'pending',
    };
  }

  async retrieveRefund(refundId: string): Promise<RefundSummary> {
    const refund = await this.stripe.refunds.retrieve(refundId);
    return {
      id: refund.id,
      status:
        refund.status === 'succeeded' ||
        refund.status === 'pending' ||
        refund.status === 'requires_action' ||
        refund.status === 'failed' ||
        refund.status === 'canceled'
          ? refund.status
          : 'pending',
    };
  }

  async retrieveChargePaymentMethod(chargeId: string): Promise<{ brand: string | null; last4: string | null }> {
    const charge = await this.stripe.charges.retrieve(chargeId);
    const card = charge.payment_method_details?.card ?? null;
    return {
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
    };
  }

  async reverseTransfer(
    input: ReverseTransferInput,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    const reversal = await this.stripe.transfers.createReversal(
      input.transferId,
      { amount: input.amountCents },
      { idempotencyKey },
    );
    return { id: reversal.id };
  }

  async findTransferBySource(input: {
    destination: string;
    sourceTransaction: string;
  }): Promise<TransferSummary | null> {
    // `destination` is a supported list filter; `source_transaction` is not, so it
    // is matched in memory over that destination's recent transfers. A réparateur
    // has few, and this runs once per release.
    const page = await this.stripe.transfers.list({
      destination: input.destination,
      limit: 100,
    });
    const found = page.data.find((t) => {
      const source = t.source_transaction;
      const id = typeof source === 'string' ? source : (source?.id ?? null);
      return id === input.sourceTransaction;
    });
    return found ? { id: found.id, amountCents: found.amount } : null;
  }
}

/**
 * In-memory gateway for development and for the integration suite.
 *
 * It creates no Stripe objects and reaches no network, so the suite can drive the
 * whole flow - create, expire, complete - deterministically. Signature
 * verification still goes through the real library.
 */
export class FakePaymentsGateway implements PaymentsGateway {
  private readonly sessions = new Map<string, CheckoutSessionSummary>();
  private readonly paymentIntents = new Map<string, { summary: PaymentIntentSummary; input: CreatePaymentIntentInput }>();
  private readonly transfers = new Map<string, { id: string; input: CreateTransferInput }>();
  private readonly refunds = new Map<string, { summary: RefundSummary; input: CreateRefundInput }>();
  private readonly reversals = new Map<string, { id: string; input: ReverseTransferInput }>();
  /**
   * Refund id to the status Stripe would report for it, keyed by ID rather than by
   * idempotency key: `retrieveRefund` is given an id and knows nothing about the
   * key that produced it. `createRefund` records what it returned here, so the two
   * agree by default and only a test that wants disagreement has to ask for it.
   */
  private readonly refundStatuses = new Map<string, RefundSummary['status']>();
  private readonly callLog: string[] = [];
  private failNextTransfer = false;
  private failNextReversal = false;
  private failNextRefund = false;
  private failNextRetrieveRefund = false;
  private nextRefundStatus: RefundSummary['status'] = 'succeeded';

  createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSessionSummary> {
    const id = `cs_fake_${randomUUID()}`;
    const summary: CheckoutSessionSummary = {
      id,
      // Points at the cancel URL rather than nowhere, so a developer who opens it
      // lands somewhere real instead of on a browser error.
      url: `${input.cancelUrl}&fake_session=${id}`,
      status: 'open',
      paymentIntentId: null,
      chargeId: null,
    };
    this.sessions.set(id, summary);
    return Promise.resolve(summary);
  }

  retrieveCheckoutSession(id: string): Promise<CheckoutSessionSummary> {
    const found = this.sessions.get(id);
    if (!found) return Promise.reject(new Error(`No such fake session: ${id}`));
    return Promise.resolve(found);
  }

  expireCheckoutSession(id: string): Promise<void> {
    const found = this.sessions.get(id);
    if (!found) throw new Error(`No such fake session: ${id}`);
    this.sessions.set(id, { ...found, status: 'expired' });
    return Promise.resolve();
  }

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentSummary> {
    const id = `pi_fake_${randomUUID()}`;
    const summary: PaymentIntentSummary = {
      id,
      clientSecret: `${id}_secret_${randomUUID()}`,
      status: 'requires_payment_method',
      chargeId: null,
    };
    this.paymentIntents.set(id, { summary, input });
    return Promise.resolve(summary);
  }

  retrievePaymentIntent(id: string): Promise<PaymentIntentSummary> {
    const found = this.paymentIntents.get(id);
    if (found) return Promise.resolve(found.summary);
    return Promise.resolve({
      id,
      clientSecret: `${id}_secret_${randomUUID()}`,
      status: 'requires_payment_method',
      chargeId: null,
    });
  }

  cancelPaymentIntent(id: string): Promise<void> {
    const found = this.paymentIntents.get(id);
    if (found) {
      found.summary.status = 'canceled';
    } else {
      this.paymentIntents.set(id, {
        summary: {
          id,
          clientSecret: `${id}_secret_${randomUUID()}`,
          status: 'canceled',
          chargeId: null,
        },
        input: {
          commandeId: '',
          demandeId: '',
          offerId: '',
          customerEmail: '',
          amountCents: 0,
          metadata: { commandeId: '', demandeId: '', offerId: '' },
        },
      });
    }
    return Promise.resolve();
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verify(raw, signature);
  }

  createTransfer(
    input: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    if (this.failNextTransfer) {
      this.failNextTransfer = false;
      return Promise.reject(new Error('Fake transfer failure for test'));
    }
    // Replays like a real key, which is what makes "exactly one transfer"
    // assertable in the release recovery test.
    const existing = this.transfers.get(idempotencyKey);
    if (existing) return Promise.resolve({ id: existing.id });

    const id = `tr_fake_${randomUUID()}`;
    this.transfers.set(idempotencyKey, { id, input });
    return Promise.resolve({ id });
  }

  /** Test-only. */
  markComplete(id: string, ids: { paymentIntentId: string; chargeId: string }): void {
    const found = this.sessions.get(id);
    if (!found) throw new Error(`No such fake session: ${id}`);
    this.sessions.set(id, { ...found, status: 'complete', ...ids });
  }

  /** Test-only. */
  markExpired(id: string): void {
    const found = this.sessions.get(id);
    if (!found) throw new Error(`No such fake session: ${id}`);
    this.sessions.set(id, { ...found, status: 'expired' });
  }

  /** Test-only. */
  paymentIntentFor(id: string): { summary: PaymentIntentSummary; input: CreatePaymentIntentInput } | undefined {
    return this.paymentIntents.get(id);
  }

  /** Test-only. */
  markPaymentIntentSucceeded(id: string, chargeId = `ch_fake_${randomUUID()}`): void {
    const found = this.paymentIntents.get(id);
    if (found) {
      found.summary.status = 'succeeded';
      found.summary.chargeId = chargeId;
    }
  }

  /** Test-only. */
  markPaymentIntentCanceled(id: string): void {
    const found = this.paymentIntents.get(id);
    if (found) {
      found.summary.status = 'canceled';
    }
  }

  /** Test-only. */
  transferCount(): number {
    return this.transfers.size;
  }

  /** Test-only. */
  transferFor(idempotencyKey: string): CreateTransferInput | undefined {
    return this.transfers.get(idempotencyKey)?.input;
  }

  /** Test-only. */
  reversalFor(idempotencyKey: string): ReverseTransferInput | undefined {
    return this.reversals.get(idempotencyKey)?.input;
  }

  /** Test-only. */
  refundFor(idempotencyKey: string): CreateRefundInput | undefined {
    return this.refunds.get(idempotencyKey)?.input;
  }

  /** Test-only. */
  failNextTransferOnce(): void {
    this.failNextTransfer = true;
  }

  createRefund(input: CreateRefundInput, idempotencyKey: string): Promise<RefundSummary> {
    this.callLog.push('createRefund');
    if (this.failNextRefund) {
      this.failNextRefund = false;
      return Promise.reject(new Error('Fake refund failure for test'));
    }
    const existing = this.refunds.get(idempotencyKey);
    if (existing) return Promise.resolve(existing.summary);

    const summary: RefundSummary = {
      id: `re_fake_${randomUUID()}`,
      status: this.nextRefundStatus,
    };
    this.refunds.set(idempotencyKey, { summary, input });
    // Record what we just returned, so retrieveRefund answers the same thing with
    // no seeding. A test that wants Stripe to disagree with what createRefund said
    // calls seedRefundStatus.
    this.refundStatuses.set(summary.id, summary.status);
    return Promise.resolve(summary);
  }

  retrieveRefund(refundId: string): Promise<RefundSummary> {
    this.callLog.push('retrieveRefund');
    if (this.failNextRetrieveRefund) {
      this.failNextRetrieveRefund = false;
      return Promise.reject(new Error('Fake retrieveRefund failure for test'));
    }
    // An unknown id resolves to 'succeeded' rather than rejecting: a row carrying a
    // refund id this fake never created is what a hand-written fixture looks like,
    // and treating it as a real refund is the conservative answer.
    return Promise.resolve({
      id: refundId,
      status: this.refundStatuses.get(refundId) ?? 'succeeded',
    });
  }

  /** CF4-19 (spec §4). Fixed fixture card, same reasoning as every other fake here: deterministic. */
  retrieveChargePaymentMethod(chargeId: string): Promise<{ brand: string | null; last4: string | null }> {
    this.callLog.push('retrieveChargePaymentMethod');
    void chargeId;
    return Promise.resolve({ brand: 'visa', last4: '4242' });
  }

  reverseTransfer(
    input: ReverseTransferInput,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    this.callLog.push('reverseTransfer');
    if (this.failNextReversal) {
      this.failNextReversal = false;
      // Mirrors the real refusal: the connected account no longer holds the funds.
      return Promise.reject(new Error('Fake reversal failure: insufficient balance'));
    }
    const existing = this.reversals.get(idempotencyKey);
    if (existing) return Promise.resolve({ id: existing.id });

    const id = `trr_fake_${randomUUID()}`;
    this.reversals.set(idempotencyKey, { id, input });
    return Promise.resolve({ id });
  }

  findTransferBySource(input: {
    destination: string;
    sourceTransaction: string;
  }): Promise<TransferSummary | null> {
    this.callLog.push('findTransferBySource');
    for (const { id, input: t } of this.transfers.values()) {
      if (t.destination === input.destination && t.sourceTransaction === input.sourceTransaction) {
        return Promise.resolve({ id, amountCents: t.amountCents });
      }
    }
    return Promise.resolve(null);
  }

  /** Test-only. The ORDER matters: reversal must precede refund. */
  calls(): string[] {
    return [...this.callLog];
  }

  /** Test-only. */
  refundCount(): number {
    return this.refunds.size;
  }

  /** Test-only. */
  reversalCount(): number {
    return this.reversals.size;
  }

  /** Test-only. A failed reversal is a DESIGNED-FOR outcome, not a hypothesis. */
  failNextReversalOnce(): void {
    this.failNextReversal = true;
  }

  /** Test-only. */
  failNextRefundOnce(): void {
    this.failNextRefund = true;
  }

  /**
   * Test-only. "Stripe now considers this refund failed" - the state
   * `refund.updated` leaves behind, which the row cannot express.
   */
  seedRefundStatus(refundId: string, status: RefundSummary['status']): void {
    this.refundStatuses.set(refundId, status);
  }

  /** Test-only. The lookup-failure path, which both refund() and release refuse on. */
  failNextRetrieveRefundOnce(): void {
    this.failNextRetrieveRefund = true;
  }

  /** Test-only. A refund can be pending; a transfer cannot. */
  setNextRefundStatus(status: RefundSummary['status']): void {
    this.nextRefundStatus = status;
  }

  /** Test-only. Reset refund status to succeeded. */
  resetRefundStatus(): void {
    this.nextRefundStatus = 'succeeded';
  }

  /**
   * Test-only. A transfer that exists on Stripe's side while our row does not know
   * about it - the stranded-release case the 24-hour key expiry creates.
   */
  seedTransfer(input: {
    id: string;
    destination: string;
    sourceTransaction: string;
    amountCents: number;
  }): void {
    this.transfers.set(`seeded:${input.id}`, {
      id: input.id,
      input: {
        amountCents: input.amountCents,
        destination: input.destination,
        sourceTransaction: input.sourceTransaction,
        transferGroup: 'seeded',
      },
    });
  }
}

let instance: PaymentsGateway | undefined;

/**
 * `STRIPE_DRIVER=stripe` plus a secret key selects the real gateway; anything
 * else selects the fake. Same shape as `otpSender()`, and the same reason: a
 * half-configured environment must degrade to something inert rather than throw
 * at request time.
 *
 * `arePaymentsEnabled()` refuses when the real driver is named without a key, so
 * the fake can never stand in for it in a live configuration.
 */
export function paymentsGateway(): PaymentsGateway {
  instance ??=
    process.env.STRIPE_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY
      ? new StripePaymentsGateway()
      : new FakePaymentsGateway();
  return instance;
}

/** Test-only. The factory memoises, so a test changing STRIPE_DRIVER must clear it. */
export function __resetPaymentsGateway(): void {
  instance = undefined;
}
