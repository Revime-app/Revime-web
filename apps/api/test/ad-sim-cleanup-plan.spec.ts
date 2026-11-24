import { describe, expect, it } from 'vitest';
import {
  notificationWhere,
  offerWhere,
  profileRestores,
  SIM_PRESETS,
} from '../scripts/ad-sim-cleanup/plan.mjs';
import { REPAIRERS, TUNED_OFFERS } from '../scripts/seed-demo/cast.mjs';

/**
 * CF2-28 removal. The simulation borrowed the eight seed-demo réparateurs, so every predicate
 * here must reach the simulation's rows and NEVER the seed's own - the seed puts four of those
 * same réparateurs' offers (TUNED_OFFERS) on the client's real demande.
 */
const IDS = Object.fromEntries(SIM_PRESETS.map((p, i) => [p.key, `user-${i}`]));

describe('SIM_PRESETS', () => {
  it('covers exactly the eight seed-demo réparateurs, by key', () => {
    expect(SIM_PRESETS.map((p) => p.key).sort()).toEqual(REPAIRERS.map((r) => r.key).sort());
  });
});

describe('profileRestores', () => {
  it('restores displayName and postalCode from cast.mjs for all eight', () => {
    const restores = profileRestores();
    expect(restores).toHaveLength(8);
    for (const r of REPAIRERS) {
      expect(restores).toContainEqual({ email: r.email, displayName: r.displayName, postalCode: r.postalCode });
    }
  });
});

describe('offerWhere', () => {
  const where = offerWhere(IDS);

  it('matches each preset by réparateur AND price AND comment, never by réparateur alone', () => {
    expect(where.OR).toHaveLength(8);
    for (const arm of where.OR) {
      expect(Object.keys(arm).sort()).toEqual(['comment', 'priceCents', 'repairerUserId']);
    }
  });

  it('never matches a seeded tuned offer', () => {
    for (const tuned of TUNED_OFFERS) {
      const hit = where.OR.some(
        (arm: { repairerUserId: string; priceCents: number; comment: string }) =>
          arm.repairerUserId === IDS[tuned.repairerKey] &&
          arm.priceCents === tuned.priceCents &&
          arm.comment === tuned.comment,
      );
      expect(hit).toBe(false);
    }
  });

  it('refuses offers that a commande hangs off, because Commande cascades from Offer', () => {
    expect(where.commandes).toEqual({ none: {} });
  });

  it('throws when a réparateur id is missing rather than building a looser predicate', () => {
    const { voltaire: _omit, ...partial } = IDS;
    expect(() => offerWhere(partial)).toThrow(/voltaire/);
  });
});

describe('notificationWhere', () => {
  const where = notificationWhere();

  it('is OFFER_RECEIVED only, matched on display name AND amount', () => {
    expect(where.type).toBe('OFFER_RECEIVED');
    expect(where.OR).toHaveLength(8);
    for (const arm of where.OR) {
      expect(Object.keys(arm).sort()).toEqual(['actorName', 'amountCents']);
    }
  });

  it('never matches a notification the seed created for a tuned offer', () => {
    for (const tuned of TUNED_OFFERS) {
      const name = REPAIRERS.find((r) => r.key === tuned.repairerKey)!.displayName;
      const hit = where.OR.some(
        (arm: { actorName: string; amountCents: number }) =>
          arm.actorName === name && arm.amountCents === tuned.priceCents,
      );
      expect(hit).toBe(false);
    }
  });
});
