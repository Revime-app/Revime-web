import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_PAGES, type TourTargetId } from '../src/lib/tour-copy';

/**
 * V8 E2: the 17 covered pages are wired (criterion 7). A source scan, as E1's request-page check: the
 * screens need a navigator, a session and live queries to render, and the behaviour behind the wiring is
 * covered by `v8-e2-tour-logic` / `-ui` / `-shell`.
 */

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** Which screen file runs each page id. */
const PAGE_FILES: Record<string, string> = {
  accueil: 'app/(tabs)/index.tsx',
  publier: 'app/(tabs)/publier.tsx',
  demandes: 'app/(tabs)/publier.tsx',
  recherche: 'app/(tabs)/recherche.tsx',
  messages: 'app/(tabs)/messages.tsx',
  reparations: 'app/commandes.tsx',
  offres: 'app/offres-recues.tsx',
  propositions: 'app/mes-propositions.tsx',
  tableau: 'app/tableau-de-bord.tsx',
  profil: 'app/(tabs)/profil.tsx',
  parametres: 'app/parametres/index.tsx',
};

/** Where each spotlighted element is marked. */
const TARGET_FILES: Record<TourTargetId, string> = {
  promoBanner: 'app/(tabs)/index.tsx',
  homeSearch: 'app/(tabs)/index.tsx',
  journeyCard: 'app/(tabs)/index.tsx',
  nearbyRow: 'app/(tabs)/index.tsx',
  bell: 'src/components/BrandHeader.tsx',
  tabProfil: 'app/(tabs)/_layout.tsx',
  fabDemandes: 'app/(tabs)/_layout.tsx',
  publierProgress: 'app/(tabs)/publier.tsx',
  publierCategory: 'app/(tabs)/publier.tsx',
  searchSubtabs: 'src/components/ClientSearch.tsx',
  feedTitle: 'src/components/DemandeFeed.tsx',
  pourMoiChip: 'src/components/DemandeFeed.tsx',
  feedSearch: 'src/components/DemandeFeed.tsx',
  messagesTitle: 'app/(tabs)/messages.tsx',
  messagesFilters: 'app/(tabs)/messages.tsx',
  reparationsTitle: 'app/commandes.tsx',
  reparationsFilters: 'app/commandes.tsx',
  reparationsHeader: 'app/commandes.tsx',
  offresSubtitle: 'app/offres-recues.tsx',
  propositionsSubtitle: 'app/mes-propositions.tsx',
  revenusHero: 'app/tableau-de-bord.tsx',
  devisSection: 'app/tableau-de-bord.tsx',
  monProfilTile: 'app/(tabs)/profil.tsx',
  shortcutGrid: 'app/(tabs)/profil.tsx',
  modeSection: 'app/parametres/index.tsx',
  revoirVisite: 'app/parametres/index.tsx',
};

describe('every covered page runs its bubbles', () => {
  for (const mode of ['CLIENT', 'REPAIRER'] as const) {
    for (const page of Object.keys(TOUR_PAGES[mode])) {
      it(`${mode} ${page} calls useTourPage`, () => {
        const file = src(PAGE_FILES[page]!);
        // publier.tsx picks its page id by mode, so it names both ids in one call.
        expect(file).toMatch(new RegExp(`useTourPage\\([^)]*'${page}'`));
      });
    }
  }
});

describe('every spotlighted element is marked where it lives', () => {
  const used = new Set(
    (['CLIENT', 'REPAIRER'] as const).flatMap((m) => Object.values(TOUR_PAGES[m]).flatMap((steps) => steps!.map((s) => s.target))),
  );
  for (const target of used) {
    it(target, () => {
      const file = src(TARGET_FILES[target]);
      expect(file.includes(`useTourTarget('${target}')`) || file.includes(`tourTarget: '${target}'`)).toBe(true);
    });
  }
});

describe('pages with a target below the fold register their scroll view (DEC8-10 (2))', () => {
  for (const f of ['app/(tabs)/index.tsx', 'app/(tabs)/profil.tsx', 'app/tableau-de-bord.tsx']) {
    it(f, () => {
      expect(src(f)).toMatch(/\{\.\.\.(tour|homeTour|clientTour|repairerTour)\.scrollProps\}/);
    });
  }
});

describe('ShortcutGrid places a tile target', () => {
  it('spreads useTourTarget for a shortcut that names one', () => {
    expect(src('src/components/ShortcutGrid.tsx')).toMatch(/tourTarget\?: TourTargetId/);
  });
});
