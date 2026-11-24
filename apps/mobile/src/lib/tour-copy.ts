import type { TourPageId } from '@revime/shared';

/**
 * V8 E2: the help bubbles' copy, verbatim from `CLIENT_FEEDBACK_V8.md` §4 E2 « Design » as amended by
 * `DEC8-10`. Two rows are the client's own examples (client and repairer Accueil 1/4); the rest were
 * drafted from them and approved by the owner (`DEC8-09` (1)), each sentence checked against its screen
 * (`FND8-025`). Do not edit a sentence here without editing that table: the end-of-round client message
 * quotes it.
 *
 * Measured (PIL, Google Sans Flex, from the repo root, `apps/mobile/AGENTS.md`): titles at 17pt bold are
 * 74.8 to 257.5pt wide, sentences at 14.5pt regular wrap to 1 to 3 lines, against the 295pt text width of
 * a 375pt iPhone SE (`TourBubble.tsx` has the box). « Bienvenue en mode réparateur » (257.5pt) is the
 * widest title.
 */

export type TourMode = 'CLIENT' | 'REPAIRER';

export type TourTargetId =
  | 'promoBanner'
  | 'homeSearch'
  | 'bell'
  | 'tabProfil'
  | 'journeyCard'
  | 'nearbyRow'
  | 'fabDemandes'
  | 'publierProgress'
  | 'publierCategory'
  | 'searchSubtabs'
  | 'feedTitle'
  | 'pourMoiChip'
  | 'feedSearch'
  | 'messagesTitle'
  | 'messagesFilters'
  | 'reparationsTitle'
  | 'reparationsFilters'
  | 'reparationsHeader'
  | 'offresSubtitle'
  | 'propositionsSubtitle'
  | 'revenusHero'
  | 'devisSection'
  | 'monProfilTile'
  | 'shortcutGrid'
  | 'modeSection'
  | 'revoirVisite';

export type TourStep = { target: TourTargetId; title: string; body: string };

const MESSAGES_FILTERS: TourStep = {
  target: 'messagesFilters',
  title: 'Filtrer vos messages',
  body: 'Affichez tous vos messages, ou seulement les non lus.',
};
const REVOIR: TourStep = {
  target: 'revoirVisite',
  title: 'Revoir la visite',
  body: "Relancez ces bulles d'aide quand vous voulez.",
};

/** Page order is the table's order; `Object.keys` order is part of the contract (the spec reads it). */
export const TOUR_PAGES: Record<TourMode, Partial<Record<TourPageId, readonly TourStep[]>>> = {
  CLIENT: {
    accueil: [
      { target: 'promoBanner', title: 'Un objet cassé ?', body: 'Publiez une demande avec une photo. Les réparateurs près de chez vous vous envoient leurs offres.' },
      { target: 'homeSearch', title: 'Rechercher', body: 'Parcourez les demandes publiques et trouvez un réparateur.' },
      { target: 'bell', title: 'Vos notifications', body: 'Nouvelles offres, messages et suivi de vos réparations arrivent ici.' },
      { target: 'tabProfil', title: 'Votre espace', body: 'Vos réparations, vos offres reçues et vos paramètres sont dans Profil.' },
    ],
    publier: [
      {
        target: 'publierProgress',
        title: 'Votre demande en 4 étapes',
        body: "Décrivez l'objet, choisissez les pièces et le lieu, fixez un budget si vous le souhaitez, puis vérifiez avant de publier.",
      },
      { target: 'publierCategory', title: 'Choisissez la catégorie', body: 'Elle aide les réparateurs concernés à trouver votre demande.' },
    ],
    recherche: [
      { target: 'searchSubtabs', title: 'Demandes ou réparateurs', body: 'Voyez les demandes publiques des autres clients, ou cherchez un réparateur.' },
    ],
    messages: [
      { target: 'messagesTitle', title: 'Vos conversations', body: 'Échangez ici avec les réparateurs, avant et pendant la réparation.' },
      MESSAGES_FILTERS,
    ],
    reparations: [
      { target: 'reparationsTitle', title: 'Suivez vos demandes', body: 'Chaque demande apparaît ici dès sa publication, avec son étape en cours.' },
      { target: 'reparationsFilters', title: 'Publiques ou privées', body: 'Filtrez entre vos demandes publiques et vos devis privés.' },
    ],
    offres: [
      { target: 'offresSubtitle', title: 'Comparez les offres', body: 'Chaque offre reçue apparaît ici. Touchez-en une pour la comparer aux autres.' },
    ],
    profil: [
      { target: 'monProfilTile', title: 'Votre profil', body: "Votre nom d'utilisateur et le statut de vérification de votre compte." },
      { target: 'shortcutGrid', title: 'Vos raccourcis', body: 'Réparations, offres reçues, favoris et messages, en un geste.' },
    ],
    parametres: [
      { target: 'modeSection', title: 'Changer de mode', body: 'Passez du mode client au mode réparateur à tout moment.' },
      REVOIR,
    ],
  },
  REPAIRER: {
    accueil: [
      { target: 'journeyCard', title: 'Terminez votre configuration', body: "Ces étapes débloquent l'envoi d'offres et vos paiements." },
      { target: 'nearbyRow', title: 'Demandes près de chez vous', body: 'Les dernières demandes autour de vous. Touchez-en une pour faire une offre.' },
      { target: 'fabDemandes', title: 'Toutes les demandes', body: 'Ce bouton ouvre la liste de toutes les demandes ouvertes.' },
      { target: 'bell', title: 'Vos notifications', body: 'Offres acceptées, messages, demandes de devis et paiements arrivent ici.' },
    ],
    demandes: [
      { target: 'feedTitle', title: 'Les demandes ouvertes', body: 'Toutes les demandes des clients. Touchez-en une pour faire une offre.' },
      { target: 'pourMoiChip', title: 'Pour moi', body: "N'affichez que les demandes de vos catégories auxquelles vous n'avez pas encore répondu." },
    ],
    recherche: [{ target: 'feedSearch', title: 'Rechercher une demande', body: 'Cherchez par objet, catégorie ou ville.' }],
    messages: [
      { target: 'messagesTitle', title: 'Vos conversations', body: 'Échangez ici avec vos clients, avant et pendant la réparation.' },
      MESSAGES_FILTERS,
    ],
    reparations: [
      { target: 'reparationsHeader', title: 'Vos réparations', body: "Les commandes de vos offres acceptées, jusqu'au paiement." },
    ],
    propositions: [
      { target: 'propositionsSubtitle', title: 'Vos offres envoyées', body: 'Suivez ici chaque offre envoyée et la réponse du client.' },
    ],
    tableau: [
      { target: 'revenusHero', title: 'Vos revenus', body: 'Le montant du mois, ce qui vous attend et ce qui vous a été versé.' },
      { target: 'devisSection', title: 'Demandes de devis', body: 'Les clients qui vous demandent un devis privé apparaissent ici.' },
    ],
    profil: [
      { target: 'monProfilTile', title: 'Votre profil public', body: "Photo, description et zone : c'est ce que les clients voient avant de vous choisir." },
      { target: 'shortcutGrid', title: 'Vos raccourcis', body: 'Tableau de bord, propositions, réparations et messages, en un geste.' },
    ],
    parametres: [
      { target: 'modeSection', title: 'Changer de mode', body: 'Passez du mode réparateur au mode client à tout moment.' },
      REVOIR,
    ],
  },
};

/** `DEC8-09` (3). */
export const TOUR_OFFER: Record<TourMode, { title: string }> = {
  CLIENT: { title: 'Bienvenue sur Revime' },
  REPAIRER: { title: 'Bienvenue en mode réparateur' },
};
export const TOUR_OFFER_BODY = "Une courte visite vous montre l'essentiel de chaque page, la première fois que vous l'ouvrez.";
export const TOUR_OFFER_START = 'Commencer la visite';
export const TOUR_OFFER_LATER = 'Plus tard';
export const TOUR_OFFER_NOTE = 'Vous pourrez la lancer plus tard depuis Paramètres.';

/** The client's own control words (V8 §0.2, E2 « RÈGLES »). */
export const TOUR_SKIP = 'Passer';
export const TOUR_NEXT = 'Suivant';
export const TOUR_DONE = 'Compris';
export const REVOIR_LA_VISITE = 'Revoir la visite';
