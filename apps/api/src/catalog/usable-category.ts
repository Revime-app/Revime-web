/**
 * A category is usable only if it is active AND its parent, if any, is also
 * active. Shared by the read path (CatalogService.listCategories) and the
 * write path (DemandesService.create) so the two cannot disagree: if a
 * category cannot be offered to a client, it cannot be accepted from one.
 *
 * Without the parent clause, deactivating a parent would still return its
 * children, carrying a parentId absent from the response, and the client
 * would hold orphans it cannot place in the tree.
 *
 * IMPORTANT: Always spread this LAST in WHERE clauses. A sibling condition
 * using OR would silently clobber this fragment's OR key, losing the
 * parent-activeness rule.
 */
export const USABLE_CATEGORY = {
  active: true,
  OR: [{ parentId: null }, { parent: { active: true } }],
};
