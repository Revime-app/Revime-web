import { describe, expect, it } from 'vitest';
import {
  REVOIR_LA_VISITE,
  TOUR_DONE,
  TOUR_NEXT,
  TOUR_OFFER,
  TOUR_OFFER_BODY,
  TOUR_OFFER_LATER,
  TOUR_OFFER_NOTE,
  TOUR_OFFER_START,
  TOUR_PAGES,
  TOUR_SKIP,
} from '../src/lib/tour-copy';

/** V8 E2: the copy in `CLIENT_FEEDBACK_V8.md` §4 E2 « Design », as amended by `DEC8-10`. */

const all = (mode: 'CLIENT' | 'REPAIRER') => Object.values(TOUR_PAGES[mode]).flatMap((steps) => steps ?? []);

describe('TOUR_PAGES', () => {
  it('covers the client 8 pages with 16 bubbles', () => {
    expect(Object.keys(TOUR_PAGES.CLIENT)).toEqual(['accueil', 'publier', 'recherche', 'messages', 'reparations', 'offres', 'profil', 'parametres']);
    expect(all('CLIENT')).toHaveLength(16);
  });

  it('covers the repairer 9 pages with 17 bubbles', () => {
    expect(Object.keys(TOUR_PAGES.REPAIRER)).toEqual(['accueil', 'demandes', 'recherche', 'messages', 'reparations', 'propositions', 'tableau', 'profil', 'parametres']);
    expect(all('REPAIRER')).toHaveLength(17);
  });

  it('gives every page 1 to 4 bubbles', () => {
    for (const mode of ['CLIENT', 'REPAIRER'] as const) {
      for (const steps of Object.values(TOUR_PAGES[mode])) {
        expect(steps!.length).toBeGreaterThanOrEqual(1);
        expect(steps!.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("uses the client's two examples verbatim", () => {
    expect(TOUR_PAGES.CLIENT.accueil![0]).toEqual({
      target: 'promoBanner',
      title: 'Un objet cassé ?',
      body: 'Publiez une demande avec une photo. Les réparateurs près de chez vous vous envoient leurs offres.',
    });
    expect(TOUR_PAGES.REPAIRER.accueil![0]).toEqual({
      target: 'journeyCard',
      title: 'Terminez votre configuration',
      body: "Ces étapes débloquent l'envoi d'offres et vos paiements.",
    });
  });

  it('carries the five DEC8-10 corrections verbatim', () => {
    expect(TOUR_PAGES.CLIENT.accueil![1]!.body).toBe('Parcourez les demandes publiques et trouvez un réparateur.');
    expect(TOUR_PAGES.CLIENT.publier![0]!.body).toBe(
      "Décrivez l'objet, choisissez les pièces et le lieu, fixez un budget si vous le souhaitez, puis vérifiez avant de publier.",
    );
    expect(TOUR_PAGES.CLIENT.profil![0]).toEqual({
      target: 'monProfilTile',
      title: 'Votre profil',
      body: "Votre nom d'utilisateur et le statut de vérification de votre compte.",
    });
    expect(TOUR_PAGES.REPAIRER.accueil![3]!.body).toBe('Offres acceptées, messages, demandes de devis et paiements arrivent ici.');
    expect(TOUR_PAGES.REPAIRER.demandes![1]!.body).toBe(
      "N'affichez que les demandes de vos catégories auxquelles vous n'avez pas encore répondu.",
    );
  });

  it('carries none of the five struck sentences', () => {
    const text = [...all('CLIENT'), ...all('REPAIRER')].map((s) => `${s.title} ${s.body}`).join('\n');
    for (const struck of [/réparateur vérifié/, /le budget et le lieu/, /coordonnées/, /Nouvelles demandes/, /correspondent à vos services/]) {
      expect(text).not.toMatch(struck);
    }
  });

  it('has no em dash anywhere', () => {
    const text = [...all('CLIENT'), ...all('REPAIRER')].map((s) => `${s.title} ${s.body}`).join('\n');
    expect(text).not.toContain('—');
  });

  it('ends Paramètres on « Revoir la visite » in both modes', () => {
    for (const mode of ['CLIENT', 'REPAIRER'] as const) {
      expect(TOUR_PAGES[mode].parametres!.at(-1)).toEqual({
        target: 'revoirVisite',
        title: 'Revoir la visite',
        body: "Relancez ces bulles d'aide quand vous voulez.",
      });
    }
  });
});

describe('offer and controls', () => {
  it('titles the offer per mode', () => {
    expect(TOUR_OFFER.CLIENT.title).toBe('Bienvenue sur Revime');
    expect(TOUR_OFFER.REPAIRER.title).toBe('Bienvenue en mode réparateur');
  });

  it('uses the DEC8-09 (3) offer copy', () => {
    expect(TOUR_OFFER_BODY).toBe("Une courte visite vous montre l'essentiel de chaque page, la première fois que vous l'ouvrez.");
    expect(TOUR_OFFER_START).toBe('Commencer la visite');
    expect(TOUR_OFFER_LATER).toBe('Plus tard');
    expect(TOUR_OFFER_NOTE).toBe('Vous pourrez la lancer plus tard depuis Paramètres.');
  });

  it('names the bubble controls as the client did', () => {
    expect([TOUR_SKIP, TOUR_NEXT, TOUR_DONE, REVOIR_LA_VISITE]).toEqual(['Passer', 'Suivant', 'Compris', 'Revoir la visite']);
  });
});
