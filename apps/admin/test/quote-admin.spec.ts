import { describe, expect, it } from 'vitest';
import { demandeTypeLabel, quoteClosedReasonLabel } from '../lib/quote-admin';

/** CF4-25 (spec §4.4). Pure helpers of the admin « Demandes » list and fiche. */

describe('demandeTypeLabel', () => {
  it('private → « Privée → X »', () => {
    expect(demandeTypeLabel({ quoteTarget: { userId: 'r1', displayName: 'Martin' } })).toBe('Privée → Martin');
  });
  it('public → « Publique »', () => {
    expect(demandeTypeLabel({ quoteTarget: null })).toBe('Publique');
  });
  it('an older API without the field reads as public', () => {
    expect(demandeTypeLabel({})).toBe('Publique');
  });
});

describe('quoteClosedReasonLabel', () => {
  it.each([
    ['DECLINED', 'Refusée par le réparateur'],
    ['EXPIRED', 'Expirée : aucune réponse sous 7 jours'],
    ['QUOTE_REFUSED', 'Devis refusé'],
    ['CANCELLED_BY_CLIENT', 'Annulée par le client'],
  ] as const)('%s', (reason, label) => {
    expect(quoteClosedReasonLabel(reason)).toBe(label);
  });
  it('null → null', () => {
    expect(quoteClosedReasonLabel(null)).toBeNull();
  });
});
