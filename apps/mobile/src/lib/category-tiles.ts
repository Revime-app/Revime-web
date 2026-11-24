import type { CategoryDto } from '@revime/shared';

/**
 * The five shortcut tiles Accueil shows under « Catégories », pinned to real category
 * slugs.
 *
 * 🛑 THE PROTOTYPE PREDATES THIS PROJECT'S TAXONOMY. Its five labels - Mobile, PC, Montre,
 * Console, Vélo - are NOT top-level categories here. The real roots are Électronique,
 * Maison & Jardin, Mode & accessoires, Mobilité, Famille, Loisirs, Véhicules and Autres:
 * eight of them, with labels far too long for a 66pt tile. So each tile is pinned to a
 * real CHILD by slug, and each carries a genuine id so the tap preselects that category in
 * the publish wizard rather than merely opening it. Owner's call, 2026-08-20.
 *
 * Matching by SLUG rather than by label or index, because slugs are stable ids while
 * labels are copy and order is `sortOrder`.
 */
export const CATEGORY_TILE_SLUGS = [
  { slug: 'smartphone', label: 'Mobile' },
  { slug: 'ordinateur', label: 'PC' },
  { slug: 'montres-bijoux', label: 'Montre' },
  { slug: 'console', label: 'Console' },
  { slug: 'velos', label: 'Vélo' },
] as const;

export type CategoryTileSlug = (typeof CATEGORY_TILE_SLUGS)[number]['slug'];

export type ResolvedTile = { slug: CategoryTileSlug; label: string; id: string };

/**
 * Three outcomes, not two - and separating them IS the fix for a real bug.
 *
 * The first version of this logic lived inside the component and collapsed to
 * `if (resolved.length === 0) return null`, which made LOADING and NO-MATCHES
 * indistinguishable. Since the section's heading and « Voir tout » live inside that
 * component, the whole block was absent for as long as `GET /categories` took - measured
 * at ~950ms cold and ~185ms warm against production Postgres - and then popped in, shoving
 * everything below it down the screen. Reported from a device on 2026-08-20.
 *
 * The two states want opposite treatments:
 *
 * - `loading`: the data is coming. Keep the heading and hold the row's height, so nothing
 *   reflows when it arrives. This is what the rest of the app already does - see
 *   `CategorySearch`, `RepairerDirectory` and `DemandeFeed`, which all render their chrome
 *   plus « Chargement… ». `CategoryTiles` was the outlier.
 * - `empty`: the API answered and none of the five slugs exist. Render NOTHING, because a
 *   heading over an empty row is chrome promising content that is never coming - and a
 *   tile that navigates nowhere is the dead affordance this screen's header already avoids.
 *
 * `error` is folded into `empty` deliberately: the row is a shortcut, not the screen's
 * content, and « Voir tout » plus the search bar both still reach the full browser. An
 * error message here would be the third failure notice on one screen.
 */
export type CategoryTilesState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; tiles: ResolvedTile[] };

export function resolveCategoryTiles(
  categories: CategoryDto[] | undefined,
  isError = false,
): CategoryTilesState {
  if (isError) return { status: 'empty' };
  // `undefined` means the query has not answered yet. An empty ARRAY is an answer.
  if (categories === undefined) return { status: 'loading' };

  const tiles: ResolvedTile[] = [];
  for (const t of CATEGORY_TILE_SLUGS) {
    const match = categories.find((c) => c.slug === t.slug);
    // A tile whose slug is absent is DROPPED rather than rendered inert.
    if (match) tiles.push({ slug: t.slug, label: t.label, id: match.id });
  }

  return tiles.length === 0 ? { status: 'empty' } : { status: 'ready', tiles };
}
