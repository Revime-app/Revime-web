import { describe, expect, it } from 'vitest';
import { postalCodeSchema } from '@revime/shared';

describe('postalCodeSchema', () => {
  it('accepts exactly five digits', () => {
    for (const code of ['69003', '75001', '00000', '99999']) {
      expect(postalCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects anything that is not five digits, in French', () => {
    for (const code of ['6900', '690033', '6900A', '', ' 69003', '69 03']) {
      const r = postalCodeSchema.safeParse(code);
      expect(r.success).toBe(false);
      if (r.success) continue;
      expect(r.error.issues[0]?.message).toBe('Code postal invalide.');
    }
  });
});
