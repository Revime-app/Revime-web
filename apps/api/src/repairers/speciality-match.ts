/**
 * `CF-33`. Which declared category ids satisfy a filter on one category - design §7.
 *
 * A réparateur's declared set mixes roots and children, so « does he cover category c » is not
 * an equality test:
 *
 *   c is a CHILD → [c, parentOf(c)]   he declared the child, or the whole family
 *   c is a ROOT  → [c, ...children]   he declared the family, or part of it
 *
 * API-LOCAL rather than in `packages/shared`, deliberately: nothing on mobile asks this
 * question - the client sends one id and the server decides what it reaches - and a shared
 * module would invite a second, drifting copy of the rule on the app side.
 *
 * PURE, so the truth table is unit-testable without a database. `test:unit` excludes the whole
 * integration suite, so this is the only gate that can ever run on it.
 */
export function specialityMatchIds(target: {
  id: string;
  parentId: string | null;
  childIds: string[];
}): string[] {
  const ids =
    target.parentId === null ? [target.id, ...target.childIds] : [target.id, target.parentId];
  return [...new Set(ids)];
}

/**
 * CF4-26 (sub-project G, spec §4.3). Every demande category a réparateur's DECLARED set
 * covers - the inverse direction of `specialityMatchIds` above, and the two must agree
 * (`matching-category-ids.spec.ts` cross-checks them over a whole tree):
 *
 *   declared ∪ children of declared roots ∪ parents of declared children
 *
 * A declared child reaches its parent because a demande filed under the ROOT « Téléphone »
 * is a phone he may repair; a declared root reaches its children because it means the whole
 * family. Ids absent from `tree` (an inactive category) are kept: they can still match a
 * demande filed under them.
 */
export function matchingCategoryIds(
  declared: readonly string[],
  tree: readonly { id: string; parentId: string | null }[],
): string[] {
  if (declared.length === 0) return [];
  const byId = new Map(tree.map((c) => [c.id, c]));
  const declaredSet = new Set(declared);
  const out = new Set<string>(declared);
  for (const id of declared) {
    const parentId = byId.get(id)?.parentId ?? null;
    if (parentId !== null) out.add(parentId);
  }
  for (const c of tree) {
    if (c.parentId !== null && declaredSet.has(c.parentId)) out.add(c.id);
  }
  return [...out];
}
