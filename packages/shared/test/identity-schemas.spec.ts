import { describe, expect, it } from 'vitest';
import { identitySessionResponseSchema } from '../src/identity.schemas.js';

describe('identitySessionResponseSchema', () => {
  it('parses valid session response with sessionId, ephemeralKeySecret, and url', () => {
    const raw = {
      sessionId: 'vs_test_123',
      ephemeralKeySecret: 'ek_test_secret_abc',
      url: 'https://verify.stripe.com/start/test',
    };
    const parsed = identitySessionResponseSchema.parse(raw);
    expect(parsed.sessionId).toBe('vs_test_123');
    expect(parsed.ephemeralKeySecret).toBe('ek_test_secret_abc');
    expect(parsed.url).toBe('https://verify.stripe.com/start/test');
  });

  it('rejects payload missing sessionId', () => {
    const raw = {
      ephemeralKeySecret: 'ek_test_secret_abc',
      url: 'https://verify.stripe.com/start/test',
    };
    expect(() => identitySessionResponseSchema.parse(raw)).toThrow();
  });

  it('rejects payload missing ephemeralKeySecret', () => {
    const raw = {
      sessionId: 'vs_test_123',
      url: 'https://verify.stripe.com/start/test',
    };
    expect(() => identitySessionResponseSchema.parse(raw)).toThrow();
  });

  it('rejects payload missing url', () => {
    const raw = {
      sessionId: 'vs_test_123',
      ephemeralKeySecret: 'ek_test_secret_abc',
    };
    expect(() => identitySessionResponseSchema.parse(raw)).toThrow();
  });
});
