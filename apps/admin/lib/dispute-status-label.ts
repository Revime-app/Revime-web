import type { DisputeStatusType } from '@revime/shared';

export const DISPUTE_STATUS_LABEL: Record<DisputeStatusType, string> = {
  OPEN: 'Ouvert',
  IN_REVIEW: "En cours d'examen",
  RESOLVED_RELEASED: 'Fonds débloqués',
  RESOLVED_REFUNDED: 'Remboursé au client',
  RESOLVED_DISMISSED: 'Réparation reprise',
};

/** How long a dossier took (closed) or has been open (still running). `0` is « moins d'un jour », never « 0 jour ». */
export function processingAgeLabel(days: number, closed: boolean): string {
  const head = closed ? 'Dossier clôturé en' : 'Dossier ouvert depuis';
  if (days < 1) return `${head} moins d'un jour`;
  return `${head} ${days} jour${days > 1 ? 's' : ''}`;
}

export function getVerdictLabel(verdict: string | null): string {
  switch (verdict) {
    case 'RELEASE_REPAIRER':
      return 'Paiement au réparateur';
    case 'REFUND_CLIENT':
      return 'Client intégralement remboursé';
    // CF4-D final review, Important #2. `PARTIAL_REFUND` is the verdict
    // `admin-disputes.service.ts` stamps when the resolution refunds less than the
    // full total (spec §6) - without this case it fell through to `default` and
    // showed the raw enum string to the admin.
    case 'PARTIAL_REFUND':
      return 'Client partiellement remboursé';
    case 'DISMISS_NO_ACTION':
    case 'DISMISSED':
      return 'La réparation reprend';
    default:
      return verdict ?? 'Non spécifié';
  }
}

/**
 * The status of the dispute linked from a refund or a cancellation. The API already sends the
 * status that prevails over the order (B11), so this only words it: a raw enum value is never shown.
 */
export function disputeStatusLabel(status: DisputeStatusType | null): string {
  return status ? DISPUTE_STATUS_LABEL[status] : 'Clôturé';
}
