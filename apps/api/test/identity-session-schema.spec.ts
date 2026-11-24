import { describe, expect, it } from 'vitest';
import { identitySessionRequestSchema } from '@revime/shared';

describe('identitySessionRequestSchema', () => {
  it('defaults an EMPTY body to the selfie variant - this is build 6 on the client\'s phone', () => {
    expect(identitySessionRequestSchema.parse({})).toEqual({ variant: 'DOCUMENT_AND_SELFIE' });
  });

  /**
   * 🛑 THE REGRESSION THIS FILE EXISTS FOR. An earlier draft used `.default({})`, which in zod
   * 4.4.3 returns the literal `{}` without applying the inner default - so `variant` was
   * `undefined` at runtime while typed non-optional. Asserting the VALUE, not just that parsing
   * succeeded, is what catches it.
   */
  it('defaults an ABSENT body to the selfie variant, with the field actually present', () => {
    const parsed = identitySessionRequestSchema.parse(undefined);
    expect(parsed.variant).toBe('DOCUMENT_AND_SELFIE');
    expect(typeof parsed.variant).toBe('string');
  });

  it('accepts an explicit document-only request', () => {
    expect(identitySessionRequestSchema.parse({ variant: 'DOCUMENT_ONLY' }))
      .toEqual({ variant: 'DOCUMENT_ONLY' });
  });

  it('refuses an unknown variant rather than falling back', () => {
    expect(identitySessionRequestSchema.safeParse({ variant: 'nope' }).success).toBe(false);
  });
});
