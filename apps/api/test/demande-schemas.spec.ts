import { describe, expect, it } from 'vitest';
import { createDemandeSchema, feedQuerySchema, formatPublicLocation } from '@revime/shared';

const valid = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'Écran iPhone 13 fissuré',
  description: "L'écran est fissuré en haut à droite et la batterie tient mal.",
  mode: 'OFFERS' as const,
  postalCode: '69003',
  locationLabel: 'Lyon 3e',
};

/**
 * zod's own defaults are English and they surface for the invalid_type case,
 * which authored .min()/.regex() messages do NOT cover - a missing field
 * otherwise answers "Invalid input: expected string, received undefined".
 *
 * The pattern targets zod's English phrases specifically. A naive /invalid/i
 * would match the legitimate French "invalide" and push someone to loosen
 * this very guard, masking the bug it exists to catch.
 */
const ZOD_ENGLISH =
  /expected|received|invalid input|invalid option|too small|too big|must contain/i;

describe('createDemandeSchema', () => {
  it('accepts a minimal valid offers-mode demande', () => {
    const result = createDemandeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('requires a budget in budget mode', () => {
    const result = createDemandeSchema.safeParse({ ...valid, mode: 'BUDGET' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Indiquez votre budget.');
  });

  it('accepts budget mode when a budget is given', () => {
    const result = createDemandeSchema.safeParse({
      ...valid,
      mode: 'BUDGET',
      budgetCents: 8000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a budget that is not a whole number of cents', () => {
    const result = createDemandeSchema.safeParse({
      ...valid,
      mode: 'BUDGET',
      budgetCents: 80.5,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const budgetIssue = result.error.issues.find((i) => i.path.includes('budgetCents'));
    expect(budgetIssue).toBeDefined();
    expect(budgetIssue?.message).toBe('Budget invalide.');
  });

  it('rejects a malformed French postal code', () => {
    const result = createDemandeSchema.safeParse({ ...valid, postalCode: '6900' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Code postal invalide.');
  });

  it('rejects a description that is too short to be useful', () => {
    const result = createDemandeSchema.safeParse({ ...valid, description: 'cassé' });
    expect(result.success).toBe(false);
  });

  it('CF3-08: accepts short valid titles and descriptions', () => {
    for (const title of ['TV', 'PS5', 'Bac', 'Vélo']) {
      const res = createDemandeSchema.safeParse({ ...valid, title });
      expect(res.success).toBe(true);
    }
    for (const description of ['Bac fissuré', 'Écran cassé', 'Écran noir']) {
      const res = createDemandeSchema.safeParse({ ...valid, description });
      expect(res.success).toBe(true);
    }
  });

  it('CF3-08: rejects title under 2 chars and description under 10 chars', () => {
    const resTitle = createDemandeSchema.safeParse({ ...valid, title: 'X' });
    expect(resTitle.success).toBe(false);
    const resDesc = createDemandeSchema.safeParse({ ...valid, description: 'court' });
    expect(resDesc.success).toBe(false);
  });

  it('emits no English for missing fields, where zod defaults leak', () => {
    const result = createDemandeSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.length).toBeGreaterThan(0);
    for (const issue of result.error.issues) {
      expect(issue.message).not.toMatch(ZOD_ENGLISH);
    }
  });

  it('emits no English for wrong-type fields', () => {
    const result = createDemandeSchema.safeParse({ ...valid, title: 123 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const titleIssue = result.error.issues.find((i) => i.path.includes('title'));
    expect(titleIssue).toBeDefined();
    expect(titleIssue?.message).not.toMatch(ZOD_ENGLISH);
  });

  it('emits no English for invalid enum values', () => {
    const result = createDemandeSchema.safeParse({ ...valid, mode: 'INSTANT' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const modeIssue = result.error.issues.find((i) => i.path.includes('mode'));
    expect(modeIssue).toBeDefined();
    expect(modeIssue?.message).not.toMatch(ZOD_ENGLISH);
  });

  it('the English guard can actually fail', () => {
    // Control. Proves the pattern matches a real zod default, so a pass above
    // means "no English" rather than "the pattern matches nothing" - and proves
    // it does not fire on legitimate French containing "invalide".
    expect('Invalid input: expected string, received undefined').toMatch(ZOD_ENGLISH);
    expect('Code postal invalide.').not.toMatch(ZOD_ENGLISH);
  });
});

describe('feedQuerySchema', () => {
  it('accepts an empty query, which is how the FAB feed calls it', () => {
    const result = feedQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  /**
   * The guard on spec §5.1. The prototype defaults its sort to "recentes", but
   * the feed's real behaviour is nearest-first when the réparateur is located.
   * A .default('recentes') here would silently undo piece D for every caller,
   * including the FAB feed, which sends no parameters at all.
   */
  it('leaves sort undefined when absent, so the proximity default survives', () => {
    const result = feedQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sort).toBeUndefined();
  });

  it('trims q before checking its length', () => {
    const result = feedQuerySchema.safeParse({ q: '  iPhone  ' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.q).toBe('iPhone');
  });

  it('rejects a q longer than 120 characters', () => {
    const result = feedQuerySchema.safeParse({ q: 'a'.repeat(121) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Recherche trop longue.');
  });

  it('accepts a q of exactly 120 characters', () => {
    const result = feedQuerySchema.safeParse({ q: 'a'.repeat(120) });
    expect(result.success).toBe(true);
  });

  it('rejects a categoryId that is not a uuid', () => {
    const result = feedQuerySchema.safeParse({ categoryId: 'smartphone' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Catégorie invalide.');
  });

  it('accepts each of the three sort values', () => {
    for (const sort of ['recentes', 'prix', 'distance'] as const) {
      expect(feedQuerySchema.safeParse({ sort }).success).toBe(true);
    }
  });

  it('rejects an unknown sort', () => {
    const result = feedQuerySchema.safeParse({ sort: 'pertinence' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Tri invalide.');
  });

  it('emits no English for an unknown sort', () => {
    const result = feedQuerySchema.safeParse({ sort: 'pertinence' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).not.toMatch(ZOD_ENGLISH);
  });
});

describe('formatPublicLocation (CF3-05)', () => {
  it('extracts postal code and city from a BAN full address', () => {
    expect(formatPublicLocation('12 Rue de Rivoli 75001 Paris', '75001')).toBe('75001 Paris');
    expect(formatPublicLocation('12 Rue de la Paix, 75002 Paris', '75002')).toBe('75002 Paris');
  });

  it('keeps postal code and city when already minimal', () => {
    expect(formatPublicLocation('75017 Paris', '75017')).toBe('75017 Paris');
    expect(formatPublicLocation('Lyon 3e', '69003')).toBe('69003 Lyon 3e');
  });

  it('handles empty or missing label gracefully', () => {
    expect(formatPublicLocation('', '75008')).toBe('75008');
    expect(formatPublicLocation(null, '75008')).toBe('75008');
  });
});

