/**
 * `CF-49`. « Complétez votre profil - 2 / 6 complétées », from mockup `04` panel 2.
 *
 * Computed HERE and called on the API rather than in the screen, for one reason: `apps/mobile`
 * has no test runner, and `apps/api/vitest.config.ts` only collects `test/**` - so this is the
 * one arrangement where the arithmetic AND its call site are covered by a gate. Returning it on
 * `MeResponse` also means the count cannot disagree between two screens.
 */

/**
 * The six rows, in the order mockup `04` panel 2 draws them.
 *
 * Panel 1 draws a different first row (« Catégories de réparation ») and a different order; the
 * mockup is not internally consistent and PANEL 2 GOVERNS, because it is the panel that draws
 * the whole list together with its count.
 */
export const CHECKLIST_KEYS = [
  'photo',
  'banner',
  'description',
  'categories',
  'zone',
  'availability',
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/**
 * Deliberately NOT `MeResponse` - a narrow input keeps this callable from a test with six
 * literals instead of a whole session object, and stops the function reaching for a field
 * nobody meant it to read.
 *
 * There is NO radius field, and that absence is the design: see the spec §6.
 */
export type CompletionInput = {
  /** The photo he uploaded. */
  avatarUrl: string | null;
  /** The one an OAuth provider supplied. Counts, because the fiche renders `avatarUrl ?? image`. */
  image: string | null;
  bannerUrl: string | null;
  bio: string | null;
  categoryIds: string[];
  postalCode: string | null;
  /** Row count, not the rows: 0 means « has not answered ». */
  availabilityDays: number;
};

export type ProfileCompletion = {
  completed: number;
  total: number;
  items: Record<ChecklistKey, boolean>;
};

export function repairerProfileCompletion(input: CompletionInput): ProfileCompletion {
  /**
   * 🛑 A PLAIN LITERAL, NOT `... as Record<ChecklistKey, boolean>`. The assertion satisfies the
   * annotation, so `tsc` exits 0 whether or not every key is present - which makes the totality
   * gate vacuous. Written this way, adding a key to `CHECKLIST_KEYS` without handling it here is
   * a compile error, and that is the only thing keeping the count honest.
   */
  const items: Record<ChecklistKey, boolean> = {
    photo: (input.avatarUrl ?? input.image) !== null,
    banner: input.bannerUrl !== null,
    description: (input.bio ?? '').trim().length > 0,
    categories: input.categoryIds.length > 0,
    zone: input.postalCode !== null,
    availability: input.availabilityDays > 0,
  };

  return {
    // Counted over the KEY LIST rather than Object.values(items), so the number can never
    // include a stray key that is not part of the client's six.
    completed: CHECKLIST_KEYS.filter((k) => items[k]).length,
    total: CHECKLIST_KEYS.length,
    items,
  };
}
