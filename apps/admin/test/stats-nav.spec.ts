import { describe, it, expect } from 'vitest';
import { LINKS, NAV_CATEGORIES } from '../components/AdminNav';

describe('AdminNav navigation links', () => {
  it('contains the /statistiques destination with label Statistiques', () => {
    const link = LINKS.find((l) => l.href === '/statistiques');
    expect(link).toBeDefined();
    expect(link?.label).toBe('Statistiques');
  });

  it('places /statistiques in the Pilotage category (§UI3)', () => {
    const pilotage = NAV_CATEGORIES.find((c) => c.id === 'pilotage');
    expect(pilotage).toBeDefined();
    expect(pilotage?.items.some((i) => i.href === '/statistiques')).toBe(true);
  });
});
