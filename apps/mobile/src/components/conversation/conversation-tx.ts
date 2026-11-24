export type TxBadgeInfo = {
  label: string;
  bg: string;
  color: string;
};

/**
 * Derives the transaction badge label and theme colors for the conversation header card.
 *
 * CF6-V4: the conversation's card said « Paiement effectué » in green on an order the order sheet
 * calls « Suspendue — litige » (CommandeHeaderCard). `tx.disputeOpen` is the server's answer
 * (`isDisputeOpen`, the same predicate behind the order sheet), so the dispute is read from it and
 * from nowhere else: a second derivation from the dispute's status would have two truths to drift.
 */
export function getTxBadge(tx: {
  status: string;
  step: string | null;
  disputeOpen: boolean;
}): TxBadgeInfo {
  // First, as on the order sheet (CommandeHeaderCard), where an open dispute outranks every other state.
  if (tx.disputeOpen) {
    return { label: 'Suspendue — litige', bg: '#fee2e2', color: '#b91c1c' };
  }
  if (tx.status === 'REFUNDED') {
    return { label: 'Remboursée', bg: '#fee2e2', color: '#b91c1c' };
  }
  if (tx.status === 'ABANDONED') {
    return { label: 'Annulée', bg: '#f3f4f6', color: '#6b7280' };
  }
  if (tx.status === 'PENDING_PAYMENT') {
    return { label: 'Paiement en attente', bg: '#fef3c7', color: '#b45309' };
  }
  if (tx.step === 'RELEASED') {
    return { label: 'Fonds débloqués', bg: '#dcfce7', color: '#15803d' };
  }
  if (tx.step === 'AWAITING_VALIDATION') {
    return { label: 'Validation client', bg: '#fef3c7', color: '#b45309' };
  }
  if (tx.step === 'REPAIR_DONE') {
    return { label: 'Réparation terminée', bg: '#dcfce7', color: '#15803d' };
  }
  if (tx.step === 'REPAIR_STARTED') {
    return { label: 'Réparation en cours', bg: '#e0e7ff', color: '#3730a3' };
  }
  if (tx.step === 'PARCEL_SENT') {
    return { label: 'Colis envoyé', bg: '#e0f2fe', color: '#0369a1' };
  }
  if (tx.step === 'PARCEL_RECEIVED') {
    return { label: 'Colis reçu', bg: '#e0f2fe', color: '#0369a1' };
  }
  if (tx.step === 'RETURN_SENT') {
    return { label: 'Colis retour envoyé', bg: '#e0f2fe', color: '#0369a1' };
  }
  if (tx.step === 'RETURN_RECEIVED') {
    return { label: 'Colis retour reçu', bg: '#e0f2fe', color: '#0369a1' };
  }
  return { label: 'Paiement effectué', bg: '#dcfce7', color: '#15803d' };
}

