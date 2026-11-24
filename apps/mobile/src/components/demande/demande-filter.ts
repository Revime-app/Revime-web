export type DemandeFilter = 'ALL' | 'PUBLIC' | 'PRIVATE';

/**
 * The two fields that decide privacy, required as the API always sends them. `quoteRequest` is
 * only tested for presence, so it is typed `object` rather than dragging in the whole DTO;
 * both `DemandeListItem` and `DemandeDto` satisfy this.
 */
export type DemandeFilterCandidate = { isPrivate: boolean; quoteRequest: object | null };

/**
 * THE one place that decides whether a demande is a private quote request (CF6-14, CF6-16).
 * Screens must call this rather than re-derive it from `quoteRequest`.
 *
 * Typed required, read defensively: the current API always sends `isPrivate`, but an older one
 * does not, and `undefined` must not count as « public ». It then falls back to
 * `quoteRequest != null`, which is what `isPrivate` is derived from server-side.
 */
export function isPrivateDemandeItem(item: DemandeFilterCandidate): boolean {
  if (typeof item.isPrivate === 'boolean') {
    return item.isPrivate;
  }
  return item.quoteRequest != null;
}

/**
 * Filters a list of demandes according to the active DemandeFilter tab.
 */
export function filterDemandes<T extends DemandeFilterCandidate>(
  items: readonly T[],
  filter: DemandeFilter,
): T[] {
  switch (filter) {
    case 'PUBLIC':
      return items.filter((item) => !isPrivateDemandeItem(item));
    case 'PRIVATE':
      return items.filter((item) => isPrivateDemandeItem(item));
    case 'ALL':
    default:
      return [...items];
  }
}

/**
 * Computes counts for each filter category across the full collection of demandes.
 */
export function getDemandeCounts<T extends DemandeFilterCandidate>(
  items: readonly T[],
): { all: number; public: number; private: number } {
  let publicCount = 0;
  let privateCount = 0;

  for (const item of items) {
    if (isPrivateDemandeItem(item)) {
      privateCount += 1;
    } else {
      publicCount += 1;
    }
  }

  return {
    all: items.length,
    public: publicCount,
    private: privateCount,
  };
}

/**
 * Wording for an EMPTY filtered tab. There is none for « Toutes »: that tab is only offered when
 * the list is non-empty, so its empty state is the screen's own, global one.
 */
export function getEmptyStateCopy(filter: Exclude<DemandeFilter, 'ALL'>): { title: string; subtitle: string } {
  switch (filter) {
    case 'PUBLIC':
      return {
        title: 'Aucune demande publique pour le moment.',
        subtitle: "Vous n'avez publié aucune demande publique.",
      };
    case 'PRIVATE':
      return {
        title: 'Aucun devis privé pour le moment.',
        subtitle: 'Vos demandes de devis directes auprès des réparateurs apparaîtront ici.',
      };
  }
}

/**
 * Spoken label of a filter pill. It starts with the visible text and says « élément » in the
 * singular for 0 and 1 (French), which the previous « N éléments » did not.
 */
export function pillAccessibilityLabel(label: string, count: number): string {
  return `${label}, ${count} ${count > 1 ? 'éléments' : 'élément'}`;
}
