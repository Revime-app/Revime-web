import { describe, it, expect } from 'vitest';
import type { LegalDocument, LegalSection } from '../src/lib/legal/types';

describe('Legal Types Contract', () => {
  it('should support level 1 and level 2 on LegalSection without breaking body array', () => {
    const section: LegalSection = {
      heading: '1. OBJET',
      level: 1,
      body: ['Premier paragraphe', '• Point de liste', '21 Rue Curnonsky\n75017 Paris\nFrance'],
    };

    const subSection: LegalSection = {
      heading: '1.1 Définitions',
      level: 2,
      body: ['Sous-clause'],
    };

    const doc: LegalDocument = {
      title: 'CONDITIONS GÉNÉRALES D’UTILISATION — REVIME',
      updated: 'Dernière mise à jour : 10 octobre 2026',
      sections: [section, subSection],
    };

    expect(doc.title).toBeDefined();
    expect(doc.sections[0].level).toBe(1);
    expect(doc.sections[0].body[1]).toMatch(/^• /);
    expect(doc.sections[0].body[2]).toContain('\n');
    expect(doc.sections[1].level).toBe(2);
  });
});
