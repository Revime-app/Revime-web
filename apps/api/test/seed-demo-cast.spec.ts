// apps/api/test/seed-demo-cast.spec.ts
import { describe, expect, it } from 'vitest';
import { DELAY_OPTIONS, PARTS_OPTIONS, WARRANTY_OPTIONS } from '@revime/shared';
import {
  CLIENTS,
  DEMO_DOMAIN,
  EXISTING_REPAIRERS,
  OPEN_DEMANDES,
  REPAIRERS,
  TUNED_OFFERS,
} from '../scripts/seed-demo/cast.mjs';

const DELAY_HOURS = DELAY_OPTIONS.map((o) => o.hours);

describe('the seeded population is separable', () => {
  it('puts every seeded account on the demo domain and never on repareme.test', () => {
    for (const a of [...REPAIRERS, ...CLIENTS]) {
      expect(a.email.endsWith(`@${DEMO_DOMAIN}`)).toBe(true);
      expect(a.email).not.toContain('repareme.test');
    }
  });

  it('has 8 seeded reparateurs and 6 seeded clients', () => {
    expect(REPAIRERS).toHaveLength(8);
    expect(CLIENTS).toHaveLength(6);
  });
});

describe('every offer field the API still closes is a member of its enum', () => {
  /**
   * 🛑 AMENDED BY CF-29, 2026-08-28, AND THE OLD COMMENT HERE WAS THE DANGEROUS KIND -
   * true when written, and a false claim about the server by the time you read it.
   *
   * It read: « This is the test that would have caught the 12-hour delay the spec's
   * section 5.3 amendment records. A wrong value here typechecks cleanly and only
   * fails against a running API, as a 422. » The client asked to choose his own délai,
   * so `createOfferSchema` now takes any integer from 1 to `DELAY_HOURS_MAX` and
   * **12 hours is a perfectly valid delay.** Anyone acting on the old sentence would
   * have believed a non-preset delay still 422s, which is the one thing it no longer does.
   *
   * The `delayHours` assertion below therefore still passes but has CHANGED MEANING:
   * it now pins a SEED CONVENTION - the tuned table stays on the five quick-fill values
   * so the demo reads like the form's own presets - rather than a server constraint.
   * Breaking it is a decision about the demo, not a 422. `warrantyLabel` and
   * `partsLabel` are still genuinely closed enums, so for those two the original
   * reasoning holds unchanged.
   */
  it('pins delayHours, warrantyLabel and partsLabel on the tuned offers', () => {
    for (const o of TUNED_OFFERS) {
      expect(DELAY_HOURS).toContain(o.delayHours);
      expect(WARRANTY_OPTIONS).toContain(o.warrantyLabel);
      expect(PARTS_OPTIONS).toContain(o.partsLabel);
      expect(typeof o.acceptsParcel).toBe('boolean');
    }
  });
});

describe('the four tuned offers make Comparaison worth looking at', () => {
  it('gives a unique winner on Prix, Délai and Déplacement', () => {
    const cheapest = Math.min(...TUNED_OFFERS.map((o) => o.priceCents));
    expect(TUNED_OFFERS.filter((o) => o.priceCents === cheapest)).toHaveLength(1);

    const fastest = Math.min(...TUNED_OFFERS.map((o) => o.delayHours));
    expect(TUNED_OFFERS.filter((o) => o.delayHours === fastest)).toHaveLength(1);

    expect(TUNED_OFFERS.filter((o) => o.travel === 'HOME')).toHaveLength(1);
  });

  it('spreads the wins so no single offer sweeps the board', () => {
    const cheapest = TUNED_OFFERS.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b));
    const fastest = TUNED_OFFERS.reduce((a, b) => (a.delayHours <= b.delayHours ? a : b));
    const home = TUNED_OFFERS.find((o) => o.travel === 'HOME');
    if (!home) throw new Error('no tuned offer travels HOME, so Déplacement has no winner');
    expect(new Set([cheapest.repairerKey, fastest.repairerKey, home.repairerKey]).size).toBe(3);
  });

  it('includes exactly one unbadged reparateur, so « Non » appears in the Vérifié row', () => {
    const levels = TUNED_OFFERS.map((o) => {
      const repairer = REPAIRERS.find((r) => r.key === o.repairerKey);
      // A tuned offer naming a réparateur who is not in the cast would otherwise read
      // as « no unbadged réparateur » rather than as the broken reference it is.
      if (!repairer) throw new Error(`TUNED_OFFERS names "${o.repairerKey}", absent from REPAIRERS`);
      return repairer.level;
    });
    expect(levels.filter((l) => l === 'BASIC' || l === 'NONE')).toHaveLength(1);
  });
});

describe('the review plan gives the histogram shape', () => {
  it('totals 36 across the ten visible reparateurs', () => {
    const all = [...REPAIRERS, ...EXISTING_REPAIRERS];
    expect(all).toHaveLength(10);
    expect(all.reduce((n, r) => n + r.reviewCount, 0)).toBe(36);
  });

  it('leaves exactly one reparateur with no reviews at all', () => {
    const all = [...REPAIRERS, ...EXISTING_REPAIRERS];
    expect(all.filter((r) => r.reviewCount === 0)).toHaveLength(1);
  });

  it('declares a ratings multiset matching each declared count', () => {
    for (const r of [...REPAIRERS, ...EXISTING_REPAIRERS]) {
      expect(r.ratings).toHaveLength(r.reviewCount);
      for (const v of r.ratings) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('includes ratings below 4 somewhere, or every histogram is one bar', () => {
    const every = [...REPAIRERS, ...EXISTING_REPAIRERS].flatMap((r) => r.ratings);
    expect(every.some((v) => v <= 3)).toBe(true);
  });
});

describe('the OPEN demandes are spread widely enough to prove search works', () => {
  it('has 11 demandes on 11 distinct categories', () => {
    expect(OPEN_DEMANDES).toHaveLength(11);
    expect(new Set(OPEN_DEMANDES.map((d) => d.categorySlug)).size).toBe(11);
  });

  it('spans at least five distinct postal codes', () => {
    expect(new Set(OPEN_DEMANDES.map((d) => d.postalCode)).size).toBeGreaterThanOrEqual(5);
  });

  it('satisfies createDemandeSchema length floors', () => {
    for (const d of OPEN_DEMANDES) {
      expect(d.title.length).toBeGreaterThanOrEqual(5);
      expect(d.description.length).toBeGreaterThanOrEqual(20);
      expect(d.mode === 'BUDGET' ? typeof d.budgetCents : 'number').toBe('number');
    }
  });
});
