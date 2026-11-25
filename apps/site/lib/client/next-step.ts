import type { DemandeListItem } from '@revime/shared';

export type NextStep = { who: 'you' | 'them' | 'none'; label: string; text: string };

/**
 * « Qui doit agir : quoi », for a client's own demande. Every status card answers it, so a person
 * sees what is happening and whether it is their turn without opening the demande.
 */
export function nextStep(d: Pick<DemandeListItem, 'status' | 'offerCount' | 'commande' | 'quoteRequest'>): NextStep | null {
  const c = d.commande;
  if (d.status === 'CANCELLED') return null;
  if (c?.disputeOpen) return { who: 'them', label: 'REVIME', text: 'étudie le problème signalé. L’argent reste bloqué.' };
  if (c?.status === 'REFUNDED') return { who: 'none', label: 'Terminé', text: 'vous avez été remboursé.' };
  if (c?.status === 'PENDING_PAYMENT') return { who: 'you', label: 'Vous', text: 'payez l’offre choisie pour lancer la réparation.' };
  if (c && c.status === 'PAID') {
    if (c.step === 'AWAITING_VALIDATION') return { who: 'you', label: 'Vous', text: 'vérifiez l’objet, puis validez la réparation.' };
    if (c.step === 'RELEASED') return { who: 'none', label: 'Terminé', text: 'le réparateur a été payé. Vous pouvez laisser un avis.' };
    return { who: 'them', label: 'Le réparateur', text: 's’occupe de votre objet. Rien à faire pour vous.' };
  }
  if (d.status === 'OPEN') {
    if (d.offerCount > 0) {
      return { who: 'you', label: 'Vous', text: d.offerCount > 1 ? `choisissez une des ${d.offerCount} offres.` : 'regardez l’offre reçue.' };
    }
    return d.quoteRequest
      ? { who: 'them', label: 'Le réparateur', text: 'prépare son devis. Vous serez prévenu.' }
      : { who: 'them', label: 'Les réparateurs', text: 'de votre zone vont répondre. Vous serez prévenu.' };
  }
  if (d.status === 'DONE') return { who: 'none', label: 'Terminé', text: 'réparation terminée.' };
  return null;
}
