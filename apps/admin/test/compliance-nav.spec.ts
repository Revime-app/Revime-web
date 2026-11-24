import { describe, expect, it } from 'vitest';
import { LINKS } from '../components/AdminNav';

describe('AdminNav: compliance link', () => {
  it('has « Conformité » → /conformite in LINKS', () => {
    expect(LINKS.filter((l) => l.href === '/conformite')).toEqual([
      { href: '/conformite', label: 'Conformité' },
    ]);
  });

  it('places /conformite directly after /parametres', () => {
    const paramIdx = LINKS.findIndex((l) => l.href === '/parametres');
    expect(LINKS[paramIdx + 1]?.href).toBe('/conformite');
  });
});
