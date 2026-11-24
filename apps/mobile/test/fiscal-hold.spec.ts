import { describe, expect, it } from 'vitest';
import { isFiscalPayoutHold, payoutHoldView } from '../src/lib/fiscal-hold.js';
import { destinationFor } from '../src/lib/notification-destination.js';

/**
 * V8 B2. Any order the client validated whose transfer Revime is holding (no « Virements » yet, or
 * fiscal info missing) shows the réparateur what is waiting and where to finish. The fiscal case keeps
 * its precise form (CMP-D3); every other hold goes to the setup page.
 */
describe('payoutHoldView (V8 B2)', () => {
  const order = { step: 'RELEASED' as const, status: 'PAID' as const, hasStripeTransfer: false, payoutCents: 8900 };
  const declared = { kind: 'INDIVIDUAL' as const, fiscalCompleted: true };

  // Amended 2026-11-18, V8 `ISS8-020` (d): the fiscal form only when « Virements » is done (third argument);
  // with payouts missing or unknown it is the setup page, see `v8-iss8-020-wording.spec.ts`.
  it('keeps the fiscal form for an individual who has not declared, once « Virements » is done', () => {
    expect(payoutHoldView(order, { kind: 'INDIVIDUAL', fiscalCompleted: false }, true)).toMatchObject({
      cta: 'Compléter mes informations fiscales',
      route: '/fiscalite',
    });
  });

  it('sends anyone else whose payout is held to the setup page, in the client words', () => {
    for (const repairer of [declared, { kind: 'PRO' as const, fiscalCompleted: false }]) {
      expect(payoutHoldView(order, repairer, true)).toEqual({
        title: 'Paiement en attente : 89 €',
        body: 'Votre paiement vous attend : terminez votre configuration pour le recevoir.',
        cta: 'Terminer ma configuration',
        route: '/statut-verification',
      });
    }
  });

  it('shows nothing once the money left, before validation, on a non-paid row, or in a dispute', () => {
    expect(payoutHoldView({ ...order, hasStripeTransfer: true }, declared, true)).toBeNull();
    expect(payoutHoldView({ ...order, step: 'AWAITING_VALIDATION' }, declared, true)).toBeNull();
    expect(payoutHoldView({ ...order, status: 'REFUNDED' }, declared, true)).toBeNull();
    expect(payoutHoldView({ ...order, disputeOpen: true }, declared, true)).toBeNull();
  });

  it('shows nothing against an API that does not send hasStripeTransfer', () => {
    expect(payoutHoldView({ step: 'RELEASED', status: 'PAID', payoutCents: 8900 }, declared, true)).toBeNull();
  });
});

describe('destinationFor (PAYOUT_WAITING, V8 B2)', () => {
  it('opens the setup page, which lists both « Virements » and « Informations fiscales »', () => {
    expect(
      destinationFor({ type: 'PAYOUT_WAITING', conversationId: null, demandeId: null, commandeId: 'c1' }),
    ).toBe('/statut-verification');
  });
});

const held = { step: 'RELEASED' as const, hasStripeTransfer: false };
const individual = { kind: 'INDIVIDUAL' as const, fiscalCompleted: false };

describe('isFiscalPayoutHold (CMP-D3)', () => {
  it('is true for a released order with no transfer and an individual who has not declared', () => {
    expect(isFiscalPayoutHold(held, individual)).toBe(true);
  });

  it('is false once the transfer left, the declaration is complete, or the step is not RELEASED', () => {
    expect(isFiscalPayoutHold({ ...held, hasStripeTransfer: true }, individual)).toBe(false);
    expect(isFiscalPayoutHold(held, { ...individual, fiscalCompleted: true })).toBe(false);
    expect(isFiscalPayoutHold({ ...held, step: 'AWAITING_VALIDATION' }, individual)).toBe(false);
  });

  it('is false for a PRO: his step is the company check, not the personal form', () => {
    expect(isFiscalPayoutHold(held, { kind: 'PRO', fiscalCompleted: false })).toBe(false);
  });

  it('is false against an API that predates the fields: a stale server must not show a payment hold', () => {
    // `!undefined` is true, so the first version of this check showed the amber « paiement en
    // attente » card on every released order of every individual réparateur.
    expect(isFiscalPayoutHold({ step: 'RELEASED' }, individual)).toBe(false);
    expect(isFiscalPayoutHold(held, { kind: 'INDIVIDUAL' })).toBe(false);
  });

  it('is false without a réparateur profile', () => {
    expect(isFiscalPayoutHold(held, null)).toBe(false);
    expect(isFiscalPayoutHold(held, undefined)).toBe(false);
  });
});

describe('destinationFor (FISCAL_DECLARATION_REQUIRED)', () => {
  it('opens the fiscal form: the reminder exists to send the réparateur there', () => {
    expect(
      destinationFor({ type: 'FISCAL_DECLARATION_REQUIRED', conversationId: null, demandeId: null, commandeId: null }),
    ).toBe('/fiscalite');
  });
});

describe('destinationFor (DAC7_ANNUAL_RECAP_SENT)', () => {
  it('opens the fiscal information the recap is drawn from, instead of going nowhere', () => {
    expect(
      destinationFor({ type: 'DAC7_ANNUAL_RECAP_SENT', conversationId: null, demandeId: null, commandeId: null }),
    ).toBe('/fiscalite');
  });
});
