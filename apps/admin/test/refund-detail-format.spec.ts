import { describe, it, expect } from 'vitest';
import { formatCardMethod, formatStripeRefundStatus } from '../lib/refund-detail-format';

describe('formatCardMethod', () => {
  it('capitalises the brand and shows the last 4 digits', () => {
    expect(formatCardMethod({ cardBrand: 'visa', cardLast4: '4242', available: true })).toBe('Visa •••• 4242');
  });

  it('capitalises a mastercard brand', () => {
    expect(formatCardMethod({ cardBrand: 'mastercard', cardLast4: '0004', available: true })).toBe(
      'Mastercard •••• 0004'
    );
  });

  it('shows Indisponible when the gateway read failed', () => {
    expect(formatCardMethod({ cardBrand: 'visa', cardLast4: '4242', available: false })).toBe('Indisponible');
  });

  it('shows Indisponible when the brand is null even if available', () => {
    expect(formatCardMethod({ cardBrand: null, cardLast4: null, available: true })).toBe('Indisponible');
  });
});

describe('formatStripeRefundStatus', () => {
  it('maps succeeded to Effectué', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'succeeded', available: true })).toBe('Effectué');
  });

  it('maps pending to En attente', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'pending', available: true })).toBe('En attente');
  });

  it('maps requires_action to Action requise', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'requires_action', available: true })).toBe('Action requise');
  });

  it('maps failed to Échoué', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'failed', available: true })).toBe('Échoué');
  });

  it('maps canceled to Annulé', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'canceled', available: true })).toBe('Annulé');
  });

  it('shows Indisponible when refundStatus is null', () => {
    expect(formatStripeRefundStatus({ refundStatus: null, available: true })).toBe('Indisponible');
  });

  it('shows Indisponible when the gateway read failed regardless of refundStatus', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'succeeded', available: false })).toBe('Indisponible');
  });

  it('shows Indisponible for an unrecognised status string', () => {
    expect(formatStripeRefundStatus({ refundStatus: 'weird_value', available: true })).toBe('Indisponible');
  });
});
