import { describe, it, expect } from 'vitest';
import { formatLegalForm } from '@revime/shared';

describe('D4: Enterprise Legal Form Nomenclature Mapping', () => {
  it('maps numeric code "8310" to the official INSEE label', () => {
    expect(formatLegalForm('8310')).toBe('Comité social économique d’entreprise');
  });

  it('maps common commercial company numeric codes to full French labels', () => {
    expect(formatLegalForm('1000')).toBe('Entrepreneur individuel');
    expect(formatLegalForm('5499')).toBe('Société à responsabilité limitée (sans autre indication)');
    expect(formatLegalForm('5710')).toBe('SAS, société par actions simplifiée');
    expect(formatLegalForm('6540')).toBe('Société civile immobilière');
    expect(formatLegalForm('9220')).toBe('Association déclarée');
  });

  it('preserves existing human-readable text labels intact', () => {
    expect(formatLegalForm('Micro-entreprise / Auto-entrepreneur')).toBe('Micro-entreprise / Auto-entrepreneur');
    expect(formatLegalForm('SAS')).toBe('SAS');
    expect(formatLegalForm('SARL')).toBe('SARL');
    expect(formatLegalForm('EURL')).toBe('EURL');
    expect(formatLegalForm('EI')).toBe('EI');
  });

  it('handles null, undefined, empty and whitespace strings gracefully returning "—"', () => {
    expect(formatLegalForm(null)).toBe('—');
    expect(formatLegalForm(undefined)).toBe('—');
    expect(formatLegalForm('')).toBe('—');
    expect(formatLegalForm('   ')).toBe('—');
  });

  it('provides a clean fallback for unknown 4-digit INSEE codes', () => {
    expect(formatLegalForm('9999')).toBe('Autre personne morale de droit privé (9999)');
    expect(formatLegalForm('8399')).toBe("Comité d'entreprise (8399)");
  });
});
