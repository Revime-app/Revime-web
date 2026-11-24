import { describe, it, expect } from 'vitest';
import { LINKS, NAV_CATEGORIES } from '../components/AdminNav';

describe('AdminNav navigation links', () => {
  it('contains the /categories destination with label Catégories', () => {
    const link = LINKS.find((l) => l.href === '/categories');
    expect(link).toBeDefined();
    expect(link?.label).toBe('Catégories');
  });

  it('places /categories in the Contenu category (§UI3)', () => {
    const contenuCategory = NAV_CATEGORIES.find((c) => c.id === 'contenu');
    expect(contenuCategory).toBeDefined();
    expect(contenuCategory?.items.some((item) => item.href === '/categories')).toBe(true);
  });

  // P12 (spec §3.4): restores /remboursement (Remboursement manuel) alongside /remboursements
  it('has both /remboursements and /remboursement nav entries under finance', () => {
    expect(LINKS.filter((l) => l.href.startsWith('/remboursement')).length).toBe(2);
    expect(LINKS.some((l) => l.href === '/remboursement')).toBe(true);
    expect(LINKS.some((l) => l.href === '/remboursements')).toBe(true);
  });
});
