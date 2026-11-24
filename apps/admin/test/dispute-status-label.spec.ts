import { describe, expect, it } from 'vitest';
import { disputeStatusLabel } from '../lib/dispute-status-label';

describe('disputeStatusLabel', () => {
  it('words every dispute status in French, never the raw enum value', () => {
    expect(disputeStatusLabel('OPEN')).toBe('Ouvert');
    expect(disputeStatusLabel('IN_REVIEW')).toBe("En cours d'examen");
    expect(disputeStatusLabel('RESOLVED_RELEASED')).toBe('Fonds débloqués');
    expect(disputeStatusLabel('RESOLVED_REFUNDED')).toBe('Remboursé au client');
    expect(disputeStatusLabel('RESOLVED_DISMISSED')).toBe('Réparation reprise');
  });

  it('says « Clôturé » when the status is unknown', () => {
    expect(disputeStatusLabel(null)).toBe('Clôturé');
  });
});
