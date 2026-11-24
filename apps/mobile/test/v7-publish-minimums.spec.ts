import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { DEMANDE_DESCRIPTION_MIN, DEMANDE_TITLE_MIN, createDemandeSchema } from '@revime/shared';
import { canContinueStep, type WizardFields } from '../src/lib/publish-wizard';

/**
 * V7 `FND7-074` / `ISS7-041`. The client, 2026-11-11: « les caractères minimum ne sont pas respectés ».
 *
 * `CF3-08` (V3) lowered the minimums to 2 (title) and 10 (description) so « TV », « PS5 » and
 * « Bac fissuré » publish, and wrote « Au moins 2 / 10 caractères » under the fields. The schema
 * and the hints moved; the wizard's Continuer gate kept the old 5 and 20, so the screen promised
 * 2 and refused anything under 5 (reproduced on the Android emulator: « TVTV », 4 characters,
 * Continuer greyed). One number now governs the schema, the hint, the counter and the gate.
 */
const base: WizardFields = {
  categoryId: 'cat-1',
  title: '',
  photosUploading: false,
  description: '',
  postalCode: '',
  locationLabel: '',
  mode: 'OFFERS',
  budget: '',
};

describe('publish wizard minimums (FND7-074)', () => {
  it('uses the schema minimums the V3 client asked for', () => {
    expect(DEMANDE_TITLE_MIN).toBe(2);
    expect(DEMANDE_DESCRIPTION_MIN).toBe(10);
  });

  it('lets a 2-character title continue, as the hint says (« TV »)', () => {
    expect(canContinueStep(1, { ...base, title: 'TV' })).toBe(true);
    expect(canContinueStep(1, { ...base, title: 'PS5' })).toBe(true);
  });

  it('holds a title under the minimum, spaces not counted', () => {
    expect(canContinueStep(1, { ...base, title: 'T' })).toBe(false);
    expect(canContinueStep(1, { ...base, title: ' T  ' })).toBe(false);
  });

  it('still needs a category and no photo mid-upload on step 1', () => {
    expect(canContinueStep(1, { ...base, title: 'TV', categoryId: '' })).toBe(false);
    expect(canContinueStep(1, { ...base, title: 'TV', photosUploading: true })).toBe(false);
  });

  it('lets a 10-character description continue (« Bac fissuré »)', () => {
    expect(canContinueStep(2, { ...base, description: 'Bac fissuré' })).toBe(true);
    expect(canContinueStep(2, { ...base, description: 'Bac cassé' })).toBe(false);
  });

  it('agrees with the server schema at the boundary', () => {
    const at = 'x'.repeat(DEMANDE_TITLE_MIN);
    const under = 'x'.repeat(DEMANDE_TITLE_MIN - 1);
    const shape = createDemandeSchema.shape; // Zod 4: `.refine()` keeps the object schema
    expect(shape.title.safeParse(at).success).toBe(canContinueStep(1, { ...base, title: at }));
    expect(shape.title.safeParse(under).success).toBe(canContinueStep(1, { ...base, title: under }));
    const d = 'y'.repeat(DEMANDE_DESCRIPTION_MIN);
    expect(shape.description.safeParse(d).success).toBe(canContinueStep(2, { ...base, description: d }));
  });

  it('keeps step 3 as it was: a 5-digit postal code, a place, and a budget in BUDGET mode', () => {
    const s3 = { ...base, postalCode: '69003', locationLabel: 'Lyon' };
    expect(canContinueStep(3, s3)).toBe(true);
    expect(canContinueStep(3, { ...s3, postalCode: '6900' })).toBe(false);
    expect(canContinueStep(3, { ...s3, mode: 'BUDGET', budget: '' })).toBe(false);
    expect(canContinueStep(3, { ...s3, mode: 'BUDGET', budget: '80' })).toBe(true);
    expect(canContinueStep(4, base)).toBe(true);
  });

  it('wires the wizard and the edit screen to the shared numbers, with no literal left behind', () => {
    for (const rel of ['app/(tabs)/publier.tsx', 'app/demande/[id]/modifier.tsx']) {
      const src = readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
      expect(src, rel).not.toMatch(/Au moins \d+ caractères/);
      expect(src, rel).not.toMatch(/min: \d+, max: (120|2000)/);
      expect(src, rel).toContain('DEMANDE_TITLE_MIN');
      expect(src, rel).toContain('DEMANDE_DESCRIPTION_MIN');
    }
    const wizard = readFileSync(path.resolve(__dirname, '../app/(tabs)/publier.tsx'), 'utf8');
    expect(wizard).toContain('canContinueStep(');
    expect(wizard).not.toMatch(/\.trim\(\)\.length >= (5|20)\b/);
  });
});
