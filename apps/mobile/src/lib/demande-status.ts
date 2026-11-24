import type { DemandeListItem } from '@revime/shared';

/**
 * The status LABELS that used to live here moved to `demandeProgress()` in
 * `@revime/shared` on 2026-08-25 (`CF-38`), because the client's chain needs the
 * commande as well as the demande and the API needed the same rule. `demandeProgress`
 * itself was replaced by `repairStatus()` (CF4-12/13/14, Task 4) - same reasoning, an
 * eight-stage client chain and a four-stage réparateur one, one shared derivation for
 * both viewers. This file now owns only the "which demande does Accueil surface"
 * question.
 */

/**
 * The demande Accueil surfaces as « Ma demande en cours », or null when there is none.
 *
 * "Active" means NOT terminal: `DONE` and `CANCELLED` are excluded, so a client whose
 * only demande is finished sees the empty state and a route to publish rather than a
 * card headed « en cours » about something that is not. Newest first, matching
 * `/demandes/mine` order, so the card follows the most recent thing the client did.
 *
 * Exported and pure so the choice is testable without a screen - and so `/mes-demandes`
 * can mark the same row without re-deriving the rule.
 */
export function activeDemande(list: DemandeListItem[] | undefined): DemandeListItem | null {
  if (!list) return null;
  const active = list.filter((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS');
  if (active.length === 0) return null;
  return (
    [...active].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0] ?? null
  );
}
