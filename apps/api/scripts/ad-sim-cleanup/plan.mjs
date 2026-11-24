// apps/api/scripts/ad-sim-cleanup/plan.mjs
import { REPAIRERS } from '../seed-demo/cast.mjs';

/**
 * CF2-28 removal, 2026-10-02. What the deleted `ad-simulation.service.ts` wrote, as data.
 *
 * 🛑 The simulation did NOT have its own accounts. Its eight presets carried the eight
 * seed-demo réparateur e-mails (`cast.mjs`), so it reused those users and, on every run,
 * overwrote their `displayName`, `postalCode`, `lat` and `lng` with Paris values. Four of them
 * (Lyon, Bordeaux, Nantes, Marseille) were renamed outright.
 *
 * The seed ALSO puts four of these same réparateurs' offers on the client's real demande
 * (`TUNED_OFFERS`), so « offers from these eight on a non-demo demande » would delete seed data.
 * Every predicate below therefore matches on the exact price and comment (offers) or the exact
 * display name and amount (notifications) the simulation wrote, which no seeded row shares -
 * `test/ad-sim-cleanup-plan.spec.ts` pins that.
 */
export const SIM_PRESETS = [
  { key: 'voltaire', displayName: 'Atelier Voltaire', priceCents: 6500, comment: 'Disponible dès demain en atelier.' },
  { key: 'karim', displayName: 'Karim Mobile Repair', priceCents: 7200, comment: 'Je peux me déplacer directement chez vous.' },
  { key: 'smartfix', displayName: 'SmartFix Levallois', priceCents: 7800, comment: 'Réparation express garantie 1 an pièces et main d’œuvre.' },
  { key: 'lea', displayName: 'Léa Dupuis', priceCents: 8200, comment: 'Atelier à Boulogne, travail soigné et rapide.' },
  { key: 'croixrousse', displayName: 'Réparation Batignolles', priceCents: 8900, comment: 'Diagnostic préalable inclus dans le tarif.' },
  { key: 'bastide', displayName: 'Tech & Fix Bastille', priceCents: 9500, comment: 'Pièces certifiées constructeur avec traçabilité.' },
  { key: 'marchand', displayName: 'Atelier Marchand', priceCents: 9900, comment: 'Devis tout compris avec test complet après réparation.' },
  { key: 'vieuxport', displayName: 'Clinique High-Tech Neuilly', priceCents: 11000, comment: 'Service premium avec prêt d’appareil de courtoisie.' },
];

/** The seed's own values, which is what the profiles go back to. Coordinates are re-geocoded. */
export function profileRestores() {
  return REPAIRERS.map((r) => ({ email: r.email, displayName: r.displayName, postalCode: r.postalCode }));
}

/**
 * Simulated offers. `idsByKey` maps a preset key to that réparateur's user id.
 *
 * `commandes: { none: {} }` because `Commande` cascades from `Offer`: an offer someone actually
 * paid for must never disappear as a side effect of this cleanup. The dry run reports any
 * simulated offer it therefore skips.
 */
export function offerWhere(idsByKey) {
  return {
    commandes: { none: {} },
    OR: SIM_PRESETS.map((p) => {
      const id = idsByKey[p.key];
      if (!id) throw new Error(`No user id for preset "${p.key}". Refusing to build a looser predicate.`);
      return { repairerUserId: id, priceCents: p.priceCents, comment: p.comment };
    }),
  };
}

/** The OFFER_RECEIVED rows the simulation emitted: snapshotted display name plus amount. */
export function notificationWhere() {
  return {
    type: 'OFFER_RECEIVED',
    OR: SIM_PRESETS.map((p) => ({ actorName: p.displayName, amountCents: p.priceCents })),
  };
}
