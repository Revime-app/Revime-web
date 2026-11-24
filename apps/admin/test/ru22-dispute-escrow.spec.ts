import { describe, expect, it } from 'vitest';
import { escrowCard } from '../lib/dispute-escrow';

describe('RU-22 · P19 escrow card', () => {
  it('says « bloqué » only while the dispute is open on a paid order', () => {
    expect(escrowCard({ disputeStatus: 'OPEN', commandeStatus: 'PAID' }).title).toBe('Total bloqué');
    expect(escrowCard({ disputeStatus: 'IN_REVIEW', commandeStatus: 'PAID' }).caption).toBe('Sur compte séquestre');
  });

  it('stops saying it once the dispute is closed', () => {
    for (const disputeStatus of ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED']) {
      expect(escrowCard({ disputeStatus, commandeStatus: 'PAID' })).toEqual({
        title: 'Total de la commande',
        caption: 'Litige clos',
      });
    }
  });

  it('stops saying it on a refunded order whatever the dispute row says', () => {
    expect(escrowCard({ disputeStatus: 'OPEN', commandeStatus: 'REFUNDED' }).title).toBe('Total de la commande');
  });
});
