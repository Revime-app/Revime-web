import * as SecureStore from 'expo-secure-store';
import { euros, type CommandeDto, type RepairerJourney } from '@revime/shared';

/**
 * V8 E1, mockup 4 (`DEC8-08` (7)). « Une dernière étape pour recevoir vos X »: shown ONCE per order, the first time
 * the repairer opens an accepted, paid order while « Virements » or (Particulier) « Informations fiscales » is still
 * unfinished. It never blocks anything: since V8 B2 the server holds the payout and pays it once setup is done, and
 * B2's « Paiement en attente » card stays on the order as the lasting reminder. This sheet is the moment the client
 * asked for: when an offer is accepted.
 */
export function payoutSheetDue(
  commande: Pick<CommandeDto, 'status' | 'step' | 'hasStripeTransfer' | 'refundedCents'>,
  journey: RepairerJourney | null,
  /**
   * V8 E1 (review I3). True when the identity or Connect status call failed: the journey then reads « Virements »
   * as to do, and showing the sheet would waste its one showing for this order on a false « Configurer ».
   */
  statusFailed = false,
): boolean {
  if (!journey || statusFailed) return false;
  if (commande.status !== 'PAID') return false;
  if ((commande.refundedCents ?? 0) > 0) return false;
  if (commande.step === 'RELEASED' && commande.hasStripeTransfer === true) return false;
  return journey.steps.some((s) => (s.key === 'payouts' || s.key === 'fiscal') && s.status !== 'done');
}

export type PayoutSheetContent = {
  title: string;
  body: string;
  rows: { label: string; done: boolean }[];
  action: { label: string; route: '/fiscalite' | '/statut-verification' } | null;
};

/**
 * The mockup's title and fiscal sentence verbatim; the payouts-only sentence and the done fiscal row are plan copy
 * (listed for the owner). The button goes to the first missing step in the mockup's order: Virements (its Stripe form
 * opens from the setup page), then Informations fiscales.
 */
export function payoutSheetContent(journey: RepairerJourney, payoutCents: number): PayoutSheetContent {
  const payouts = journey.steps.find((s) => s.key === 'payouts') ?? null;
  const fiscal = journey.steps.find((s) => s.key === 'fiscal') ?? null;
  const payoutsDone = payouts === null || payouts.status === 'done';
  const fiscalDone = fiscal === null || fiscal.status === 'done';

  const rows: PayoutSheetContent['rows'] = [];
  if (payouts) rows.push(payoutsDone ? { label: 'Virements activés', done: true } : { label: `Virements · ${payouts.minutes} min`, done: false });
  if (fiscal) {
    rows.push(
      fiscalDone
        ? { label: 'Informations fiscales renseignées', done: true }
        : { label: `Informations fiscales · ${fiscal.minutes} min`, done: false },
    );
  }

  return {
    // V8 `ISS8-020` (a): a non-breaking space, so a wrap never leaves « € » alone on the second line.
    title: `Une dernière étape pour recevoir vos ${euros(payoutCents).replace(' €', ' €')}`,
    body: !fiscalDone
      ? "Vos informations fiscales sont obligatoires pour être payé. Ça ne se fait qu'une fois."
      : "Vos virements doivent être activés pour être payé. Ça ne se fait qu'une fois.",
    rows,
    action: !payoutsDone
      ? { label: 'Configurer', route: '/statut-verification' }
      : !fiscalDone
        ? { label: 'Renseigner mes informations', route: '/fiscalite' }
        : null,
  };
}

/** SecureStore keys allow only alphanumerics, `.`, `-` and `_`; a commande id is a UUID. */
const seenKey = (commandeId: string) => `payout_sheet_seen_${commandeId}`;

/** A storage error (keychain locked, a test device) reads as « not seen »: showing it again is the safe failure. */
export function hasSeenPayoutSheet(commandeId: string): boolean {
  try {
    return SecureStore.getItem(seenKey(commandeId)) === '1';
  } catch {
    return false;
  }
}

export function markPayoutSheetSeen(commandeId: string): void {
  try {
    SecureStore.setItem(seenKey(commandeId), '1');
  } catch {
    // Not remembered on this device; the gate still hides it for the rest of this screen's life.
  }
}
