import { describe, it, expect } from 'vitest';
import { formatDisputeReference } from '../src/commande.schemas.js';

describe('formatDisputeReference', () => {
  it('formats dispute reference with 4 padded digits', () => {
    expect(formatDisputeReference(1)).toBe('#LIT-0001');
    expect(formatDisputeReference(6)).toBe('#LIT-0006');
    expect(formatDisputeReference(42)).toBe('#LIT-0042');
    expect(formatDisputeReference(1234)).toBe('#LIT-1234');
  });
});
