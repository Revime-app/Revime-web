import { describe, expect, it } from 'vitest';
import { createDemandeSchema, updateDemandeSchema } from '@revime/shared';

const VALID = {
  categoryId: '33333333-3333-4333-8333-333333333333',
  title: 'Écran iPhone 13 fissuré',
  description: "L'écran est fissuré depuis une chute la semaine dernière.",
  mode: 'OFFERS' as const,
  locationLabel: 'Paris 75011',
  postalCode: '75011',
};

describe('updateDemandeSchema', () => {
  it('accepts the same body create accepts', () => {
    expect(updateDemandeSchema.safeParse(VALID).success).toBe(true);
  });

  it('defaults photoPaths to an empty array, exactly as create does', () => {
    const asUpdate = updateDemandeSchema.parse(VALID);
    const asCreate = createDemandeSchema.parse(VALID);
    expect(asUpdate.photoPaths).toEqual([]);
    expect(asCreate.photoPaths).toEqual([]);
  });

  it('requires budgetCents when mode is BUDGET', () => {
    const result = updateDemandeSchema.safeParse({ ...VALID, mode: 'BUDGET' });
    expect(result.success).toBe(false);
  });

  it('accepts BUDGET with a budget', () => {
    const result = updateDemandeSchema.safeParse({ ...VALID, mode: 'BUDGET', budgetCents: 8000 });
    expect(result.success).toBe(true);
  });

  /** CF3-08: Title minimum lowered to 2 so 'TV', 'PS5', 'Bac' pass; 1 char is rejected. */
  it('leaves create rejecting a short title with its own message', () => {
    const result = createDemandeSchema.safeParse({ ...VALID, title: 'a' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Donnez un titre d'au moins 2 caractères.");
    }
  });
});
