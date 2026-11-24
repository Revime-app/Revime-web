// apps/api/scripts/seed-demo/plan-history.mjs
import { randomUUID } from 'node:crypto';
import { CLIENTS, EXISTING_REPAIRERS, REPAIRERS } from './cast.mjs';
import { buildCommandeShape } from './commande-shape.mjs';

const DELIVERIES = ['WORKSHOP', 'HOME', 'PARCEL'];
const PRICES = [4500, 6900, 8000, 9500, 12000, 15900];

const TITLES = [
  'Remplacement écran',
  'Changement de batterie',
  'Réparation carte mère',
  'Nettoyage et révision',
  'Connecteur de charge',
  'Remise en état complète',
];

const COMMENTS = [
  'Travail rapide et propre, je recommande.',
  "Très bon contact, devis respecté à l'euro près.",
  'Réparation impeccable, appareil comme neuf.',
  "Un peu de retard sur le délai annoncé mais le résultat est là.",
  "Explications claires sur ce qui avait lâché. Parfait.",
  null,
];

/**
 * Expands the cast's review plan into its substrate. Each review needs its own
 * commande, which needs its own accepted offer and demande -- Review.commandeId is
 * @unique and required.
 *
 * The demandes are DONE, which is what keeps 36 rows out of the reparateur feed.
 * They exist only so ratings and repair counts have something real behind them.
 */
export function planHistory({ repairerIds, clientIds, categoryId, now }) {
  const demandes = [];
  const offers = [];
  const commandes = [];
  const reviews = [];
  let n = 0;

  const all = [
    ...REPAIRERS.map((r) => ({ key: r.key, ratings: r.ratings })),
    ...EXISTING_REPAIRERS.map((r) => ({ key: r.key, ratings: r.ratings })),
  ];

  for (const rep of all) {
    const repairerUserId = repairerIds[rep.key];
    if (!repairerUserId) {
      throw new Error(`No id for réparateur ${rep.key}`);
    }

    rep.ratings.forEach((rating, i) => {
      n += 1;
      // Round-robin the authoring client, skipping nobody, so no client owns all of one
      // reparateur's history.
      const client = CLIENTS[n % CLIENTS.length];
      const clientUserId = clientIds[client.key];

      // Oldest first, spread back over ~150 days from `now`.
      const daysAgo = 8 + ((n * 4) % 142);
      const paidAt = new Date(now.getTime() - daysAgo * 86_400_000);

      const demandeId = randomUUID();
      const offerId = randomUUID();
      const commandeId = randomUUID();
      const repairCents = PRICES[n % PRICES.length];
      const delivery = DELIVERIES[n % DELIVERIES.length];

      demandes.push({
        id: demandeId,
        authorUserId: clientUserId,
        categoryId,
        brand: null,
        model: null,
        title: `${TITLES[n % TITLES.length]}`,
        description:
          "Demande archivée, conservée pour l'historique des réparations et les avis qui s'y rattachent.",
        parts: 'UNKNOWN',
        mode: 'OFFERS',
        budgetCents: null,
        locationLabel: `${client.postalCode}`,
        postalCode: client.postalCode,
        status: 'DONE',
        createdAt: new Date(paidAt.getTime() - 3 * 86_400_000),
      });

      offers.push({
        id: offerId,
        demandeId,
        repairerUserId,
        priceCents: repairCents,
        delayHours: 48,
        // CF-31: « Aucune ». This row is written through Prisma, so it BYPASSES the
        // create-time refusal and « 3 mois » would have persisted fine — but the
        // réparateur is at NONE, so `present` suppresses it on every read anyway. Stored
        // and displayed now agree, instead of the column holding a value no screen shows.
        warrantyLabel: 'Aucune',
        partsLabel: 'Pièce compatible',
        travel: delivery === 'HOME' ? 'HOME' : 'WORKSHOP',
        acceptsParcel: delivery === 'PARCEL',
        comment: null,
        status: 'ACCEPTED',
        createdAt: new Date(paidAt.getTime() - 2 * 86_400_000),
      });

      commandes.push({
        id: commandeId,
        ...buildCommandeShape({
          n,
          demandeId,
          offerId,
          clientUserId,
          repairerUserId,
          delivery,
          repairCents,
          paidAt,
        }),
      });

      reviews.push({
        id: randomUUID(),
        commandeId,
        authorUserId: clientUserId,
        repairerUserId,
        rating,
        // Sub-ratings on roughly two thirds of rows: both populated and absent are ordinary.
        qualityRating: i % 3 === 0 ? null : rating,
        delayRating: i % 3 === 0 ? null : Math.max(1, rating - (i % 2)),
        communicationRating: i % 3 === 0 ? null : rating,
        comment: rating <= 3 ? COMMENTS[3] : COMMENTS[n % COMMENTS.length],
        createdAt: new Date(paidAt.getTime() + 7 * 86_400_000),
        deletedAt: null,
      });
    });
  }

  return { demandes, offers, commandes, reviews };
}
