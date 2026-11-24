import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { FakeIdentityGateway, summariseSession } from '../src/identity/gateway.js';

const session = (over: Record<string, unknown>): Stripe.Identity.VerificationSession =>
  ({ id: 'vs_1', object: 'identity.verification_session', ...over }) as unknown as Stripe.Identity.VerificationSession;

describe('summariseSession', () => {
  it('maps a fresh session to REQUIRES_INPUT and keeps its hosted URL', () => {
    const s = summariseSession(
      session({ status: 'requires_input', url: 'https://verify.stripe.com/start/abc', last_error: null }),
    );
    expect(s.status).toBe('REQUIRES_INPUT');
    expect(s.url).toBe('https://verify.stripe.com/start/abc');
    expect(s.lastErrorCode).toBeNull();
  });

  it('maps processing', () => {
    expect(summariseSession(session({ status: 'processing', url: null })).status).toBe('PROCESSING');
  });

  it('maps verified', () => {
    expect(summariseSession(session({ status: 'verified', url: null })).status).toBe('VERIFIED');
  });

  it('maps canceled', () => {
    expect(summariseSession(session({ status: 'canceled', url: null })).status).toBe('CANCELED');
  });

  it('carries the error code so a French message can be chosen for it', () => {
    const s = summariseSession(
      session({
        status: 'requires_input',
        url: 'https://verify.stripe.com/start/abc',
        last_error: { code: 'document_unverified_other', reason: 'ignored' },
      }),
    );
    expect(s.lastErrorCode).toBe('document_unverified_other');
  });

  it('does not invent a status for an unknown value - it refuses', () => {
    expect(() => summariseSession(session({ status: 'something_new', url: null }))).toThrow();
  });
});

describe('summariseSession - redaction', () => {
  it('reports null when nothing has been redacted', () => {
    expect(summariseSession(session({ status: 'verified', url: null, redaction: null })).redactionStatus)
      .toBeNull();
  });

  it('maps all THREE of Stripe\'s known redaction statuses', () => {
    const of = (status: string) =>
      summariseSession(session({ status: 'verified', url: null, redaction: { status } }))
        .redactionStatus;
    expect(of('processing')).toBe('PROCESSING');
    expect(of('validated')).toBe('VALIDATED');
    expect(of('redacted')).toBe('REDACTED');
  });

  /**
   * 🛑 THE ASYMMETRY IS THE DESIGN, AND BOTH DIRECTIONS ARE ASSERTED HERE.
   *
   * Session status THROWS on an unknown value, because it decides a GRANT and a value nobody has
   * read must defer the event so Stripe retries. Redaction status returns null, because it
   * decides only what a screen says - throwing there would make Stripe retry for three days over
   * something that grants nothing. Stripe's own union ends in `(string & {})`, so unknown values
   * are anticipated by the vendor.
   */
  it('does NOT throw on an unrecognised redaction status - it degrades to null', () => {
    expect(
      summariseSession(session({ status: 'verified', url: null, redaction: { status: 'something_new' } }))
        .redactionStatus,
    ).toBeNull();
  });

  it('and the SESSION status still throws, so the two are not accidentally the same rule', () => {
    expect(() => summariseSession(session({ status: 'something_new', url: null }))).toThrow();
  });
});

describe('FakeIdentityGateway - Ephemeral Keys', () => {
  it('includes ephemeralKeySecret when creating a session', async () => {
    const gateway = new FakeIdentityGateway();
    const session = await gateway.createSession({
      userId: 'u1',
      returnUrl: 'https://example.com/return',
      variant: 'DOCUMENT_AND_SELFIE',
    });
    expect(session.ephemeralKeySecret).toBeDefined();
    expect(session.ephemeralKeySecret).toMatch(/^ek_fake_secret_/);
    expect(session.id).toMatch(/^vs_fake_/);
  });

  it('generates a fresh ephemeral key secret via createEphemeralKey', async () => {
    const gateway = new FakeIdentityGateway();
    const key = await gateway.createEphemeralKey('vs_fake_123');
    expect(key).toBeDefined();
    expect(key).toMatch(/^ek_fake_secret_/);
  });
});
