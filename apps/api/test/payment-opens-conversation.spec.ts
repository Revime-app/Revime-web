import { describe, expect, it, vi } from 'vitest';
import { openConversationForPaidCommande } from '../src/payments/open-conversation.js';

describe('openConversationForPaidCommande', () => {
  const commande = { demandeId: 'd1', clientUserId: 'c1', repairerUserId: 'r1' };

  it('opens the conversation with the commande facts', async () => {
    const openForPayment = vi.fn().mockResolvedValue(undefined);
    await openConversationForPaidCommande({ openForPayment } as never, commande, true);
    expect(openForPayment).toHaveBeenCalledWith({
      demandeId: 'd1',
      clientUserId: 'c1',
      repairerUserId: 'r1',
    });
  });

  // The money path must not depend on a messaging flag. MESSAGING_ENABLED is true in
  // production today, but "today" is not a guarantee.
  it('skips silently when messaging is off, rather than throwing', async () => {
    const openForPayment = vi.fn();
    await openConversationForPaidCommande({ openForPayment } as never, commande, false);
    expect(openForPayment).not.toHaveBeenCalled();
  });

  // 🛑 The whole point. A throw here would release Stripe's claim and re-enter
  // compensation on a payment that already succeeded.
  it('SWALLOWS a failure instead of letting it reach the webhook', async () => {
    const openForPayment = vi.fn().mockRejectedValue(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      openConversationForPaidCommande({ openForPayment } as never, commande, true),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
