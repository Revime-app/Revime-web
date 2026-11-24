import { describe, expect, it } from 'vitest';
import { auth } from '../src/auth/auth.js';

describe('Better Auth rate limiting configuration (S1)', () => {
  it('raises the baseline and the /get-session rule above the 100-per-10-s default', () => {
    const rateLimit = auth.options.rateLimit;
    expect(rateLimit).toEqual({
      window: 60,
      max: 600,
      customRules: { '/get-session': { window: 60, max: 1200 } },
    });
  });
});
