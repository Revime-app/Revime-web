import { describe, expect, it } from 'vitest';
import { LINKS, NAV_CATEGORIES } from '../components/AdminNav';

/** UI3 / CF4-37 / CF4-38: « Avis » in Utilisateurs, « Conseils du jour » in Contenu. */
describe('AdminNav: sub-project L links', () => {
  it('has « Avis » → /avis and « Conseils du jour » → /conseils, once each', () => {
    expect(LINKS.filter((l) => l.href === '/avis')).toMatchObject([{ href: '/avis', label: 'Avis' }]);
    expect(LINKS.filter((l) => l.href === '/conseils')).toMatchObject([{ href: '/conseils', label: 'Conseils du jour' }]);
  });

  it('places /avis in Utilisateurs and /conseils in Contenu (§UI3)', () => {
    const utilisateurs = NAV_CATEGORIES.find((c) => c.id === 'utilisateurs');
    const contenu = NAV_CATEGORIES.find((c) => c.id === 'contenu');
    expect(utilisateurs?.items.some((i) => i.href === '/avis')).toBe(true);
    expect(contenu?.items.some((i) => i.href === '/conseils')).toBe(true);
  });
});
