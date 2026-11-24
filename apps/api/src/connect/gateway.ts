import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { StripeWebhookEvent } from '../payments/gateway.js';

/**
 * PAYOUT state only.
 *
 * It deliberately carries no identity evidence. A probe on 2026-08-17 established
 * that `additional_verifications` does not exist on this platform account and that
 * a French recipient account's onboarding demands no ID document and no selfie - so
 * this object has nothing truthful to say about who the réparateur is, and a field
 * here claiming otherwise is how « Réparateur vérifié » comes to be fabricated.
 * Stripe Identity answers that question, in its own gateway.
 */
export type ConnectAccountSummary = {
  id: string;
  entityType: 'INDIVIDUAL' | 'COMPANY' | null;
  transfersActive: boolean;
  detailsSubmitted: boolean;
  requirementsOutstanding: boolean;
  rejected: boolean;
  disabledReason: string | null;
  /**
   * Last four characters of the IBAN of the account's bank account, for the DAC7 export (CMP-D4),
   * which has to show a masked IBAN and has nowhere else to read one. Null when Stripe returned no
   * bank account: `external_accounts` comes back only to the platform that is the account's
   * controller, so absence is a state to show as « no IBAN », never to fill in.
   */
  ibanLast4: string | null;
  /**
   * Stripe's `fingerprint` of that bank account: the same value for the same account on every connected
   * account of this platform, so it is what « même IBAN sur plusieurs comptes » (A3) compares. Null on
   * the same condition as `ibanLast4`.
   */
  ibanFingerprint: string | null;
};

export interface ConnectGateway {
  /** Creates the account with NO prefilled PII. See spec §2.3. */
  createAccount(input: { email: string }): Promise<ConnectAccountSummary>;
  retrieveAccount(id: string): Promise<ConnectAccountSummary>;
  /** Single-use and expires in minutes, so it is always minted fresh. */
  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }>;
  /** Single-use AccountSession client secret for in-app embedded onboarding. */
  createAccountSession(accountId: string): Promise<{ clientSecret: string }>;
  /** Throws when the signature does not verify. Never faked. */
  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent;
}

/**
 * Signature verification is pure local crypto, so both drivers share it and the
 * fake verifies for real - faking it would fake the only thing protecting a route
 * that writes payout state.
 *
 * Its own secret, NOT STRIPE_WEBHOOK_SECRET: a Connect endpoint is a separate
 * endpoint on Stripe's side and signs with a separate secret.
 */
function verifyConnect(raw: Buffer, signature: string): StripeWebhookEvent {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not set');

  const event = Stripe.webhooks.constructEvent(raw, signature, secret);
  return {
    id: event.id,
    type: event.type,
    object: event.data.object as unknown as Record<string, unknown>,
  };
}

/**
 * The ONLY place a version-specific Stripe field path appears, which is what makes
 * the v1-versus-v2 question in spec §2.1 a one-file change rather than a rewrite.
 *
 * Exported for unit test.
 */
export function summariseAccount(account: Stripe.Account): ConnectAccountSummary {
  const disabledReason = account.requirements?.disabled_reason ?? null;

  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];

  // `rejected.*` is a terminal decision by Stripe. `requirements.past_due` is not:
  // it clears when the account provides what is asked. Conflating them is what
  // would strip a réparateur's payout access over an expiring document.
  const rejected = disabledReason?.startsWith('rejected.') ?? false;
  const bankAccount = account.external_accounts?.data.find((x) => x.object === 'bank_account');

  return {
    id: account.id,
    // Read from Stripe's own business_type. Null on a fresh account, which is why
    // the DTO and the column both allow null rather than defaulting to INDIVIDUAL -
    // a default here would be a guess presented as Stripe's answer.
    entityType:
      account.business_type === 'company'
        ? 'COMPANY'
        : account.business_type === 'individual'
          ? 'INDIVIDUAL'
          : null,
    // The transfers capability, NOT `payouts_enabled`. Transfers is what P3 needs:
    // whether the platform can move money TO this account. Payouts is whether
    // Stripe can move it onward to the réparateur's bank, which is his problem and
    // not a precondition of ours.
    transfersActive: account.capabilities?.transfers === 'active',
    detailsSubmitted: account.details_submitted ?? false,
    // BOTH lists. A requirement that has aged past its deadline leaves
    // currently_due and appears only in past_due, so reading currently_due alone
    // would report a blocked account as healthy at exactly the wrong moment.
    requirementsOutstanding: currentlyDue.length > 0 || pastDue.length > 0,
    rejected,
    disabledReason,
    ibanLast4: bankAccount?.last4 ?? null,
    ibanFingerprint: bankAccount?.fingerprint ?? null,
  };
}

class StripeConnectGateway implements ConnectGateway {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

  async createAccount(input: { email: string }): Promise<ConnectAccountSummary> {
    const account = await this.stripe.accounts.create({
      // Controller properties, NOT `type`. `type: 'express' | 'custom' |
      // 'standard'` are the deprecated shape and must appear nowhere.
      //
      // Every value here is forced rather than chosen - see spec §2.2 - and every
      // one was verified against a real account on 2026-08-17.
      // losses.payments MUST be 'application': 'stripe' is a blocked combination
      // with separate charges and transfers, and an Express dashboard with
      // Stripe-owned losses is an outright API rejection.
      controller: {
        stripe_dashboard: { type: 'express' },
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'stripe',
      },
      country: 'FR',
      // `transfers` ONLY. Requesting card_payments for an account that never acts
      // as merchant of record buys nothing and lengthens onboarding.
      capabilities: { transfers: { requested: true } },
      // The ONLY value passed about the person, and it is not legal-entity PII.
      // Nothing else is prefilled: Stripe requires French platforms to use account
      // tokens for legal-entity and person data, and hosted onboarding satisfies
      // that only while nothing passes through us. See spec §2.3.
      email: input.email,
      // PINNED rather than inherited, and deliberately at the MINIMUM. A transfer
      // reversal is only possible while the funds are still in the réparateur's
      // Stripe balance, so this window is what P5's clawback depends on -- and an
      // inherited default can change under us.
      //
      // NOT longer, and the reasoning matters: a card chargeback can arrive up to
      // ~120 days after the charge while we release within ~14, so NO delay covers
      // the real risk. That exposure is inherent to losses.payments: application,
      // which P2 established is forced rather than chosen. Lengthening it would
      // cost réparateur cash flow for protection it cannot buy. See the P5 spec §2.4.
      settings: { payouts: { schedule: { interval: 'daily', delay_days: 'minimum' } } },
      //
      // NO `additional_verifications`. It was in the design and it does not exist
      // on this account - parameter_unknown on create, on update, and on an
      // explicit older API version. Do not re-add it hoping. The document and
      // selfie check lives in the Stripe Identity gateway instead.
    });
    return summariseAccount(account);
  }

  async retrieveAccount(id: string): Promise<ConnectAccountSummary> {
    return summariseAccount(await this.stripe.accounts.retrieve(id));
  }

  async createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }> {
    const link = await this.stripe.accountLinks.create({
      account: input.accountId,
      type: 'account_onboarding',
      return_url: input.returnUrl,
      refresh_url: input.refreshUrl,
      // Everything up front. Incremental collection lets a réparateur pass the
      // door and get blocked later, at release, holding a client's money - the
      // precise failure the owner's onboard-at-the-door decision exists to avoid.
      collection_options: { fields: 'eventually_due' },
    });
    return { url: link.url };
  }

  async createAccountSession(accountId: string): Promise<{ clientSecret: string }> {
    const session = await this.stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });
    return { clientSecret: session.client_secret };
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verifyConnect(raw, signature);
  }
}

/**
 * In-memory gateway for development and the integration suite.
 *
 * It creates no Stripe objects and reaches no network. Unlike P1's fake, which
 * models one session with two terminal states, this models the onboarding state
 * machine so a test can walk an account from created to transferable, to
 * restricted, to rejected, one step at a time. Signature verification still goes
 * through the real library.
 *
 * Its initial state copies a REAL fresh account read on 2026-08-17: transfers
 * inactive, nothing submitted, requirements outstanding, and
 * `disabled_reason: 'requirements.past_due'`.
 */
export class FakeConnectGateway implements ConnectGateway {
  private readonly accounts = new Map<string, ConnectAccountSummary>();
  private failNextRetrieve = false;

  createAccount(_input: { email: string }): Promise<ConnectAccountSummary> {
    const id = `acct_fake_${randomUUID()}`;
    const summary: ConnectAccountSummary = {
      id,
      entityType: null,
      transfersActive: false,
      detailsSubmitted: false,
      requirementsOutstanding: true,
      rejected: false,
      disabledReason: 'requirements.past_due',
      ibanLast4: null,
      ibanFingerprint: null,
    };
    this.accounts.set(id, summary);
    return Promise.resolve(summary);
  }

  retrieveAccount(id: string): Promise<ConnectAccountSummary> {
    if (this.failNextRetrieve) {
      this.failNextRetrieve = false;
      return Promise.reject(new Error('Fake gateway failure for test'));
    }
    const found = this.accounts.get(id);
    if (!found) return Promise.reject(new Error(`No such fake account: ${id}`));
    return Promise.resolve(found);
  }

  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string }> {
    // Points at the return URL rather than nowhere, so a developer who opens it
    // lands somewhere real instead of on a browser error. `?`, not `&`: the return
    // URL no longer carries a `?u=` for this to hang off, and relying on one existing
    // is exactly what broke when that unread parameter was removed.
    return Promise.resolve({
      url: `${input.returnUrl}?fake_onboarding=${input.accountId}`,
    });
  }

  createAccountSession(_accountId: string): Promise<{ clientSecret: string }> {
    return Promise.resolve({
      clientSecret: `acc_sess_fake_${randomUUID()}`,
    });
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verifyConnect(raw, signature);
  }

  private patch(id: string, over: Partial<ConnectAccountSummary>): void {
    const found = this.accounts.get(id);
    if (!found) throw new Error(`No such fake account: ${id}`);
    this.accounts.set(id, { ...found, ...over });
  }

  /** Test-only. Onboarding finished and transfers are live. */
  markVerified(id: string): void {
    this.patch(id, {
      entityType: this.accounts.get(id)?.entityType ?? 'INDIVIDUAL',
      transfersActive: true,
      detailsSubmitted: true,
      requirementsOutstanding: false,
      rejected: false,
      disabledReason: null,
    });
  }

  /** Test-only. The réparateur attached a bank account. */
  markIbanLast4(id: string, last4: string): void {
    this.patch(id, { ibanLast4: last4 });
  }

  /** Test-only. The fingerprint Stripe gives that bank account: equal for two accounts means one IBAN. */
  markIbanFingerprint(id: string, fingerprint: string): void {
    this.patch(id, { ibanFingerprint: fingerprint });
  }

  /** Test-only. Stripe's answer about the réparateur's legal shape. */
  markEntityType(id: string, type: 'INDIVIDUAL' | 'COMPANY'): void {
    this.patch(id, { entityType: type });
  }

  /** Test-only. A transient requirement reappearing on a previously good account. */
  markRequirementsDue(id: string): void {
    this.patch(id, {
      requirementsOutstanding: true,
      disabledReason: 'requirements.past_due',
      rejected: false,
    });
  }

  /** Test-only. Stripe's terminal decision. */
  markRejected(id: string, reason = 'rejected.fraud'): void {
    this.patch(id, {
      transfersActive: false,
      requirementsOutstanding: false,
      rejected: true,
      disabledReason: reason,
    });
  }

  /**
   * Test-only. The state where Stripe has decided to reject but the transfers
   * capability has not yet gone inactive. This is the ordering case where
   * `statusOf` must check rejection before VERIFIED.
   */
  markRejectedButStillActive(id: string, reason = 'rejected.fraud'): void {
    this.patch(id, {
      transfersActive: true,
      requirementsOutstanding: false,
      rejected: true,
      disabledReason: reason,
    });
  }

  /**
   * Test-only. Transfers have gone inactive without a rejection - the realistic
   * staleness case, where a requirement deadline passed. Deliberately narrower
   * than markRejected: the release guard reads `transfersActive` and nothing
   * else, so a test for it should set nothing else, or it stops testing the
   * guard and starts testing whatever else the helper happens to change.
   */
  markTransfersInactive(id: string): void {
    this.patch(id, { transfersActive: false });
  }

  /** Test-only. Makes the next retrieveAccount reject, to exercise the webhook's claim release. */
  failNextRetrieveOnce(): void {
    this.failNextRetrieve = true;
  }
}

let instance: ConnectGateway | undefined;

/**
 * Same shape and same reason as `paymentsGateway()`: a half-configured environment
 * must degrade to something inert rather than throw at request time.
 * `isConnectEnabled()` refuses when the real driver is named without a key, so the
 * fake can never stand in for it in a live configuration.
 */
export function connectGateway(): ConnectGateway {
  instance ??=
    process.env.STRIPE_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY
      ? new StripeConnectGateway()
      : new FakeConnectGateway();
  return instance;
}

/** Test-only. The factory memoises, so a test changing STRIPE_DRIVER must clear it. */
export function __resetConnectGateway(): void {
  instance = undefined;
}
