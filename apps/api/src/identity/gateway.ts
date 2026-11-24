import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { StripeWebhookEvent } from '../payments/gateway.js';
import type { IdentityVariant, RedactionStatus } from '@revime/shared';

export type IdentitySessionSummary = {
  id: string;
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  /** The hosted verify.stripe.com URL. Null once the session is no longer startable. */
  url: string | null;
  lastErrorCode: string | null;
  /** Stripe's own redaction progress. Null when nothing has been redacted. */
  redactionStatus: RedactionStatus | null;
  ephemeralKeySecret?: string;
};

export interface IdentityGateway {
  /**
   * 🛑 `variant` IS REQUIRED, NOT OPTIONAL, AND THAT IS THE CHEAPEST REAL GATE AVAILABLE HERE.
   * An optional variant lets a new call site compile while silently minting a selfie session -
   * the same argument `apps/mobile/AGENTS.md` makes for `Initials`'s `uri` prop, applied to a
   * parameter.
   */
  createSession(input: {
    userId: string;
    returnUrl: string;
    variant: IdentityVariant;
  }): Promise<IdentitySessionSummary>;
  retrieveSession(id: string): Promise<IdentitySessionSummary>;
  createEphemeralKey(sessionId: string): Promise<string>;
  /**
   * Removes the collected information from Stripe. **Legal ONLY from `requires_input` or
   * `verified`** - the SDK's own doc comment enumerates that set and Stripe's prose docs do not,
   * so a `canceled` session cannot be redacted at all. Callers must check first;
   * `redact-identity.ts` is the only caller and does.
   */
  redactSession(id: string): Promise<IdentitySessionSummary>;
  /** Legal at any point before `processing` or `verified`. Used only on a variant change. */
  cancelSession(id: string): Promise<IdentitySessionSummary>;
  /** Throws when the signature does not verify. Never faked. */
  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent;
}

/**
 * Its OWN secret, and its own endpoint.
 *
 * An Identity session belongs to the platform account, so its events cannot arrive
 * on the Connect endpoint. The tempting alternative - adding cases to P1's
 * /stripe/webhook - is worse: that route carries real card charges, and putting
 * verification-level logic on the money path lets an identity bug fail a payment
 * webhook. Stripe allows any number of platform endpoints, each with its own
 * subscription and secret.
 */
function verifyIdentity(raw: Buffer, signature: string): StripeWebhookEvent {
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_IDENTITY_WEBHOOK_SECRET is not set');

  const event = Stripe.webhooks.constructEvent(raw, signature, secret);
  return {
    id: event.id,
    type: event.type,
    object: event.data.object as unknown as Record<string, unknown>,
  };
}

/**
 * The SECOND of two status translations in this file, and it deliberately does NOT behave like
 * `summariseSession`'s.
 *
 * 🛑 IT RETURNS NULL ON AN UNKNOWN VALUE. `summariseSession` throws, because session status
 * decides a GRANT: a value nobody has read must defer the event so Stripe retries. A redaction
 * status decides only what a screen says, so throwing would make Stripe retry for three days
 * over something that grants nothing. Stripe's `Redaction.Status` union ends in `(string & {})`,
 * so unknown values are the vendor's own expectation rather than a remote possibility.
 *
 * Do not "fix" the inconsistency. It is the point.
 */
function summariseRedaction(
  session: Stripe.Identity.VerificationSession,
): RedactionStatus | null {
  const raw = session.redaction?.status;
  if (raw === undefined || raw === null) return null;
  switch (raw) {
    case 'processing':
      return 'PROCESSING';
    case 'validated':
      return 'VALIDATED';
    case 'redacted':
      return 'REDACTED';
    default:
      console.warn(`[identity] unrecognised redaction status, treated as null: ${String(raw)}`);
      return null;
  }
}

/**
 * The one place Stripe's status vocabulary is translated. Exported for unit test.
 *
 * It THROWS on an unrecognised status rather than defaulting. A default of
 * REQUIRES_INPUT would silently treat a future Stripe status as unfinished; a
 * default of VERIFIED would grant a verification level on a status nobody has read.
 * The webhook releases its event claim on a throw, so Stripe retries - the event is
 * deferred, not lost.
 */
export function summariseSession(
  session: Stripe.Identity.VerificationSession,
): IdentitySessionSummary {
  const status = ((): IdentitySessionSummary['status'] => {
    switch (session.status) {
      case 'requires_input':
        return 'REQUIRES_INPUT';
      case 'processing':
        return 'PROCESSING';
      case 'verified':
        return 'VERIFIED';
      case 'canceled':
        return 'CANCELED';
      default:
        throw new Error(`Unrecognised Identity session status: ${String(session.status)}`);
    }
  })();

  return {
    id: session.id,
    status,
    url: session.url ?? null,
    lastErrorCode: session.last_error?.code ?? null,
    redactionStatus: summariseRedaction(session),
  };
}

class StripeIdentityGateway implements IdentityGateway {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

  async createSession(input: {
    userId: string;
    returnUrl: string;
    variant: IdentityVariant;
  }): Promise<IdentitySessionSummary> {
    const session = await this.stripe.identity.verificationSessions.create({
      // `document`, not `id_number`: the client asked for « pièce d'identité +
      // vérification du visage », which is a document check with a selfie.
      type: 'document',
      options: {
        document: {
          // CF2-09: Strictly disabled "Verify without facial recognition".
          require_matching_selfie: true,
          // 🛑 ON BOTH VARIANTS, DELIBERATELY. This forces a live capture rather than accepting
          // an uploaded photo of a photo, and it is a property of the DOCUMENT capture, not the
          // face. Dropping the selfie must not quietly also drop document liveness.
          require_live_capture: true,
        },
      },
      // 🛑 ERASED BY A REDACTION. Stripe's own SDK comment says « The metadata field will also be
      // erased. » So this is belt-and-braces only until an erasure happens, after which
      // `syncSession` has nothing but `stripeSessionId` to find the row by - which is what it
      // uses, so the webhook still works. Do not add a consumer that depends on this surviving.
      metadata: { userId: input.userId },
      return_url: input.returnUrl,
    });
    let ephemeralKeySecret = '';
    try {
      const ek = await this.stripe.ephemeralKeys.create(
        { verification_session: session.id },
        { apiVersion: '2026-07-29.dahlia' },
      );
      ephemeralKeySecret = ek.secret ?? '';
    } catch (e: unknown) {
      console.warn(
        `[identity] could not create ephemeral key for session ${session.id} (Identity Mobile SDK may not be enabled on Stripe account, hosted web handoff will be used):`,
        e instanceof Error ? e.message : e,
      );
    }
    return {
      ...summariseSession(session),
      ephemeralKeySecret,
    };
  }

  async createEphemeralKey(sessionId: string): Promise<string> {
    try {
      const ek = await this.stripe.ephemeralKeys.create(
        { verification_session: sessionId },
        { apiVersion: '2026-07-29.dahlia' },
      );
      return ek.secret ?? '';
    } catch (e: unknown) {
      console.warn(
        `[identity] could not create ephemeral key for session ${sessionId} (Identity Mobile SDK may not be enabled on Stripe account):`,
        e instanceof Error ? e.message : e,
      );
      return '';
    }
  }

  async redactSession(id: string): Promise<IdentitySessionSummary> {
    return summariseSession(await this.stripe.identity.verificationSessions.redact(id));
  }

  async cancelSession(id: string): Promise<IdentitySessionSummary> {
    return summariseSession(await this.stripe.identity.verificationSessions.cancel(id));
  }

  async retrieveSession(id: string): Promise<IdentitySessionSummary> {
    return summariseSession(await this.stripe.identity.verificationSessions.retrieve(id));
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verifyIdentity(raw, signature);
  }
}

/**
 * In-memory gateway for development and the integration suite. Creates no Stripe
 * objects and reaches no network; signature verification still goes through the
 * real library.
 */
export class FakeIdentityGateway implements IdentityGateway {
  private readonly sessions = new Map<string, IdentitySessionSummary>();
  private failNextRetrieve = false;

  /**
   * 🛑 RECORDED CALLS, ADDED 2026-09-02 BECAUSE WITHOUT THEM THE VARIANT TESTS ASSERT NOTHING.
   * The property that matters is what STRIPE was handed, not what our own local variable held.
   */
  readonly createCalls: { userId: string; returnUrl: string; variant: IdentityVariant }[] = [];
  readonly redactCalls: string[] = [];
  readonly cancelCalls: string[] = [];

  createSession(input: {
    userId: string;
    returnUrl: string;
    variant: IdentityVariant;
  }): Promise<IdentitySessionSummary> {
    this.createCalls.push({ ...input });
    const id = `vs_fake_${randomUUID()}`;
    const summary: IdentitySessionSummary = {
      id,
      status: 'REQUIRES_INPUT',
      // Points at the return URL rather than nowhere, so a developer who opens it
      // lands somewhere real instead of on a browser error. `?`, not `&`: the return
      // URL carries no query string, so an `&` would produce a malformed URL.
      url: `${input.returnUrl}?fake_identity=${id}`,
      lastErrorCode: null,
      redactionStatus: null,
      ephemeralKeySecret: `ek_fake_secret_${randomUUID()}`,
    };
    this.sessions.set(id, summary);
    return Promise.resolve(summary);
  }

  createEphemeralKey(_sessionId: string): Promise<string> {
    return Promise.resolve(`ek_fake_secret_${randomUUID()}`);
  }

  redactSession(id: string): Promise<IdentitySessionSummary> {
    this.redactCalls.push(id);
    const found = this.sessions.get(id);
    if (!found) return Promise.reject(new Error(`No such fake session: ${id}`));
    // Mirrors Stripe: a `requires_input` session is CANCELLED by the redaction, and redaction
    // begins as `processing` rather than completing synchronously (up to four days).
    const next: IdentitySessionSummary = {
      ...found,
      status: found.status === 'REQUIRES_INPUT' ? 'CANCELED' : found.status,
      url: null,
      redactionStatus: 'PROCESSING',
    };
    this.sessions.set(id, next);
    return Promise.resolve(next);
  }

  cancelSession(id: string): Promise<IdentitySessionSummary> {
    this.cancelCalls.push(id);
    const found = this.sessions.get(id);
    if (!found) return Promise.reject(new Error(`No such fake session: ${id}`));
    const next: IdentitySessionSummary = { ...found, status: 'CANCELED', url: null };
    this.sessions.set(id, next);
    return Promise.resolve(next);
  }

  retrieveSession(id: string): Promise<IdentitySessionSummary> {
    if (this.failNextRetrieve) {
      // Reset AS IT FIRES, not after the test. The factory memoises one instance for
      // the whole file, so a flag left standing would poison every later test in it.
      this.failNextRetrieve = false;
      return Promise.reject(new Error('Fake gateway failure for test'));
    }
    const found = this.sessions.get(id);
    if (!found) return Promise.reject(new Error(`No such fake session: ${id}`));
    return Promise.resolve(found);
  }

  constructEvent(raw: Buffer, signature: string): StripeWebhookEvent {
    return verifyIdentity(raw, signature);
  }

  private patch(id: string, over: Partial<IdentitySessionSummary>): void {
    const found = this.sessions.get(id);
    if (!found) throw new Error(`No such fake session: ${id}`);
    this.sessions.set(id, { ...found, ...over });
  }

  /** Test-only. */
  markProcessing(id: string): void {
    this.patch(id, { status: 'PROCESSING', url: null, lastErrorCode: null });
  }

  /** Test-only. */
  markVerified(id: string): void {
    this.patch(id, { status: 'VERIFIED', url: null, lastErrorCode: null });
  }

  /** Test-only. A failed check that the user may retry. */
  markRequiresInput(id: string, code = 'document_unverified_other'): void {
    this.patch(id, { status: 'REQUIRES_INPUT', lastErrorCode: code });
  }

  /** Test-only. */
  markCanceled(id: string): void {
    this.patch(id, { status: 'CANCELED', url: null });
  }

  /**
   * Test-only, and PUBLIC on purpose.
   *
   * A test that needs the fake to hold a session it did not create through `createSession` -
   * because the row under test points at some `vs_…` id - must be able to say so. The
   * alternative is reaching into the private `sessions` map from a spec, which couples the test
   * to the fake's internals and is how a test comes to pass for the wrong reason.
   */
  seed(summary: IdentitySessionSummary): void {
    this.sessions.set(summary.id, summary);
  }

  /**
   * Test-only. Makes the next retrieveSession reject, to exercise the webhook's
   * claim release. Mirrors `FakeConnectGateway.failNextRetrieveOnce()`, including
   * that the flag resets as it fires.
   */
  failNextRetrieveOnce(): void {
    this.failNextRetrieve = true;
  }
}

let instance: IdentityGateway | undefined;

export function identityGateway(): IdentityGateway {
  instance ??=
    process.env.STRIPE_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY
      ? new StripeIdentityGateway()
      : new FakeIdentityGateway();
  return instance;
}

/** Test-only. The factory memoises, so a test changing STRIPE_DRIVER must clear it. */
export function __resetIdentityGateway(): void {
  instance = undefined;
}
