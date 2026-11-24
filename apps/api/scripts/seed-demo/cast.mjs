// apps/api/scripts/seed-demo/cast.mjs

/**
 * Deliberately NOT `@repareme.test`: the standing post-suite cleanup deletes that
 * pattern, and the two populations must be separable in both directions. See the
 * design section 9.
 */
export const DEMO_DOMAIN = 'demo.revime.fr';

/**
 * One password for every seeded account, read from SEED_DEMO_PASSWORD (never committed).
 * index.mjs refuses to seed without it.
 */
const PW = process.env.SEED_DEMO_PASSWORD ?? '';

const email = (local) => `${local}@${DEMO_DOMAIN}`;

export const REPAIRERS = [
  {
    key: 'voltaire',
    email: email('atelier.voltaire'),
    password: PW,
    name: 'Atelier Voltaire',
    displayName: 'Atelier Voltaire',
    bio: "Atelier indépendant spécialisé dans les smartphones et tablettes depuis 2014. Réparation en 48 h, pièces d'origine et garantie 12 mois sur toutes nos interventions.",
    postalCode: '75011',
    kind: 'PRO',
    level: 'BUSINESS',
    reviewCount: 8,
    ratings: [5, 5, 5, 5, 4, 5, 4, 5],
  },
  {
    key: 'karim',
    email: email('karim.mobile'),
    password: PW,
    name: 'Karim Benali',
    displayName: 'Karim Mobile Repair',
    bio: "Je me déplace chez vous dans le 17e et les arrondissements voisins. Écrans, batteries et connecteurs de charge, souvent réparés sur place en moins d'une heure.",
    postalCode: '75017',
    kind: 'INDIVIDUAL',
    level: 'IDENTITY',
    reviewCount: 4,
    ratings: [5, 4, 5, 4],
  },
  {
    key: 'smartfix',
    email: email('smartfix.levallois'),
    password: PW,
    name: 'SmartFix Levallois',
    displayName: 'SmartFix Levallois',
    bio: 'Boutique à Levallois-Perret. Smartphones, ordinateurs portables et consoles. Devis gratuit, tarifs parmi les plus bas de la petite couronne.',
    postalCode: '92300',
    kind: 'PRO',
    level: 'IDENTITY',
    reviewCount: 5,
    ratings: [5, 4, 4, 5, 3],
  },
  {
    key: 'lea',
    email: email('lea.dupuis'),
    password: PW,
    name: 'Léa Dupuis',
    displayName: 'Léa Dupuis',
    bio: "Réparatrice à Boulogne. Je travaille vite, souvent dans la journée, et je vous explique ce que j'ai changé.",
    postalCode: '92100',
    kind: 'INDIVIDUAL',
    level: 'BASIC',
    reviewCount: 2,
    ratings: [5, 4],
  },
  {
    key: 'croixrousse',
    email: email('reparation.croixrousse'),
    password: PW,
    name: 'Réparation Croix-Rousse',
    displayName: 'Réparation Croix-Rousse',
    bio: 'Électroménager à Lyon, gros et petit. Lave-linge, lave-vaisselle, four. Intervention à domicile sur toute la métropole.',
    postalCode: '69004',
    kind: 'PRO',
    level: 'BUSINESS',
    reviewCount: 6,
    ratings: [5, 5, 4, 5, 3, 5],
  },
  {
    key: 'bastide',
    email: email('cycles.bastide'),
    password: PW,
    name: 'Paul Bastide',
    displayName: 'Cycles Bastide',
    bio: 'Vélos électriques et trottinettes à Bordeaux. Diagnostic moteur et batterie, remise en état complète.',
    postalCode: '33000',
    kind: 'INDIVIDUAL',
    level: 'IDENTITY',
    reviewCount: 3,
    ratings: [5, 4, 5],
  },
  {
    key: 'marchand',
    email: email('horlogerie.marchand'),
    password: PW,
    name: 'Élise Marchand',
    displayName: 'Horlogerie Marchand',
    bio: "Horlogère à Nantes. Montres mécaniques et à quartz, bracelets, étanchéité. Travail à l'ancienne, devis avant toute intervention.",
    postalCode: '44000',
    kind: 'INDIVIDUAL',
    level: 'BASIC',
    reviewCount: 2,
    ratings: [4, 2],
  },
  {
    /**
     * ZERO reviews, on purpose. A brand-new reparateur is a state the client will
     * meet on day one, and a world where everyone is established is the more
     * misleading fiction. See the design section 5.1.
     */
    key: 'vieuxport',
    email: email('atelier.vieuxport'),
    password: PW,
    name: 'Yanis Amrani',
    displayName: 'Atelier du Vieux-Port',
    bio: "Nouveau sur Revime. Petit électroménager et instruments de musique, atelier dans le 7e à Marseille.",
    postalCode: '13007',
    kind: 'INDIVIDUAL',
    level: 'BASIC',
    reviewCount: 0,
    ratings: [],
  },
];

/**
 * The two reparateur profiles that ALREADY EXIST. Not created by Phase 1 -- Task 7
 * renames one and raises the other's level -- but they carry reviews, so the review
 * plan has to know about them.
 */
export const EXISTING_REPAIRERS = [
  { key: 'testr', reviewCount: 2, ratings: [4, 5] },
  { key: 'owner', reviewCount: 4, ratings: [5, 5, 4, 5] },
];

export const CLIENTS = [
  { key: 'camille', email: email('camille.robert'), password: PW, name: 'Camille Robert', postalCode: '75012' },
  { key: 'thomas', email: email('thomas.perrin'), password: PW, name: 'Thomas Perrin', postalCode: '69006' },
  { key: 'aicha', email: email('aicha.diallo'), password: PW, name: 'Aïcha Diallo', postalCode: '13008' },
  { key: 'julien', email: email('julien.moreau'), password: PW, name: 'Julien Moreau', postalCode: '33000' },
  { key: 'sophie', email: email('sophie.lambert'), password: PW, name: 'Sophie Lambert', postalCode: '59000' },
  { key: 'mehdi', email: email('mehdi.haddad'), password: PW, name: 'Mehdi Haddad', postalCode: '44100' },
];

export const OPEN_DEMANDES = [
  {
    clientKey: 'camille',
    categorySlug: 'smartphone',
    brand: 'Samsung',
    model: 'Galaxy S24',
    title: 'Écran fissuré en bas à droite',
    description: "Le téléphone est tombé sur du carrelage. L'écran est fissuré en bas à droite et le tactile ne répond plus dans ce coin. Tout le reste fonctionne normalement.",
    parts: 'ORIGINAL',
    mode: 'OFFERS',
    locationLabel: 'Paris 75012',
    postalCode: '75012',
  },
  {
    clientKey: 'thomas',
    categorySlug: 'ordinateur',
    brand: 'Apple',
    model: 'MacBook Air M1',
    title: 'Ne charge plus du tout',
    description: "Depuis une semaine le chargeur ne fait plus rien, aucune LED, aucune réaction. J'ai essayé deux câbles différents et une autre prise, sans résultat.",
    parts: 'UNKNOWN',
    mode: 'BUDGET',
    budgetCents: 15000,
    locationLabel: 'Lyon 69006',
    postalCode: '69006',
  },
  {
    clientKey: 'aicha',
    categorySlug: 'electromenager',
    brand: 'Bosch',
    model: 'Serie 6',
    title: 'Lave-linge qui ne vidange plus',
    description: "Le tambour tourne mais l'eau reste au fond en fin de cycle. Il y a un bruit de pompe qui force. J'ai nettoyé le filtre, ça n'a rien changé.",
    parts: 'COMPATIBLE',
    mode: 'OFFERS',
    locationLabel: 'Marseille 13008',
    postalCode: '13008',
  },
  {
    clientKey: 'julien',
    categorySlug: 'velos-electriques',
    brand: 'Decathlon',
    model: 'Elops 920 E',
    title: "Autonomie tombée à cinq kilomètres",
    description: "La batterie tenait quarante kilomètres il y a deux ans, aujourd'hui je fais cinq kilomètres et le vélo coupe. Je cherche à savoir si c'est la batterie ou le contrôleur.",
    parts: 'UNKNOWN',
    mode: 'OFFERS',
    locationLabel: 'Bordeaux 33000',
    postalCode: '33000',
  },
  {
    clientKey: 'sophie',
    categorySlug: 'console',
    brand: 'Sony',
    model: 'PlayStation 5',
    title: 'Ventilateur très bruyant',
    description: "La console fait un bruit de turbine au bout de dix minutes de jeu et finit par s'éteindre seule. Elle est dans un meuble ouvert, ce n'est pas un problème d'aération.",
    parts: 'COMPATIBLE',
    mode: 'OFFERS',
    locationLabel: 'Lille 59000',
    postalCode: '59000',
  },
  {
    clientKey: 'mehdi',
    categorySlug: 'montres-bijoux',
    brand: 'Seiko',
    model: 'SKX007',
    title: "Montre qui prend dix minutes d'avance",
    description: "Montre automatique héritée de mon père. Elle avance de dix minutes par jour depuis quelques mois. J'aimerais un réglage et une révision complète si nécessaire.",
    parts: 'ORIGINAL',
    mode: 'BUDGET',
    budgetCents: 12000,
    locationLabel: 'Nantes 44100',
    postalCode: '44100',
  },
  {
    clientKey: 'camille',
    categorySlug: 'instruments-musique',
    brand: 'Yamaha',
    model: 'P-125',
    title: 'Trois touches muettes sur le piano',
    description: "Trois touches dans le médium ne produisent plus aucun son, les autres fonctionnent. Le piano a été transporté récemment, c'est peut-être une nappe débranchée.",
    parts: 'UNKNOWN',
    mode: 'OFFERS',
    locationLabel: 'Paris 75012',
    postalCode: '75012',
  },
  {
    clientKey: 'thomas',
    categorySlug: 'petit-electromenager',
    brand: 'De Longhi',
    model: 'Magnifica S',
    title: 'Machine à café qui fuit par le bas',
    description: "Une flaque d'eau apparaît sous la machine à chaque utilisation. Le café coule normalement mais il y a une fuite quelque part dans le circuit.",
    parts: 'COMPATIBLE',
    mode: 'OFFERS',
    locationLabel: 'Lyon 69006',
    postalCode: '69006',
  },
  {
    clientKey: 'aicha',
    categorySlug: 'trottinettes-electriques',
    brand: 'Xiaomi',
    model: 'Mi Scooter 3',
    title: 'Frein arrière qui ne mord plus',
    description: "Le frein arrière ne freine presque plus, même en serrant à fond. Le câble semble détendu et le disque a peut-être besoin d'être remplacé.",
    parts: 'COMPATIBLE',
    mode: 'OFFERS',
    locationLabel: 'Marseille 13008',
    postalCode: '13008',
  },
  {
    clientKey: 'sophie',
    categorySlug: 'televisions',
    brand: 'LG',
    model: 'OLED55C1',
    title: "Bande verticale sur la moitié de l'écran",
    description: "Une bande verticale sombre est apparue sur le tiers droit de la dalle. Elle est visible sur toutes les sources, donc ce n'est pas le décodeur.",
    parts: 'ORIGINAL',
    mode: 'BUDGET',
    budgetCents: 30000,
    locationLabel: 'Lille 59000',
    postalCode: '59000',
  },
  {
    clientKey: 'julien',
    categorySlug: 'sacs-maroquinerie',
    brand: 'Longchamp',
    model: 'Le Pliage',
    title: 'Fermeture éclair arrachée',
    description: "La fermeture éclair du sac s'est arrachée d'un côté et la doublure commence à se découdre. Le cuir des poignées est encore en bon état.",
    parts: 'UNKNOWN',
    mode: 'OFFERS',
    locationLabel: 'Bordeaux 33000',
    postalCode: '33000',
  },
];

/**
 * The one TUNED table in this seed, against the real seven criteria
 * (compare-criteria.ts: Prix, Note, Délai, Distance, Déplacement, Vérifié,
 * Nb de réparations). Every offer wins at least one and none wins more than two.
 *
 * `delayHours` values are members of DELAY_OPTIONS -- 24/48/72/168/336.
 *
 * 🛑 CF-29, 2026-08-28: THAT IS NOW A CONVENTION, NOT A REQUIREMENT, and the sentence
 * this replaces was actively misleading. It said « The first draft of this table used
 * 12, which is not a slow delay but a 422. See the design section 5.3 amendment. »
 * `createOfferSchema` no longer holds an allowlist -- the client asked for « la
 * possibilité de choisir/modifier lui-même le délai » -- so it takes any integer from
 * 1 to DELAY_HOURS_MAX and **12 would be accepted today.** The design's 5.3 amendment
 * is history rather than a live constraint.
 *
 * The table stays on the five quick-fill values anyway, deliberately: the demo should
 * read like the offer form's own presets. Changing one is now a decision about how the
 * demo looks, and `seed-demo-cast.spec.ts` pins it as such.
 */
/**
 * 🛑 CF-31, 2026-08-25 — WHY EVERY WARRANTY BELOW IS « Aucune », AND THE DECISION IT IS
 * WAITING ON. Do not "restore" the old values without reading this.
 *
 * `POST /demandes/:id/offers` now refuses any garantie from a réparateur below
 * `BUSINESS` (`offers.service.ts`'s `assertWarrantyAllowed`), and `runPhase1` posts these
 * four over HTTP like a real réparateur. Every account this script creates is at **NONE**,
 * so the previous « 12 mois » / « 3 mois » / « 6 mois » values made the seed **fail with a
 * 403** rather than degrade.
 *
 * 🛑 **And the cast already declares who the professionals are — `kind` and `level` on
 * each REPAIRERS entry, three of them `PRO` + `BUSINESS`. NOTHING IN THIS SCRIPT READS
 * EITHER FIELD.** Verified by grep across all eleven `seed-demo/*.mjs` and confirmed
 * against the live database: 11 réparateur profiles, 11 `INDIVIDUAL`, 0 `BUSINESS`, and
 * `BusinessVerification` empty. Both fields have been dead since this file was written —
 * a pre-existing defect CF-31 merely surfaced, not one it caused.
 *
 * So the demo currently CANNOT show the feature the client asked for, and wiring it is an
 * **OWNER decision rather than a display fix**, for two reasons: it puts
 * « Professionnel vérifié » — a checked-trust badge — on three fabricated accounts, and
 * `runPhase1` is deliberately HTTP-only with no Prisma client, so granting a level before
 * the offer loop means either breaking that invariant or moving the write into phase 2 and
 * registering it in `MUTATIONS` so cleanup can undo it. Recorded on `CF-31`'s row.
 */
export const TUNED_OFFERS = [
  {
    repairerKey: 'voltaire',
    priceCents: 12900,
    delayHours: 48,
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: true,
    // The « garantie 12 mois » clause came OUT of this prose deliberately. It renders on
    // the same card as the suppressed field (`offres.tsx`), so leaving it would have the
    // demo promise in words what the offer withholds in data — the "copy asserts a fact"
    // failure `apps/mobile/AGENTS.md` records. His BIO still mentions a garantie and was
    // left: that is a general claim about his business on another screen, not a promise
    // attached to this offer.
    comment: "Écran d'origine Apple, remplacement complet du bloc. Dépôt à l'atelier, rendu sous 48 h.",
  },
  {
    repairerKey: 'karim',
    priceCents: 8900,
    delayHours: 48,
    warrantyLabel: 'Aucune',
    partsLabel: 'Pièce compatible',
    travel: 'HOME',
    acceptsParcel: false,
    comment: "Je passe chez vous dans le 17e, réparation sur place en une heure environ. Écran compatible de bonne qualité.",
  },
  {
    repairerKey: 'smartfix',
    priceCents: 7500,
    delayHours: 72,
    warrantyLabel: 'Aucune',
    partsLabel: 'Pièce compatible',
    travel: 'WORKSHOP',
    acceptsParcel: true,
    // « garantie 6 mois pièces et main d'oeuvre » removed for the reason on the voltaire
    // entry above: it would promise in prose what the suppressed field withholds.
    comment: "Meilleur tarif de la petite couronne. Écran compatible testé et vérifié pièce par pièce.",
  },
  {
    repairerKey: 'lea',
    priceCents: 9500,
    delayHours: 24,
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: false,
    comment: "Disponible demain matin, rendu dans la journée. Je vous montre la pièce retirée avant de refermer.",
  },
];
