import { describe, expect, it } from 'vitest';
import {
  cancellationStatusLabel,
  frozenStepLabel,
  transferredWarning,
} from '../lib/cancellation-admin';

/**
 * CF4-27 (spec §4.5). Pure helpers for the « Annulations » dashboard: the status label per
 * `CancellationRequestStatus`, the frozen step's label (reusing the shared `STEP_LABEL`), and
 * the « fonds déjà versés » warning sentence when a transfer has already succeeded.
 */

describe('cancellationStatusLabel', () => {
  it('maps every CancellationRequestStatus to its French label', () => {
    expect(cancellationStatusLabel('PENDING')).toBe('En attente');
    expect(cancellationStatusLabel('APPROVED')).toBe('Acceptée');
    expect(cancellationStatusLabel('REFUSED')).toBe('Refusée');
    expect(cancellationStatusLabel('WITHDRAWN')).toBe('Retirée par le client');
    expect(cancellationStatusLabel('SUPERSEDED')).toBe('Remplacée par un litige');
  });
});

describe('frozenStepLabel', () => {
  it('reuses the shared step label for a known step', () => {
    expect(frozenStepLabel('REPAIR_STARTED')).toBe('Réparation en cours');
    expect(frozenStepLabel('PAID')).toBe('Paiement effectué');
  });

  it('reads « — » for a null step (not yet paid, unreachable in practice but honest)', () => {
    expect(frozenStepLabel(null)).toBe('—');
  });
});

describe('transferredWarning', () => {
  it('returns the spec §4.5 sentence when the item is transferred', () => {
    expect(transferredWarning({ transferred: true })).toBe(
      'Les fonds ont déjà été versés : le remboursement annulera le virement.',
    );
  });

  it('returns null when not transferred', () => {
    expect(transferredWarning({ transferred: false })).toBeNull();
  });
});
