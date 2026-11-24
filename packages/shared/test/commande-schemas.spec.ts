import { describe, it, expect } from 'vitest';
import { checkoutSessionResponseSchema } from '../src/commande.schemas.js';

describe('checkoutSessionResponseSchema', () => {
  it('parses valid checkout session response with paymentIntentClientSecret and commandeId', () => {
    const raw = {
      paymentIntentClientSecret: 'pi_123_secret_abc',
      commandeId: 'b7c02b93-9c88-4679-b7b5-2eec305ec712',
    };
    const parsed = checkoutSessionResponseSchema.parse(raw);
    expect(parsed.paymentIntentClientSecret).toBe('pi_123_secret_abc');
    expect(parsed.commandeId).toBe('b7c02b93-9c88-4679-b7b5-2eec305ec712');
  });

  it('tolerates optional url for backward compatibility', () => {
    const raw = {
      paymentIntentClientSecret: 'pi_123_secret_abc',
      commandeId: 'b7c02b93-9c88-4679-b7b5-2eec305ec712',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    };
    const parsed = checkoutSessionResponseSchema.parse(raw);
    expect(parsed.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  });

  it('parses optional publishableKey when provided', () => {
    const raw = {
      paymentIntentClientSecret: 'pi_123_secret_abc',
      commandeId: 'b7c02b93-9c88-4679-b7b5-2eec305ec712',
      publishableKey: 'pk_test_sample123',
    };
    const parsed = checkoutSessionResponseSchema.parse(raw);
    expect(parsed.publishableKey).toBe('pk_test_sample123');
  });

  it('rejects payload missing paymentIntentClientSecret', () => {
    const raw = {
      commandeId: 'b7c02b93-9c88-4679-b7b5-2eec305ec712',
    };
    expect(() => checkoutSessionResponseSchema.parse(raw)).toThrow();
  });
});
