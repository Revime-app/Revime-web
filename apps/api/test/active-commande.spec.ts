import { describe, expect, it } from 'vitest';
import {
  computeAmounts,
  isActiveCommande,
  type CommandeListItem,
  type CommandeStatus,
  type CommandeStep,
} from '@revime/shared';

function row(status: CommandeStatus, step: CommandeStep): CommandeListItem {
  return {
    id: 'c1',
    demandeId: 'd1',
    demandeTitle: 'iPhone 13, écran cassé',
    counterpartyName: 'Malek',
    delivery: 'WORKSHOP',
    step,
    status,
    payoutCents: 12000,
    // payoutCents is the repair; the total is whatever the shared calculation says it is.
    totalCents: computeAmounts(12000, 'WORKSHOP').totalCents,
    createdAt: '2026-08-20T12:00:00.000Z',
    releasedAt: null,
    disputeOpen: false,
  };
}

/**
 * The definition of « en cours », in one place because two surfaces read it: the réparateur
 * Accueil's COMMANDES ACTIVES section and the count on its activity card. Two independent
 * filters is how those two come to disagree in one viewport.
 */
describe('isActiveCommande', () => {
  it('is true for a paid commande mid-journey', () => {
    expect(isActiveCommande(row('PAID', 'PAID'))).toBe(true);
    expect(isActiveCommande(row('PAID', 'PARCEL_SENT'))).toBe(true);
    expect(isActiveCommande(row('PAID', 'REPAIR_STARTED'))).toBe(true);
    expect(isActiveCommande(row('PAID', 'AWAITING_VALIDATION'))).toBe(true);
  });

  /**
   * RELEASED is the successful END. The work is done and the money has moved, so it belongs
   * in history, not on a list headed « actives » - this is the one exclusion that is about
   * the STEP rather than the status.
   */
  it('is false once the funds are released, because that is finished not active', () => {
    expect(isActiveCommande(row('PAID', 'RELEASED'))).toBe(false);
  });

  /**
   * The distinction `CommandeListItem.status` exists for. Without it a REFUNDED commande
   * renders as an ordinary live order, which is the defect the P5 spec §3 recorded.
   */
  it('is false for a refunded commande however far its step got', () => {
    expect(isActiveCommande(row('REFUNDED', 'REPAIR_STARTED'))).toBe(false);
    expect(isActiveCommande(row('REFUNDED', 'PAID'))).toBe(false);
  });

  it('is false for an abandoned commande', () => {
    expect(isActiveCommande(row('ABANDONED', 'PAID'))).toBe(false);
  });

  /**
   * PENDING_PAYMENT is a checkout that was started and never completed. Nothing is owed and
   * no work is expected, so surfacing it as active would tell a réparateur to begin a repair
   * nobody has paid for.
   */
  it('is false while payment has not completed', () => {
    expect(isActiveCommande(row('PENDING_PAYMENT', 'PAID'))).toBe(false);
  });
});
