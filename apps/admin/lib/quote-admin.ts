import type { AdminDemandeListItem } from '@revime/shared';

/**
 * CF4-25 (spec §4.4). The « Type » tag on the admin demandes list and fiche.
 * `quoteTarget` optional so an API that predates H still renders « Publique ».
 */
export function demandeTypeLabel(item: { quoteTarget?: AdminDemandeListItem['quoteTarget'] }): string {
  return item.quoteTarget ? `Privée → ${item.quoteTarget.displayName}` : 'Publique';
}

const REASON: Record<NonNullable<AdminDemandeListItem['quoteClosedReason']>, string> = {
  DECLINED: 'Refusée par le réparateur',
  EXPIRED: 'Expirée : aucune réponse sous 7 jours',
  QUOTE_REFUSED: 'Devis refusé',
  // « par le client » here, unlike the app's « Annulée »: the operator needs to know who.
  CANCELLED_BY_CLIENT: 'Annulée par le client',
};

export function quoteClosedReasonLabel(
  reason: AdminDemandeListItem['quoteClosedReason'] | undefined,
): string | null {
  return reason ? REASON[reason] : null;
}
