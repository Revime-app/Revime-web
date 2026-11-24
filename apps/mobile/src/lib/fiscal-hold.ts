import { euros, type CommandeDto, type CommandeListItem, type CommandeStatus, type CommandeStep, type RepairerJourney } from '@revime/shared';

/**
 * V8 `ISS8-020` (d): whether the réparateur's « Virements » step is done, from `useRepairerJourney()`. `undefined`
 * while the journey is missing or a status call failed (nothing is known). No « Virements » step at all (Connect off)
 * reads as done: then only fiscal information can be missing.
 */
export function payoutsDoneFrom(journey: RepairerJourney | null, statusFailed: boolean): boolean | undefined {
  if (!journey || statusFailed) return undefined;
  const payouts = journey.steps.find((s) => s.key === 'payouts');
  return payouts === undefined || payouts.status === 'done';
}

export type PayoutHoldView = {
  title: string;
  body: string;
  cta: string;
  route: '/fiscalite' | '/statut-verification';
};

/**
 * V8 B2. What the réparateur sees on an order the client validated while Revime HOLDS his payout:
 * `null` when nothing is held. Every hold shows the amount and where to finish; the reason decides
 * where:
 * - an individual whose fiscal information is missing keeps CMP-D3's precise card and its form;
 * - anyone else (no « Virements » yet, payouts not active, or a professional) goes to the setup page,
 *   which lists every step still to do, with the client's sentence. Before V8 these réparateurs saw
 *   « Fonds versés » on an order that had paid them nothing (V8 FND8-016).
 *
 * Mirrors the server's held-payout predicate (`HELD_PAYOUT_WHERE`: PAID, RELEASED, no transfer, no
 * dispute), and keeps `=== false` on `hasStripeTransfer` for the reason given below.
 */
export function payoutHoldView(
  commande: {
    step: CommandeStep | null;
    status: CommandeStatus;
    hasStripeTransfer?: boolean;
    payoutCents: number;
    disputeOpen?: boolean;
  },
  repairer: { kind: 'INDIVIDUAL' | 'PRO'; fiscalCompleted?: boolean } | null | undefined,
  /**
   * V8 `ISS8-020` (d): whether « Virements » is done (`payoutsDoneFrom`). The fiscal card names one step, so it
   * shows only when fiscal information is the ONLY thing missing; otherwise, or while unknown, the setup page,
   * which lists every missing step and is true in every case.
   */
  payoutsDone: boolean | undefined,
): PayoutHoldView | null {
  if (commande.step !== 'RELEASED' || commande.status !== 'PAID' || commande.hasStripeTransfer !== false) {
    return null;
  }
  if (commande.disputeOpen === true) return null;
  const title = `Paiement en attente : ${euros(commande.payoutCents)}`;
  if (payoutsDone === true && isFiscalPayoutHold(commande, repairer)) {
    return {
      title,
      body: 'Complétez vos informations fiscales pour recevoir votre paiement.',
      cta: 'Compléter mes informations fiscales',
      route: '/fiscalite',
    };
  }
  return {
    title,
    body: 'Votre paiement vous attend : terminez votre configuration pour le recevoir.',
    cta: 'Terminer ma configuration',
    route: '/statut-verification',
  };
}

/**
 * CMP-D3. True when a réparateur's validated order is waiting in escrow ONLY because his fiscal
 * information is missing, so the screen shows « Complétez vos informations fiscales pour recevoir votre
 * paiement » instead of « Les fonds ont été débloqués ».
 *
 * `=== false`, not `!`: `hasStripeTransfer` and `fiscalCompleted` are fields an API older than this app
 * does not send, and `!undefined` is `true`. A stale API must show the normal order, never a payment
 * hold nobody can confirm. Only an individual: a professional completes the company check instead
 * (`/entreprise`), and sending him to the personal form would be wrong.
 */
export function isFiscalPayoutHold(
  commande: Pick<CommandeListItem | CommandeDto, 'step' | 'hasStripeTransfer'>,
  repairer: { kind: 'INDIVIDUAL' | 'PRO'; fiscalCompleted?: boolean } | null | undefined,
): boolean {
  return (
    commande.step === 'RELEASED' &&
    commande.hasStripeTransfer === false &&
    repairer?.kind === 'INDIVIDUAL' &&
    repairer.fiscalCompleted === false
  );
}
