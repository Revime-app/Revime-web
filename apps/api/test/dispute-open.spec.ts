import { describe, expect, it } from 'vitest';
import type { DisputeStatus } from '../src/generated/prisma/client.js';
import { isDisputeOpen } from '../src/commandes/dispute-open.js';

describe('isDisputeOpen', () => {
  it('is false when there is no dispute', () => {
    expect(isDisputeOpen(null)).toBe(false);
    expect(isDisputeOpen(undefined)).toBe(false);
  });

  it.each(['OPEN', 'IN_REVIEW'] as const)('is true for a %s dispute', (status: DisputeStatus) => {
    expect(isDisputeOpen({ status })).toBe(true);
  });

  it.each(['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'] as const)(
    'is false for a %s dispute',
    (status: DisputeStatus) => {
      expect(isDisputeOpen({ status })).toBe(false);
    },
  );
});
