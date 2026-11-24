import { describe, expect, it } from 'vitest';
import { LINKS } from '../components/AdminNav';

/** CF4-27 (spec §4.5): « Annulations » → /annulations, placed after « Litiges ». */
describe('AdminNav: CF4-27 cancellations link', () => {
  it('has « Annulations » → /annulations, once', () => {
    expect(LINKS.filter((l) => l.href === '/annulations')).toMatchObject([
      { href: '/annulations', label: 'Annulations' },
    ]);
  });

  it('places it directly after /litiges', () => {
    const i = LINKS.findIndex((l) => l.href === '/litiges');
    expect(LINKS[i + 1]?.href).toBe('/annulations');
  });
});
