import { describe, expect, it } from 'vitest';
import {
  createCheckoutSchema,
  executionDelayPreferenceSchema,
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
  withdrawalWaiverSchema,
} from '../src/commande.schemas.js';

describe('withdrawal-compliance shared schemas', () => {
  it('exports the exact legal withdrawal text constant', () => {
    expect(LEGAL_WITHDRAWAL_WAIVER_TEXT).toBe(
      'Je veux que la réparation commence tout de suite, et je comprends que je ne pourrai plus me rétracter une fois la réparation terminée.',
    );
  });

  it('validates executionDelayPreferenceSchema values', () => {
    expect(executionDelayPreferenceSchema.parse('IMMEDIATE')).toBe('IMMEDIATE');
    expect(executionDelayPreferenceSchema.parse('WAIT_14_DAYS')).toBe('WAIT_14_DAYS');
    expect(() => executionDelayPreferenceSchema.parse('INVALID')).toThrow();
  });

  it('validates a compliant withdrawal waiver', () => {
    const valid = {
      accepted: true,
      acceptedAt: new Date().toISOString(),
      acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
    };
    expect(withdrawalWaiverSchema.parse(valid)).toEqual(valid);
  });

  it('rejects tampered or altered waiver text', () => {
    const altered = {
      accepted: true,
      acceptedAt: new Date().toISOString(),
      acceptedText: 'Je veux que la réparation commence.',
    };
    expect(() => withdrawalWaiverSchema.parse(altered)).toThrow();
  });

  it('rejects invalid acceptedAt timestamps', () => {
    const invalidDate = {
      accepted: true,
      acceptedAt: 'not-a-date',
      acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
    };
    expect(() => withdrawalWaiverSchema.parse(invalidDate)).toThrow();
  });

  it('validates createCheckoutSchema with immediate start and waiver', () => {
    const parsed = createCheckoutSchema.parse({
      delivery: 'HOME',
      delayPreference: 'IMMEDIATE',
      withdrawalWaiver: {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      },
    });
    expect(parsed.delayPreference).toBe('IMMEDIATE');
    expect(parsed.withdrawalWaiver?.accepted).toBe(true);
  });

  it('validates createCheckoutSchema with WAIT_14_DAYS without waiver', () => {
    const parsed = createCheckoutSchema.parse({
      delivery: 'WORKSHOP',
      delayPreference: 'WAIT_14_DAYS',
      withdrawalWaiver: null,
    });
    expect(parsed.delayPreference).toBe('WAIT_14_DAYS');
    expect(parsed.withdrawalWaiver).toBeNull();
  });

  it('re-exports withdrawal compliance schemas and constants from index', async () => {
    const index = await import('../src/index.js');
    expect(index.LEGAL_WITHDRAWAL_WAIVER_TEXT).toBe(LEGAL_WITHDRAWAL_WAIVER_TEXT);
    expect(index.executionDelayPreferenceSchema).toBe(executionDelayPreferenceSchema);
    expect(index.withdrawalWaiverSchema).toBe(withdrawalWaiverSchema);
    expect(index.createCheckoutSchema).toBe(createCheckoutSchema);
  });
});
