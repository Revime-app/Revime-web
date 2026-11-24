import { categoryTree, type CategoryDto } from '@revime/shared';

/** One row of Recherche's result list. */
export type SearchRow = {
  /** The category the row opens the publish wizard on. */
  id: string;
  label: string;
  /** The prototype's `.result-row__tag`: the parent's name, or « Catégorie » for a root. */
  tag: string;
  /**
   * The row's OWN slug, added by `CF-32` so `iconForCategory` can give a child its own glyph.
   * Before that the row carried `rootSlug` alone, so every one of the 36 child rows could only
   * ever draw its root's icon - which is the defect the client reported. On a childless root's
   * row this equals `rootSlug`.
   */
  slug: string;
  /** Which root this belongs to, so the row can fall back to its icon. */
  rootSlug: string;
};

/** One filter chip. `ALL_CHIP` is the « Tous » pseudo-chip. */
export type RootChip = { id: string; label: string };

export const ALL_CHIP = 'all';

export type SearchSort = 'pertinence' | 'az';

/**
 * The « Pertinence » / « A → Z » labels. « Pertinence » is the prototype's word and is kept,
 * but be precise about what it means here: with no query typed there is no relevance to
 * compute, so it is the TAXONOMY'S OWN ORDER as the API returned it (`sortOrder`, roots then
 * children). That is a defensible default - it groups related things - but it is not a
 * relevance ranking, and a future change that adds real scoring should not be surprised.
 */
export const SORT_LABEL: Record<SearchSort, string> = {
  pertinence: 'Pertinence',
  'az': 'A → Z',
};

/**
 * Accent- and case-insensitive, so « ecran » finds « Écran » and « velo » finds « Vélo ».
 *
 * Worth doing HERE and worth noting it is not the same as the server's: the réparateur feed
 * filters in Postgres with `ILIKE`, which is accent-SENSITIVE, and making that
 * accent-insensitive needs `CREATE EXTENSION unaccent` plus `$queryRaw` - a deferred backlog
 * item. This list is filtered locally over reference data already in memory, so it costs
 * nothing and there is no reason to inherit the server's limitation.
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The filter chips: « Tous » plus one per ROOT category.
 *
 * The prototype's chips are Smartphone / Ordinateur / Montre / Console / Vélo - all
 * CHILDREN - because its fixture list was flat. Over this project's two-level taxonomy the
 * roots are the filter that means something: picking « Électronique » narrows 37 rows to 10,
 * where picking one child would narrow it to itself and duplicate tapping the row.
 *
 * Chips are NOT hardcoded, so a taxonomy change flows through without a code edit.
 */
export function rootChips(categories: CategoryDto[] | undefined): RootChip[] {
  if (!categories) return [];
  return categoryTree(categories).map((r) => ({ id: r.id, label: r.labelFr }));
}

/**
 * The result rows for a query, a chip and a sort.
 *
 * **What counts as a row.** Every CHILD category, plus every root that has NO children
 * (`Autres` is the live example). A root WITH children is deliberately not a row: it is
 * already represented by its chip, and adding it would put eight near-duplicate entries
 * above their own subcategories. Both kinds of row are things a client can actually publish
 * under, which is the list's purpose.
 *
 * **What matches.** A child matches when its own label OR its root's label contains the
 * needle, so typing « electronique » returns that root's ten children rather than nothing.
 * A childless root matches on its own label only.
 */
export function searchRows(
  categories: CategoryDto[] | undefined,
  opts: { q?: string; chipId?: string; sort?: SearchSort } = {},
): SearchRow[] {
  if (!categories) return [];
  const { q = '', chipId = ALL_CHIP, sort = 'pertinence' } = opts;
  const needle = fold(q.trim());
  const tree = categoryTree(categories);

  const rows: SearchRow[] = [];
  for (const root of tree) {
    if (chipId !== ALL_CHIP && root.id !== chipId) continue;

    if (root.children.length === 0) {
      if (needle === '' || fold(root.labelFr).includes(needle)) {
        rows.push({
          id: root.id,
          label: root.labelFr,
          tag: 'Catégorie',
          slug: root.slug,
          rootSlug: root.slug,
        });
      }
      continue;
    }

    const rootMatches = fold(root.labelFr).includes(needle);
    for (const child of root.children) {
      if (needle === '' || rootMatches || fold(child.labelFr).includes(needle)) {
        rows.push({
          id: child.id,
          label: child.labelFr,
          tag: root.labelFr,
          slug: child.slug,
          rootSlug: root.slug,
        });
      }
    }
  }

  // `pertinence` leaves the taxonomy order alone - see SORT_LABEL. Sorting is a COPY so the
  // caller's array is never mutated.
  return sort === 'az'
    ? [...rows].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    : rows;
}
