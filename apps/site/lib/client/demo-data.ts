import type { CategoryDto, DemandeDto, DemandeListItem, OfferDto } from '@revime/shared';

/**
 * Made-up data for demo mode (config.ts). Shapes follow the API's DTOs in @revime/shared so the
 * screens render exactly what they will render with real data. Nothing here is a real person.
 */

const cat = (id: string, parentId: string | null, slug: string, labelFr: string): CategoryDto => ({
  id,
  parentId,
  slug,
  labelFr,
});

export const DEMO_CATEGORIES: CategoryDto[] = [
  cat('00000000-0000-4000-8000-000000000001', null, 'electronique', 'Électronique'),
  cat('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'smartphone', 'Smartphones'),
  cat('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'ordinateur', 'Ordinateurs'),
  cat('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'console', 'Consoles'),
  cat('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'televisions', 'Télévisions'),
  cat('00000000-0000-4000-8000-000000000002', null, 'maison-jardin', 'Maison & jardin'),
  cat('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000002', 'petit-electromenager', 'Petit électroménager'),
  cat('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000002', 'meubles', 'Meubles'),
  cat('00000000-0000-4000-8000-000000000003', null, 'mode-accessoires', 'Mode & accessoires'),
  cat('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000003', 'montres-bijoux', 'Montres & bijoux'),
  cat('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000003', 'chaussures', 'Chaussures'),
  cat('00000000-0000-4000-8000-000000000004', null, 'mobilite', 'Mobilité'),
  cat('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000004', 'velos', 'Vélos'),
  cat('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000004', 'trottinettes-electriques', 'Trottinettes électriques'),
];

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const demandes: DemandeListItem[] = [
  {
    id: 'demo-ecran',
    title: 'Écran iPhone 13 fissuré',
    status: 'OPEN',
    commande: null,
    categoryLabelFr: 'Smartphones',
    locationLabel: 'Lyon 3e',
    offerCount: 3,
    photoUrl: null,
    quoteRequest: null,
    isPrivate: false,
    createdAt: ago(1),
  },
  {
    id: 'demo-velo',
    title: 'Dérailleur arrière qui saute',
    status: 'IN_PROGRESS',
    commande: {
      status: 'PAID',
      step: 'REPAIR_STARTED',
      commandeId: 'demo-commande-velo',
      delivery: 'WORKSHOP',
      disputeOpen: false,
    },
    categoryLabelFr: 'Vélos',
    locationLabel: 'Villeurbanne',
    offerCount: 2,
    photoUrl: null,
    quoteRequest: null,
    isPrivate: false,
    createdAt: ago(9),
  },
  {
    id: 'demo-cafe',
    title: 'Machine à café qui fuit',
    status: 'DONE',
    commande: {
      status: 'PAID',
      step: 'RELEASED',
      commandeId: 'demo-commande-cafe',
      delivery: 'WORKSHOP',
      disputeOpen: false,
    },
    categoryLabelFr: 'Petit électroménager',
    locationLabel: 'Lyon 7e',
    offerCount: 4,
    photoUrl: null,
    quoteRequest: null,
    isPrivate: false,
    createdAt: ago(40),
  },
];

const offers: OfferDto[] = [
  {
    id: 'demo-offre-1',
    repairerName: 'Atelier Phone Lyon',
    repairerUserId: 'demo-rep-1',
    priceCents: 8900,
    delayHours: 24,
    warrantyLabel: '6 mois',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: true,
    comment: 'Écran OLED d’origine Apple, pose en 1 h sur rendez-vous.',
    distanceKm: 1.8,
    verifiedBadge: 'BUSINESS',
    rating: 4.9,
    reviewCount: 37,
    repairCount: 112,
    status: 'SENT',
    createdAt: ago(0.6),
  },
  {
    id: 'demo-offre-2',
    repairerName: 'Karim R.',
    repairerUserId: 'demo-rep-2',
    priceCents: 6500,
    delayHours: 48,
    warrantyLabel: '3 mois',
    partsLabel: 'Pièce compatible',
    travel: 'HOME',
    acceptsParcel: false,
    comment: 'Je me déplace chez vous, écran compatible de bonne qualité.',
    distanceKm: 3.4,
    verifiedBadge: 'IDENTITY',
    rating: 4.7,
    reviewCount: 12,
    repairCount: 18,
    status: 'SENT',
    createdAt: ago(0.4),
  },
  {
    id: 'demo-offre-3',
    repairerName: 'Répar’Express Part-Dieu',
    repairerUserId: 'demo-rep-3',
    priceCents: 11900,
    delayHours: 4,
    warrantyLabel: '12 mois',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: true,
    comment: null,
    distanceKm: 2.6,
    verifiedBadge: 'BUSINESS',
    rating: 4.8,
    reviewCount: 64,
    repairCount: 240,
    status: 'SENT',
    createdAt: ago(0.2),
  },
];

function detail(id: string): DemandeDto | undefined {
  const item = demandes.find((d) => d.id === id);
  if (!item) return undefined;
  const category = DEMO_CATEGORIES.find((c) => c.labelFr === item.categoryLabelFr)!;
  return {
    id: item.id,
    title: item.title,
    description:
      item.id === 'demo-ecran'
        ? "Chute ce matin, l'écran est fissuré en haut à gauche mais le tactile fonctionne encore. Face ID OK."
        : 'Le problème est apparu il y a quelques jours.',
    brand: item.id === 'demo-ecran' ? 'Apple' : null,
    model: item.id === 'demo-ecran' ? 'iPhone 13' : null,
    parts: 'UNKNOWN',
    mode: 'OFFERS',
    budgetCents: null,
    locationLabel: item.locationLabel,
    postalCode: '69003',
    status: item.status,
    commande: item.commande,
    category: { id: category.id, slug: category.slug, labelFr: category.labelFr },
    offerCount: item.offerCount,
    photos: [],
    photoUrls: [],
    distanceKm: null,
    author: null,
    quoteRequest: null,
    isPrivate: false,
    createdAt: item.createdAt,
  } as unknown as DemandeDto;
}

const me = {
  id: 'demo-user',
  email: 'lea@example.com',
  name: 'Léa Martin',
  firstName: 'Léa',
  lastName: 'Martin',
  username: 'lea.m',
  profile: { activeMode: 'CLIENT' },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoGet<T>(path: string): Promise<T> {
  await wait(150);
  const p = path.split('?')[0]!;
  if (p === '/users/me') return me as T;
  if (p === '/categories') return DEMO_CATEGORIES as T;
  if (p === '/demandes/mine') return demandes as T;
  const offersMatch = p.match(/^\/demandes\/([^/]+)\/offers$/);
  if (offersMatch) return (offersMatch[1] === 'demo-ecran' ? offers : []) as T;
  const detailMatch = p.match(/^\/demandes\/([^/]+)$/);
  if (detailMatch) {
    const d = detail(detailMatch[1]!);
    if (d) return d as T;
  }
  throw new Error(`Demo: no data for ${path}`);
}

export async function demoPost<T>(path: string, body: unknown): Promise<T> {
  await wait(400);
  if (path === '/demandes') {
    const input = body as { title: string; locationLabel: string; categoryId: string };
    const created: DemandeListItem = {
      id: `demo-${Date.now()}`,
      title: input.title,
      status: 'OPEN',
      commande: null,
      categoryLabelFr: DEMO_CATEGORIES.find((c) => c.id === input.categoryId)?.labelFr ?? 'Autre',
      locationLabel: input.locationLabel,
      offerCount: 0,
      photoUrl: null,
      quoteRequest: null,
      isPrivate: false,
      createdAt: new Date().toISOString(),
    };
    demandes.unshift(created);
    return detail(created.id) as T;
  }
  throw new Error(`Demo: ${path} is not available in demo mode`);
}
