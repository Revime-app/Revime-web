import { describe, it, expect } from 'vitest';
import {
  isPrivateDemandeItem,
  filterDemandes,
  getDemandeCounts,
  getEmptyStateCopy,
  pillAccessibilityLabel,
} from '../src/components/demande/demande-filter.js';

describe('demande filtering and counts (CF6-14)', () => {
  const publicItem1 = {
    id: 'd-pub-1',
    title: 'Écran iPhone cassé',
    isPrivate: false,
    quoteRequest: null,
  };
  const publicItem2 = {
    id: 'd-pub-2',
    title: 'Batterie MacBook',
    isPrivate: false,
    quoteRequest: null,
  };
  const privateItem1 = {
    id: 'd-priv-1',
    title: 'Devis sur mesure trottinette',
    isPrivate: true,
    quoteRequest: { repairer: { userId: 'r1' } },
  };
  // An older API omits `isPrivate`: typed required (the current API always sends it), read
  // defensively, so these fixtures deliberately cast around the type.
  const legacyPrivateItem = {
    id: 'd-priv-legacy',
    title: 'Devis console',
    quoteRequest: { repairer: { userId: 'r2' } },
  } as never as typeof privateItem1;
  const legacyPublicItem = {
    id: 'd-pub-legacy',
    title: 'Micro-ondes en panne',
    quoteRequest: null,
  } as never as typeof publicItem1;

  const sampleList = [publicItem1, privateItem1, publicItem2, legacyPrivateItem, legacyPublicItem];

  describe('isPrivateDemandeItem', () => {
    it('returns true when isPrivate is true', () => {
      expect(isPrivateDemandeItem(privateItem1)).toBe(true);
    });

    it('returns false when isPrivate is false', () => {
      expect(isPrivateDemandeItem(publicItem1)).toBe(false);
    });

    it('falls back to quoteRequest != null when isPrivate is absent', () => {
      expect(isPrivateDemandeItem(legacyPrivateItem)).toBe(true);
      expect(isPrivateDemandeItem(legacyPublicItem)).toBe(false);
    });
  });

  describe('getDemandeCounts', () => {
    it('accurately computes all, public, and private counts', () => {
      const counts = getDemandeCounts(sampleList);
      expect(counts).toEqual({
        all: 5,
        public: 3,
        private: 2,
      });
    });

    it('returns zeros for empty array', () => {
      expect(getDemandeCounts([])).toEqual({
        all: 0,
        public: 0,
        private: 0,
      });
    });
  });

  describe('filterDemandes', () => {
    it('returns all items when filter is ALL', () => {
      const filtered = filterDemandes(sampleList, 'ALL');
      expect(filtered.map((d) => d.id)).toEqual([
        'd-pub-1',
        'd-priv-1',
        'd-pub-2',
        'd-priv-legacy',
        'd-pub-legacy',
      ]);
    });

    it('returns only public items when filter is PUBLIC', () => {
      const filtered = filterDemandes(sampleList, 'PUBLIC');
      expect(filtered.map((d) => d.id)).toEqual(['d-pub-1', 'd-pub-2', 'd-pub-legacy']);
    });

    it('returns only private items when filter is PRIVATE', () => {
      const filtered = filterDemandes(sampleList, 'PRIVATE');
      expect(filtered.map((d) => d.id)).toEqual(['d-priv-1', 'd-priv-legacy']);
    });
  });

  describe('getEmptyStateCopy', () => {
    it('explains an empty public tab', () => {
      const copy = getEmptyStateCopy('PUBLIC');
      expect(copy.title).toBe('Aucune demande publique pour le moment.');
      expect(copy.subtitle).toContain('demande publique');
    });

    it('explains an empty private tab', () => {
      const copy = getEmptyStateCopy('PRIVATE');
      expect(copy.title).toBe('Aucun devis privé pour le moment.');
      expect(copy.subtitle).toContain('devis directes');
    });
  });

  describe('pillAccessibilityLabel', () => {
    it('reads the visible text and a count in correct French: 0 and 1 are singular', () => {
      expect(pillAccessibilityLabel('Devis privés', 0)).toBe('Devis privés, 0 élément');
      expect(pillAccessibilityLabel('Devis privés', 1)).toBe('Devis privés, 1 élément');
      expect(pillAccessibilityLabel('Toutes', 2)).toBe('Toutes, 2 éléments');
    });
  });
});
