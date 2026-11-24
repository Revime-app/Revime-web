import { describe, expect, it } from 'vitest';
import { attentionAmount, attentionStatusLabel, attentionStepLabel } from '../lib/attention-format';

/** « Commandes à surveiller » showed the raw enum values (PAID, AWAITING_VALIDATION) and « 105.50 € ». */
describe('attention-format', () => {
  it('labels the commande status in French', () => {
    expect(attentionStatusLabel('PAID')).toBe('Payé');
    expect(attentionStatusLabel('PENDING_PAYMENT')).toBe('En attente de paiement');
    expect(attentionStatusLabel('REFUNDED')).toBe('Remboursée');
  });

  it('falls back to the raw value for a status this bundle does not know', () => {
    expect(attentionStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('labels the step with the shared wording, « — » when absent', () => {
    expect(attentionStepLabel('AWAITING_VALIDATION')).toBe('Validation client');
    expect(attentionStepLabel(null)).toBe('—');
  });

  it('Bug B12: returns « — » for escrow step when order status is REFUNDED regardless of frozen step', () => {
    expect(attentionStepLabel('AWAITING_VALIDATION', 'REFUNDED')).toBe('—');
    expect(attentionStepLabel('REPAIR_STARTED', 'REFUNDED')).toBe('—');
    expect(attentionStepLabel('AWAITING_VALIDATION', 'PAID')).toBe('Validation client');
  });

  it('formats the amount the French way', () => {
    expect(attentionAmount(10550)).toBe('105,50 €');
    expect(attentionAmount(398)).toBe('3,98 €');
  });
});
