import type {
  ConversationDto,
  ConversationListItem,
  CategoryDto,
  DemandeDto,
  DemandeListItem,
  DirectoryCardDto,
  OfferDto,
  PublicDemandeView,
  RepairerProfileDto,
  ReviewDto,
} from '@revime/shared';

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
    photoUrl: '/demo/velo.webp',
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
    photoUrl: '/demo/cafetiere.webp',
    quoteRequest: null,
    isPrivate: false,
    createdAt: ago(40),
  },
  {
    id: 'demo-veste',
    title: 'Fermeture éclair de veste à changer',
    status: 'OPEN',
    commande: null,
    categoryLabelFr: 'Vêtements',
    locationLabel: 'Lyon 1er',
    offerCount: 0,
    photoUrl: null,
    quoteRequest: null,
    isPrivate: true,
    createdAt: ago(2),
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


/** Demo-only pictures (public/demo), standing in for the photos clients and réparateurs upload. */
const DEMO_PHOTOS: Record<string, string> = {
  'pub-1': '/demo/ordinateur.webp',
  'pub-2': '/demo/trottinette.webp',
  'pub-3': '/demo/bottines.webp',
  'pub-4': '/demo/manette.webp',
  'pub-5': '/demo/montre.webp',
  'pub-6': '/demo/chaise.webp',
  'pub-7': '/demo/cafetiere.webp',
  'pub-8': '/demo/velo.webp',
};
const DEMO_AVATARS: Record<string, string> = {
  'demo-rep-2': '/demo/rep-karim.webp',
  'demo-rep-4': '/demo/rep-cycles.webp',
  'demo-rep-5': '/demo/rep-cordonnier.webp',
  'demo-rep-6': '/demo/rep-sofia.webp',
};

const cid = (slug: string) => DEMO_CATEGORIES.find((c) => c.slug === slug)!;
const pub = (
  id: string,
  title: string,
  slug: string,
  locationLabel: string,
  hoursAgo: number,
  description: string,
  budgetCents: number | null = null,
): PublicDemandeView => ({
  id,
  title,
  description,
  photos: DEMO_PHOTOS[id] ? [DEMO_PHOTOS[id]!] : [],
  category: { id: cid(slug).id, labelFr: cid(slug).labelFr },
  budgetCents,
  locationLabel,
  createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
});

const browse: PublicDemandeView[] = [
  pub('pub-1', 'Batterie de MacBook Air qui ne tient plus', 'ordinateur', 'Lyon 7e', 2, 'MacBook Air 2020, la batterie tient 40 minutes. Je cherche un remplacement avec une pièce de qualité.', 12000),
  pub('pub-2', 'Trottinette Xiaomi qui ne démarre plus', 'trottinettes-electriques', 'Villeurbanne', 5, 'Xiaomi Pro 2, plus rien ne s’allume depuis la pluie de mardi. Le chargeur clignote vert.'),
  pub('pub-3', 'Ressemeler des bottines en cuir', 'chaussures', 'Lyon 1er', 9, 'Bottines en cuir marron, semelle usée au talon. J’aimerais les garder encore quelques années.', 6000),
  pub('pub-4', 'Manette PS5 qui dérive', 'console', 'Caluire-et-Cuire', 20, 'Le joystick gauche bouge tout seul. Manette achetée il y a deux ans.'),
  pub('pub-5', 'Montre automatique qui retarde', 'montres-bijoux', 'Lyon 6e', 26, 'Elle perd environ 5 minutes par jour. Révision ou réglage ?'),
  pub('pub-6', 'Chaise en bois à recoller', 'meubles', 'Écully', 30, 'Chaise ancienne, un pied se décolle et le dossier bouge.', 4000),
  pub('pub-7', 'Cafetière Nespresso qui fuit', 'petit-electromenager', 'Lyon 8e', 44, 'De l’eau coule sous la machine pendant le café. Modèle Vertuo.'),
  pub('pub-8', 'Vélo : freins qui frottent', 'velos', 'Lyon 4e', 50, 'Les freins à disque frottent en permanence, roue avant surtout.'),
];

const card = (
  userId: string,
  displayName: string,
  serviceAreaLabel: string,
  rating: number | null,
  reviewCount: number,
  verifiedBadge: DirectoryCardDto['verifiedBadge'],
  distanceKm: number | null,
): DirectoryCardDto => ({
  userId,
  displayName,
  serviceAreaLabel,
  username: displayName.toLowerCase().replace(/[^a-z]+/g, '.'),
  verifiedBadge,
  rating,
  reviewCount,
  avatarUrl: DEMO_AVATARS[userId] ?? null,
  distanceKm,
});

const repairers: DirectoryCardDto[] = [
  card('demo-rep-1', 'Atelier Phone Lyon', 'Lyon et alentours', 4.9, 37, 'BUSINESS', 1.8),
  card('demo-rep-3', 'Répar’Express Part-Dieu', 'Lyon 3e', 4.8, 64, 'BUSINESS', 2.6),
  card('demo-rep-2', 'Karim R.', 'Lyon, Villeurbanne', 4.7, 12, 'IDENTITY', 3.4),
  card('demo-rep-4', 'Cycles Croix-Rousse', 'Lyon 4e', 4.9, 51, 'BUSINESS', 4.1),
  card('demo-rep-5', 'Cordonnerie des Terreaux', 'Lyon 1er', 4.6, 23, 'BUSINESS', 2.2),
  card('demo-rep-6', 'Sofia M.', 'Villeurbanne', 5, 6, 'IDENTITY', 5.3),
  card('demo-rep-7', 'ÉlectroDépannage 69', 'Métropole de Lyon', 4.5, 19, 'BUSINESS', 6.8),
  card('demo-rep-8', 'Théo L.', 'Caluire-et-Cuire', null, 0, 'IDENTITY', 7.5),
];

const SPECIALITIES: Record<string, string[]> = {
  'demo-rep-1': ['Smartphones', 'Ordinateurs', 'Consoles'],
  'demo-rep-3': ['Smartphones', 'Ordinateurs'],
  'demo-rep-2': ['Smartphones', 'Télévisions'],
  'demo-rep-4': ['Vélos', 'Trottinettes électriques'],
  'demo-rep-5': ['Chaussures'],
  'demo-rep-6': ['Montres & bijoux'],
  'demo-rep-7': ['Petit électroménager'],
  'demo-rep-8': ['Meubles'],
};

function profile(userId: string): RepairerProfileDto | undefined {
  const c = repairers.find((r) => r.userId === userId);
  if (!c) return undefined;
  return {
    ...c,
    bannerUrl: null,
    serviceRadiusKm: 15,
    availability: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
      dayOfWeek,
      closed: dayOfWeek === 0,
      opensAt: dayOfWeek === 0 ? null : 9 * 60,
      closesAt: dayOfWeek === 0 ? null : dayOfWeek === 6 ? 13 * 60 : 19 * 60,
    })),
    bio:
      'Réparateur depuis plus de dix ans. Diagnostic gratuit, pièces de qualité et garantie sur chaque intervention. Je vous explique toujours ce que je fais avant de commencer.',
    repairCount: c.reviewCount * 3,
    repairerSince: new Date(Date.now() - 400 * DAY).toISOString(),
    specialities: SPECIALITIES[userId] ?? [],
  } as unknown as RepairerProfileDto;
}

const reviews: ReviewDto[] = [
  { id: 'rv1', authorName: 'Camille D.', rating: 5, qualityRating: 5, delayRating: 5, communicationRating: 5, comment: 'Écran changé en une heure, comme neuf. Très pro et de bon conseil.', createdAt: ago(6) },
  { id: 'rv2', authorName: 'Julien P.', rating: 5, qualityRating: 5, delayRating: 4, communicationRating: 5, comment: 'Prix annoncé respecté, explications claires. Je recommande.', createdAt: ago(19) },
  { id: 'rv3', authorName: 'Nadia B.', rating: 4, qualityRating: 4, delayRating: 4, communicationRating: 5, comment: 'Bonne réparation, un jour de plus que prévu mais j’ai été prévenue.', createdAt: ago(33) },
] as unknown as ReviewDto[];

const me = {
  id: 'demo-user',
  email: 'lea@example.com',
  name: 'Léa Martin',
  firstName: 'Léa',
  lastName: 'Martin',
  username: 'lea.m',
  phone: '06 12 34 56 78',
  emailVerified: true,
  phoneVerified: true,
  profile: { activeMode: 'CLIENT' as 'CLIENT' | 'REPAIRER', clientEnabled: true, repairerEnabled: true },
  messagingEnabled: true,
  shippingQuotesEnabled: false,
  stripeTestMode: true,
  repairer: {
    kind: 'PRO' as 'PRO' | 'INDIVIDUAL',
    displayName: 'Atelier Léa Répare',
    bio: 'Réparation de smartphones et petit électroménager depuis 2016, à Lyon 3e.',
    postalCode: '69003' as string | null,
    serviceAreaLabel: 'Lyon 3e' as string | null,
    serviceRadiusKm: 15 as number | null,
    categoryIds: [] as string[],
    availability: [] as { dayOfWeek: number; closed: boolean; opensAt: number | null; closesAt: number | null }[],
  },
};

/* ---------- Réparateur side ---------- */
const dAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const proCommandes = [
  { id: 'cmd-1', demandeId: 'pub-1', demandeTitle: 'Batterie de MacBook Air qui ne tient plus', counterpartyName: 'Sofia B.', delivery: 'WORKSHOP', step: 'PAID', status: 'PAID', payoutCents: 10560, totalCents: 12900, createdAt: dAgo(1), releasedAt: null, disputeOpen: false },
  { id: 'cmd-2', demandeId: 'pub-4', demandeTitle: 'Manette PS5 qui dérive', counterpartyName: 'Hugo L.', delivery: 'HOME', step: 'REPAIR_DONE', status: 'PAID', payoutCents: 3960, totalCents: 5000, createdAt: dAgo(4), releasedAt: null, disputeOpen: false },
  { id: 'cmd-3', demandeId: 'pub-7', demandeTitle: 'Cafetière Nespresso qui fuit', counterpartyName: 'Nadia K.', delivery: 'WORKSHOP', step: 'RELEASED', status: 'PAID', payoutCents: 5280, totalCents: 6600, createdAt: dAgo(12), releasedAt: dAgo(8), disputeOpen: false },
  { id: 'cmd-4', demandeId: 'pub-8', demandeTitle: 'Vélo : freins qui frottent', counterpartyName: 'Tom R.', delivery: 'WORKSHOP', step: 'RELEASED', status: 'PAID', payoutCents: 3080, totalCents: 3900, createdAt: dAgo(20), releasedAt: dAgo(17), disputeOpen: false },
];
const proOffers = [
  { id: 'po-1', demandeId: 'pub-2', demandeTitle: 'Trottinette Xiaomi qui ne démarre plus', priceCents: 7500, delayHours: 48, status: 'SENT', createdAt: dAgo(0.3) },
  { id: 'po-2', demandeId: 'pub-5', demandeTitle: 'Montre automatique qui retarde', priceCents: 9000, delayHours: 168, status: 'SENT', createdAt: dAgo(2) },
  { id: 'po-3', demandeId: 'pub-1', demandeTitle: 'Batterie de MacBook Air qui ne tient plus', priceCents: 11900, delayHours: 48, status: 'ACCEPTED', createdAt: dAgo(3) },
  { id: 'po-4', demandeId: 'pub-6', demandeTitle: 'Chaise en bois à recoller', priceCents: 6000, delayHours: 336, status: 'REJECTED', createdAt: dAgo(9) },
];
const proQuotes = [
  { demandeId: 'pub-3', title: 'Ressemeler des bottines en cuir', clientName: 'Claire M.', status: 'OPEN', expiresAt: null, closedReason: null, liveQuote: null, createdAt: dAgo(0.5) },
];
function commandeDto(id: string) {
  const c = proCommandes.find((x) => x.id === id);
  if (!c) return undefined;
  const repairCents = Math.round(c.totalCents / 1.045 - 290);
  return {
    ...c,
    offerId: 'po-x',
    repairerName: me.repairer.displayName,
    repairCents,
    shippingCents: 0,
    protectionCents: c.totalCents - repairCents,
    executionDelayPreference: 'IMMEDIATE',
    withdrawalWaiverAcceptedAt: null,
    withdrawalPeriodEndsAt: null,
    viewerRole: me.profile.activeMode === 'REPAIRER' ? 'REPAIRER' : 'CLIENT',
    paidAt: c.createdAt,
    releaseRequestedAt: null,
    returnSentAt: null,
    refundedAt: null,
    refundedCents: null,
    outboundTrackingNumber: null,
    returnTrackingNumber: null,
    myAddressSubmitted: false,
    paymentUnderReview: false,
    reviewed: false,
    disputeOpenedAt: null,
    hasStripeTransfer: c.step === 'RELEASED',
  };
}
const NEXT: Record<string, string> = { PAID: 'REPAIR_STARTED', REPAIR_STARTED: 'REPAIR_DONE', REPAIR_DONE: 'AWAITING_VALIDATION', AWAITING_VALIDATION: 'RELEASED' };

function demoPro(method: string, p: string, body: unknown): unknown {
  if (method === 'GET') {
    if (p === '/repairers/me/dashboard') {
      return {
        todo: [
          { kind: 'ATTENTION', count: 1, commandeId: 'cmd-1' },
          { kind: 'QUOTE_REQUESTS', count: 1 },
          { kind: 'MATCHING', count: 6 },
        ],
        activity: [
          { kind: 'OFFER_ACCEPTED', at: dAgo(1), commandeId: 'cmd-1', subject: 'Batterie de MacBook Air', amountCents: null, rating: null },
          { kind: 'FUNDS_RELEASED', at: dAgo(8), commandeId: 'cmd-3', subject: 'Cafetière Nespresso', amountCents: 5280, rating: null },
          { kind: 'REVIEW_RECEIVED', at: dAgo(7.5), commandeId: 'cmd-3', subject: 'Cafetière Nespresso', amountCents: null, rating: 5 },
          { kind: 'FUNDS_RELEASED', at: dAgo(17), commandeId: 'cmd-4', subject: 'Vélo : freins', amountCents: 3080, rating: null },
        ],
      };
    }
    if (p === '/commandes') return proCommandes;
    const cm = p.match(/^\/commandes\/([^/]+)$/);
    if (cm) return commandeDto(cm[1]!) ?? commandeDto('cmd-1');
    if (p === '/offers/mine') return proOffers;
    if (p === '/connect/status') return { status: 'ENABLED', entityType: 'individual', transfersActive: false, lastSyncedAt: null };
    if (p === '/repairers/me/quote-requests') return proQuotes;
    if (p === '/users/me/particular-quota') return { quota: null, offerBlockedMessage: null };
    const dm = p.match(/^\/demandes\/(pub-[^/]+)$/);
    if (dm) {
      const b = browse.find((x) => x.id === dm[1]);
      if (b) return { ...b, brand: null, model: null, parts: 'UNKNOWN', mode: b.budgetCents ? 'BUDGET' : 'OFFERS', postalCode: '69000', status: 'OPEN', commande: null, offerCount: 2, photoUrls: [], distanceKm: 3.2, author: null, quoteRequest: null, isPrivate: false };
    }
    return undefined;
  }
  if (/^\/demandes\/[^/]+\/offers$/.test(p)) return { id: `po-${Date.now()}` };
  const step = p.match(/^\/commandes\/([^/]+)\/steps$/);
  if (step) {
    const c = proCommandes.find((x) => x.id === step[1]);
    if (c) c.step = (body as { step: string }).step;
    return commandeDto(step[1]!);
  }
  const rel = p.match(/^\/commandes\/([^/]+)\/release$/);
  if (rel) {
    const c = proCommandes.find((x) => x.id === rel[1]);
    if (c) c.step = 'RELEASED';
    return commandeDto(rel[1]!);
  }
  if (/^\/commandes\/[^/]+\/review$/.test(p)) return { ok: true };
  if (p === '/connect/onboarding') return { clientSecret: 'demo', publishableKey: 'demo', url: '/tableau-de-bord' };
  if (p === '/repairers/me/dashboard-seen') return { ok: true };
  if (/^\/demandes\/[^/]+\/quote\//.test(p)) {
    proQuotes.length = 0;
    return { ok: true };
  }
  if (/^\/offers\/[^/]+$/.test(p) && method === 'DELETE') {
    const o = proOffers.find((x) => p.endsWith(x.id));
    if (o) o.status = 'WITHDRAWN';
    return null;
  }
  if (p === '/users/me/repairer-profile' || p === '/users/me/repairer') {
    Object.assign(me.repairer, body as object);
    return me;
  }
  if (p === '/users/me/categories') {
    me.repairer.categoryIds = (body as { categoryIds: string[] }).categoryIds;
    return me;
  }
  if (p === '/users/me/availability') {
    me.repairer.availability = (body as { days: typeof me.repairer.availability }).days;
    return me;
  }
  if (p === '/users/me/modes') {
    const b = body as { activeMode?: 'CLIENT' | 'REPAIRER'; kind?: 'PRO' | 'INDIVIDUAL' };
    if (b.activeMode) me.profile.activeMode = b.activeMode;
    if (b.kind) me.repairer.kind = b.kind;
    return me;
  }
  return undefined;
}
void NEXT;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));


/* Messages: two conversations, the first one with an offer recap. */
const minAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const threads: Record<string, ConversationDto> = {
  'demo-conv-1': {
    id: 'demo-conv-1',
    demandeId: 'demo-ecran',
    counterpartName: 'Atelier Phone Lyon',
    counterpartUserId: 'demo-rep-2',
    counterpartIsRepairer: true,
    subject: 'Écran iPhone 13 fissuré',
    offerRecap: null,
    messages: [
      { id: 'm1', body: 'Bonjour, votre écran est-il encore tactile malgré la fissure ?', kind: 'USER', mine: false, createdAt: minAgo(95) },
      { id: 'm2', body: 'Oui, il fonctionne, mais la fissure descend jusqu’en bas.', kind: 'USER', mine: true, createdAt: minAgo(80) },
      { id: 'm3', body: 'Parfait. Je peux le faire en 1 jour avec une pièce d’origine. Passez quand vous voulez à l’atelier.', kind: 'USER', mine: false, createdAt: minAgo(12) },
    ],
    blocked: { active: false, byMe: false },
  } as unknown as ConversationDto,
  'demo-conv-2': {
    id: 'demo-conv-2',
    demandeId: null,
    counterpartName: 'Karim R.',
    counterpartUserId: 'demo-rep-1',
    counterpartIsRepairer: true,
    subject: 'Question sur une trottinette',
    offerRecap: null,
    messages: [
      { id: 'n1', body: 'Bonjour, réparez-vous les freins de trottinette Xiaomi ?', kind: 'USER', mine: true, createdAt: minAgo(60 * 26) },
      { id: 'n2', body: 'Oui, publiez une demande et je vous fais une offre.', kind: 'USER', mine: false, createdAt: minAgo(60 * 25) },
    ],
    blocked: { active: false, byMe: false },
  } as unknown as ConversationDto,
};
const inbox = (): ConversationListItem[] =>
  Object.values(threads).map((t) => {
    const last = t.messages[t.messages.length - 1]!;
    return {
      id: t.id,
      demandeId: t.demandeId,
      counterpartName: t.counterpartName,
      subject: t.subject,
      preview: last.body,
      lastMessageAt: last.createdAt,
      unread: t.id === 'demo-conv-1' ? 1 : 0,
      avatarUrl: null,
      userRole: 'CLIENT',
    } as ConversationListItem;
  });

export async function demoGet<T>(path: string): Promise<T> {
  await wait(150);
  const p = path.split('?')[0]!;
  const pro = demoPro('GET', p, undefined);
  if (pro !== undefined) return pro as T;
  if (p === '/users/me') return me as T;
  if (p === '/categories') return DEMO_CATEGORIES as T;
  if (p === '/demandes/mine') return demandes as T;
  if (p === '/offers/received') {
    return offers.map((o) => ({
      id: o.id,
      demandeId: 'demo-ecran',
      demandeTitle: 'Écran iPhone 13 fissuré',
      repairerName: o.repairerName,
      priceCents: o.priceCents,
      delayHours: o.delayHours,
      status: 'SENT',
      createdAt: o.createdAt,
    })) as T;
  }
  if (p === '/conversations') return inbox() as T;
  const conv = p.match(/^\/conversations\/([^/]+)$/);
  if (conv && threads[conv[1]!]) return threads[conv[1]!] as T;
  if (p === '/favorites/repairers') return repairers.slice(2, 4) as T;
  if (p === '/favorites/demandes') {
    return browse.slice(4, 6).map((d) => ({
      id: d.id,
      title: d.title,
      categoryLabelFr: d.category.labelFr,
      locationLabel: d.locationLabel,
      brand: null,
      model: null,
      mode: d.budgetCents === null ? 'OFFERS' : 'BUDGET',
      budgetCents: d.budgetCents,
      distanceKm: null,
      offerCount: 0,
      hasMyOffer: false,
      photoUrl: d.photos?.[0] ?? null,
      createdAt: d.createdAt,
      status: 'OPEN',
    })) as T;
  }
  const q = new URLSearchParams(path.split('?')[1] ?? '');
  const inCategory = (categoryId: string | null, label: string) => {
    if (!categoryId) return true;
    const c = DEMO_CATEGORIES.find((x) => x.id === categoryId);
    if (!c) return true;
    if (c.parentId === null) return DEMO_CATEGORIES.some((x) => x.parentId === c.id && x.labelFr === label);
    return c.labelFr === label;
  };
  const text = (q.get('q') ?? '').toLowerCase();
  if (p === '/demandes/browse') {
    return browse.filter(
      (d) => inCategory(q.get('categoryId'), d.category.labelFr) && (!text || `${d.title} ${d.description}`.toLowerCase().includes(text)),
    ) as T;
  }
  if (p === '/repairers') {
    return repairers.filter(
      (r) =>
        (!q.get('categoryId') || (SPECIALITIES[r.userId] ?? []).some((l) => inCategory(q.get('categoryId'), l))) &&
        (!text || `${r.displayName} ${(SPECIALITIES[r.userId] ?? []).join(' ')}`.toLowerCase().includes(text)),
    ) as T;
  }
  const reviewsMatch = p.match(/^\/repairers\/([^/]+)\/reviews$/);
  if (reviewsMatch) return (profile(reviewsMatch[1]!)?.reviewCount ? reviews : []) as T;
  const profileMatch = p.match(/^\/repairers\/([^/]+)$/);
  if (profileMatch) {
    const pr = profile(profileMatch[1]!);
    if (pr) return pr as T;
  }
  const offersMatch = p.match(/^\/demandes\/([^/]+)\/offers$/);
  if (offersMatch) return (offersMatch[1] === 'demo-ecran' ? offers : []) as T;
  const detailMatch = p.match(/^\/demandes\/([^/]+)$/);
  if (detailMatch) {
    const d = detail(detailMatch[1]!);
    if (d) return d as T;
  }
  throw new Error(`Demo: no data for ${path}`);
}

export async function demoPost<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  await wait(400);
  const pro = demoPro(method, path, body);
  if (pro !== undefined) return pro as T;
  if (path === '/users/me/modes') {
    Object.assign(me.profile, body as object);
    return me as T;
  }
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
  const msg = path.match(/^\/conversations\/([^/]+)\/messages$/);
  if (msg && threads[msg[1]!]) {
    const m = { id: `m${Date.now()}`, body: (body as { body: string }).body, kind: 'USER', mine: true, createdAt: new Date().toISOString() };
    threads[msg[1]!] = { ...threads[msg[1]!]!, messages: [...threads[msg[1]!]!.messages, m as never] };
    return m as T;
  }
  if (path === '/conversations') return { id: 'demo-conv-1' } as T;
  if (/^\/conversations\/[^/]+\/read$/.test(path)) return null as T;
  if (/^\/offers\/[^/]+\/checkout$/.test(path)) {
    return { paymentIntentClientSecret: 'demo', commandeId: '00000000-0000-4000-8000-000000000001', isTestMode: true } as T;
  }
  throw new Error(`Demo: ${path} is not available in demo mode`);
}
