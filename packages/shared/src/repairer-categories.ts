import { z } from 'zod';

/**
 * `CF-25`. What a réparateur may declare, and the two pure rules that govern the set.
 *
 * A declared entry is a ROOT or a CHILD, and which one is the feature: a root means the whole
 * family INCLUDING subcategories added later, so the claim tracks the taxonomy instead of
 * freezing a snapshot of it. Design §6.
 */

/**
 * The real cap, enforced in `UsersService.setCategories` AFTER normalisation.
 *
 * 🛑 NOT enforced by the Zod schema below, and the asymmetry is deliberate. Only the
 * post-normalisation count is meaningful - a stale app can legitimately send a root plus its
 * ten children, which is 11 ids that normalise to ONE - and normalisation needs the taxonomy's
 * parent-child edges, which live in Postgres. Zod has no database. Design §6.
 */
export const MAX_SPECIALITIES = 12;

/**
 * A shape bound on the raw array, so an unbounded body cannot reach the service.
 *
 * 🛑 NOT the size of the taxonomy, and deliberately not derived from it. The design said 44,
 * « the taxonomy's own size », but that is a count of ROWS IN POSTGRES: add a ninth root and a
 * 44 bound begins refusing legal bodies, with no gate here able to see it. Same limit
 * `category-icons.ts` records for its slug union - this package cannot check anything against
 * the database. 100 is comfortably above any plausible taxonomy and still finite.
 */
export const RAW_CATEGORY_IDS_MAX = 100;

export const updateRepairerCategoriesSchema = z.object({
  categoryIds: z
    .array(z.string().uuid({ message: 'Catégorie invalide.' }))
    .max(RAW_CATEGORY_IDS_MAX, { message: 'Trop de catégories.' }),
});

export type UpdateRepairerCategoriesInput = z.infer<typeof updateRepairerCategoriesSchema>;

/**
 * Removes redundancy from a declared set: if a root is present, its children are dropped.
 *
 * « Électronique » and « Électronique · Smartphones » side by side says nothing the first chip
 * did not, and the cap should not be spent on it.
 *
 * REMOVING REDUNDANCY IS ITS ONLY JOB. An id absent from `parentOf` is KEPT, because validating
 * ids against `USABLE_CATEGORY` is the caller's prior step; dropping them here would make a
 * taxonomy bug present as a réparateur's saved selection quietly shrinking.
 *
 * Input order is preserved so a save is deterministic. Display order is derived at READ time
 * from the taxonomy's `sortOrder`, not from this.
 *
 * @param ids - Category ids, already validated by the caller. Duplicates tolerated.
 * @param parentOf - Every id in `ids` mapped to its `parentId`, null for a root.
 */
export function normaliseSpecialities(
  ids: string[],
  parentOf: Map<string, string | null>,
): string[] {
  const unique = [...new Set(ids)];
  const roots = new Set(unique.filter((id) => parentOf.get(id) === null));
  return unique.filter((id) => {
    const parent = parentOf.get(id);
    // `undefined` (unknown id) and `null` (a root) both survive; only a child whose own root
    // is in the set is redundant.
    return parent === undefined || parent === null || !roots.has(parent);
  });
}

/**
 * One chip's label: « Électronique » for a root, « Électronique · Smartphones » for a child.
 *
 * The same composition `publier.tsx`'s recap row uses, so one category reads the same way
 * wherever it is named.
 */
export function specialityLabel(rootLabel: string, childLabel: string | null): string {
  return childLabel === null ? rootLabel : `${rootLabel} · ${childLabel}`;
}
