import { describe, expect, it } from 'vitest';
import { checkoutSessionResponseSchema } from '../src/commande.schemas.js';

describe('checkoutSessionResponseSchema', () => {
  it('validates a response without isTestMode', () => {
    const valid = {
      paymentIntentClientSecret: 'pi_test_123_secret_456',
      commandeId: '2b50a0f3-640e-4ced-8133-364b1ee99212',
    };
    const parsed = checkoutSessionResponseSchema.parse(valid);
    expect(parsed.paymentIntentClientSecret).toBe(valid.paymentIntentClientSecret);
    expect(parsed.commandeId).toBe(valid.commandeId);
    expect(parsed.isTestMode).toBeUndefined();
  });

  it('validates a response with isTestMode true', () => {
    const valid = {
      paymentIntentClientSecret: 'pi_test_123_secret_456',
      commandeId: '2b50a0f3-640e-4ced-8133-364b1ee99212',
      publishableKey: 'pk_test_123',
      isTestMode: true,
    };
    const parsed = checkoutSessionResponseSchema.parse(valid);
    expect(parsed.isTestMode).toBe(true);
    expect(parsed.publishableKey).toBe('pk_test_123');
  });

  it('validates a response with isTestMode false', () => {
    const valid = {
      paymentIntentClientSecret: 'pi_live_123_secret_456',
      commandeId: '2b50a0f3-640e-4ced-8133-364b1ee99212',
      publishableKey: 'pk_live_123',
      isTestMode: false,
    };
    const parsed = checkoutSessionResponseSchema.parse(valid);
    expect(parsed.isTestMode).toBe(false);
  });
});
