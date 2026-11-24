/**
 * Public URL words for the catalogue's categories.
 *
 * The catalogue's internal slugs (`smartphone`, `televisions`...) are kept in the database and
 * the app. Public pages use the words people actually type in Google, validated by the owner on
 * 24/11/2026 (plan du site, « Adresses des pages d'objets ») from DataForSEO volumes (France, fr,
 * 23/11/2026). Volumes are monthly estimates, kept here so the order of work stays explainable.
 *
 * A category missing from this table keeps its internal slug and gets no dedicated SEO page
 * until it is added here.
 *
 * Changing a `seoSlug` after launch changes a public URL: add a 301 redirect at the same time.
 */
export type SeoCategory = {
  /** Slug of the category in the database (`Category.slug`). */
  internalSlug: string;
  /** URL segment under /reparation/. Lowercase, hyphens, no accents. */
  seoSlug: string;
  /** Object name as used in « Réparation de … » (H1). */
  object: string;
  /** Main French search the page is built for. */
  searchTerm: string;
  /** Estimated monthly searches in France for `searchTerm`. */
  monthlySearches: number;
  /** Optional title word that matches how people search better than the object (e.g. Cordonnier). */
  titleWord?: string;
};

export const SEO_CATEGORIES: readonly SeoCategory[] = [
  { internalSlug: 'chaussures', seoSlug: 'chaussures', object: 'chaussures', searchTerm: 'cordonnier', monthlySearches: 60500, titleWord: 'Cordonnier' },
  { internalSlug: 'smartphone', seoSlug: 'telephone', object: 'téléphone', searchTerm: 'réparateur téléphone à proximité', monthlySearches: 27100 },
  { internalSlug: 'velos', seoSlug: 'velo', object: 'vélo', searchTerm: 'réparation vélo', monthlySearches: 22200 },
  { internalSlug: 'electromenager', seoSlug: 'electromenager', object: 'électroménager', searchTerm: 'réparation électroménager', monthlySearches: 18100 },
  { internalSlug: 'ordinateur', seoSlug: 'ordinateur', object: 'ordinateur', searchTerm: 'réparation ordinateur', monthlySearches: 14800 },
  { internalSlug: 'trottinettes-electriques', seoSlug: 'trottinette-electrique', object: 'trottinette électrique', searchTerm: 'réparation trottinette électrique', monthlySearches: 14800 },
  { internalSlug: 'instruments-musique', seoSlug: 'instrument-musique', object: 'instrument de musique', searchTerm: 'luthier', monthlySearches: 12100, titleWord: 'Luthier' },
  { internalSlug: 'vetements', seoSlug: 'vetements', object: 'vêtements', searchTerm: 'retouche vêtement', monthlySearches: 5400, titleWord: 'Retouche' },
  { internalSlug: 'televisions', seoSlug: 'television', object: 'télévision', searchTerm: 'réparation télé', monthlySearches: 5400 },
  { internalSlug: 'montres-bijoux', seoSlug: 'montre', object: 'montre', searchTerm: 'réparation montre', monthlySearches: 2900 },
  { internalSlug: 'photo-video', seoSlug: 'appareil-photo', object: 'appareil photo', searchTerm: 'réparation appareil photo', monthlySearches: 2400 },
  { internalSlug: 'jardin-outillage', seoSlug: 'motoculture', object: 'tondeuse et motoculture', searchTerm: 'réparation tondeuse', monthlySearches: 2400 },
  { internalSlug: 'motos', seoSlug: 'moto', object: 'moto', searchTerm: 'réparation moto', monthlySearches: 2400 },
  { internalSlug: 'velos-electriques', seoSlug: 'velo-electrique', object: 'vélo électrique', searchTerm: 'réparation vélo électrique', monthlySearches: 1900 },
  { internalSlug: 'voitures', seoSlug: 'voiture', object: 'voiture', searchTerm: 'réparation voiture', monthlySearches: 1900 },
  { internalSlug: 'console', seoSlug: 'console', object: 'console', searchTerm: 'réparation console', monthlySearches: 1600 },
  { internalSlug: 'petit-electromenager', seoSlug: 'petit-electromenager', object: 'petit électroménager', searchTerm: 'réparation petit électroménager', monthlySearches: 1600 },
  { internalSlug: 'tablette', seoSlug: 'tablette', object: 'tablette', searchTerm: 'réparation tablette', monthlySearches: 1300 },
  { internalSlug: 'audio-enceintes', seoSlug: 'hifi', object: 'matériel hi-fi', searchTerm: 'réparation hifi', monthlySearches: 1000 },
  { internalSlug: 'casques-ecouteurs', seoSlug: 'casque-audio', object: 'casque audio', searchTerm: 'réparation casque audio', monthlySearches: 480 },
  { internalSlug: 'meubles', seoSlug: 'meuble', object: 'meuble', searchTerm: 'restauration meuble', monthlySearches: 480, titleWord: 'Restauration' },
  { internalSlug: 'objets-connectes', seoSlug: 'montre-connectee', object: 'montre connectée', searchTerm: 'réparation montre connectée', monthlySearches: 320 },
  { internalSlug: 'sacs-maroquinerie', seoSlug: 'maroquinerie', object: 'maroquinerie', searchTerm: 'réparation maroquinerie', monthlySearches: 260 },
  { internalSlug: 'eclairage', seoSlug: 'lampe', object: 'lampe', searchTerm: 'réparation lampe', monthlySearches: 170 },
  { internalSlug: 'equipement-bebe', seoSlug: 'poussette', object: 'poussette', searchTerm: 'réparation poussette', monthlySearches: 140 },
];

/**
 * Categories the owner must still create in the admin before their page can exist
 * (high demand, no category in the catalogue yet).
 */
export const CATEGORIES_TO_CREATE = [
  { seoSlug: 'machine-a-laver', object: 'machine à laver', searchTerm: 'réparation machine à laver', monthlySearches: 4400 },
  { seoSlug: 'refrigerateur', object: 'réfrigérateur', searchTerm: 'réparation frigo', monthlySearches: 2900 },
  { seoSlug: 'machine-a-coudre', object: 'machine à coudre', searchTerm: 'réparation machine à coudre', monthlySearches: 3600 },
  { seoSlug: 'scooter', object: 'scooter', searchTerm: 'réparation scooter', monthlySearches: 2900 },
] as const;

export function findBySeoSlug(seoSlug: string): SeoCategory | undefined {
  return SEO_CATEGORIES.find((c) => c.seoSlug === seoSlug);
}

export function findByInternalSlug(internalSlug: string): SeoCategory | undefined {
  return SEO_CATEGORIES.find((c) => c.internalSlug === internalSlug);
}
