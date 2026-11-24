import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { FakeConnectGateway, summariseAccount } from '../src/connect/gateway.js';

/**
 * Minimal Stripe.Account shapes. Cast rather than constructed: the real type has
 * ~60 required fields and the mapping reads five of them, so a full fixture would
 * hide which five.
 *
 * Every shape below is modelled on a REAL account read from the API on 2026-08-17,
 * not invented - including the detail that `business_type` is null and the
 * `individual` and `company` keys are absent entirely until it is set.
 */
const account = (over: Record<string, unknown>): Stripe.Account =>
  ({ id: 'acct_1', object: 'account', ...over }) as unknown as Stripe.Account;

describe('summariseAccount', () => {
  it('reports a fresh account as unsubmitted with requirements outstanding', () => {
    const s = summariseAccount(
      account({
        business_type: null,
        details_submitted: false,
        capabilities: { transfers: 'inactive' },
        requirements: {
          currently_due: ['business_type', 'external_account'],
          past_due: ['business_type', 'external_account'],
          disabled_reason: 'requirements.past_due',
        },
      }),
    );
    expect(s.detailsSubmitted).toBe(false);
    expect(s.transfersActive).toBe(false);
    expect(s.requirementsOutstanding).toBe(true);
    expect(s.rejected).toBe(false);
    expect(s.entityType).toBeNull();
  });

  it('reports a completed individual account as transferable', () => {
    const s = summariseAccount(
      account({
        business_type: 'individual',
        details_submitted: true,
        capabilities: { transfers: 'active' },
        requirements: { currently_due: [], past_due: [], disabled_reason: null },
      }),
    );
    expect(s.entityType).toBe('INDIVIDUAL');
    expect(s.transfersActive).toBe(true);
    expect(s.detailsSubmitted).toBe(true);
    expect(s.requirementsOutstanding).toBe(false);
    expect(s.rejected).toBe(false);
  });

  it('maps a company account to COMPANY', () => {
    const s = summariseAccount(
      account({
        business_type: 'company',
        details_submitted: true,
        capabilities: { transfers: 'active' },
        requirements: { currently_due: [], past_due: [], disabled_reason: null },
      }),
    );
    expect(s.entityType).toBe('COMPANY');
  });

  it('counts a past_due requirement even when currently_due is empty', () => {
    const s = summariseAccount(
      account({
        business_type: 'individual',
        details_submitted: true,
        capabilities: { transfers: 'active' },
        requirements: {
          currently_due: [],
          past_due: ['individual.verification.document'],
          disabled_reason: 'requirements.past_due',
        },
      }),
    );
    expect(s.requirementsOutstanding).toBe(true);
  });

  it('reports a rejected account with its reason', () => {
    const s = summariseAccount(
      account({
        business_type: 'individual',
        details_submitted: true,
        capabilities: { transfers: 'inactive' },
        requirements: { currently_due: [], past_due: [], disabled_reason: 'rejected.fraud' },
      }),
    );
    expect(s.rejected).toBe(true);
    expect(s.disabledReason).toBe('rejected.fraud');
  });

  it('does not call a merely-restricted account rejected', () => {
    const s = summariseAccount(
      account({
        business_type: 'individual',
        details_submitted: true,
        capabilities: { transfers: 'inactive' },
        requirements: {
          currently_due: ['individual.verification.document'],
          past_due: [],
          disabled_reason: 'requirements.past_due',
        },
      }),
    );
    expect(s.rejected).toBe(false);
    expect(s.requirementsOutstanding).toBe(true);
  });

  it('survives an account with no requirements hash at all', () => {
    const s = summariseAccount(
      account({ business_type: 'individual', details_submitted: true, capabilities: {} }),
    );
    expect(s.requirementsOutstanding).toBe(false);
    expect(s.rejected).toBe(false);
    expect(s.disabledReason).toBeNull();
    expect(s.transfersActive).toBe(false);
  });
});

describe('summariseAccount: the IBAN of the payout account (CMP-D4)', () => {
  const withExternal = (data: unknown[] | undefined) =>
    summariseAccount(account({ business_type: 'individual', external_accounts: data ? { data } : undefined }));

  it('reads the last four of the bank account', () => {
    expect(withExternal([{ object: 'bank_account', last4: '0412', country: 'FR' }]).ibanLast4).toBe('0412');
  });

  it("reads Stripe's fingerprint of the bank account, the value the duplicate-IBAN alert compares (RU-29)", () => {
    expect(
      withExternal([{ object: 'bank_account', last4: '0412', fingerprint: 'fp_abc' }]).ibanFingerprint,
    ).toBe('fp_abc');
    expect(withExternal([{ object: 'bank_account', last4: '0412', fingerprint: null }]).ibanFingerprint).toBeNull();
    expect(withExternal([{ object: 'card', last4: '4242', fingerprint: 'fp_card' }]).ibanFingerprint).toBeNull();
    expect(withExternal(undefined).ibanFingerprint).toBeNull();
  });

  it('takes the bank account, not a debit card listed before it', () => {
    expect(
      withExternal([
        { object: 'card', last4: '4242' },
        { object: 'bank_account', last4: '0412' },
      ]).ibanLast4,
    ).toBe('0412');
  });

  it('is null with only a card, or when Stripe returned no external accounts at all', () => {
    expect(withExternal([{ object: 'card', last4: '4242' }]).ibanLast4).toBeNull();
    expect(withExternal([]).ibanLast4).toBeNull();
    expect(withExternal(undefined).ibanLast4).toBeNull();
  });
});

describe('FakeConnectGateway', () => {
  it('creates an account session in FakeConnectGateway', async () => {
    const gateway = new FakeConnectGateway();
    const session = await gateway.createAccountSession('acct_fake_123');
    expect(session.clientSecret).toMatch(/^acc_sess_fake_/);
  });
});
