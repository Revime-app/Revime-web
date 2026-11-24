import { describe, expect, it, vi } from 'vitest';
import {
  notifyClientOfPaidCommande,
  notifyClientOfAbandonedPayment,
} from '../src/payments/payment-notifications.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CF-43. Both of these are post-transaction webhook side effects, extracted for the same
 * reason `open-conversation.ts` was: `completeBySessionId` and `abandonBySessionId` cannot be
 * reached from a unit test without a database, Stripe and a webhook, and `test:unit` excludes
 * every int spec - so an emit left inline in the service has NO gate that can ever run on it.
 *
 * The recipient is what these tests exist to pin. Both notifications are addressed to the
 * CLIENT and sit directly beside emits addressed to the réparateur, which is exactly the
 * shape a copy-paste gets wrong, and a wrong recipient is invisible in review.
 */
const commande = {
  id: 'cmd1',
  demandeId: 'd1',
  clientUserId: 'client-1',
  repairerUserId: 'repairer-1',
  repairCents: 6500,
};

describe('notifyClientOfPaidCommande', () => {
  it('notifies the CLIENT that his payment cleared', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);

    await notifyClientOfPaidCommande({ emit } as never, commande, 'Écran iPhone 13 fissuré');

    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0]).toMatchObject({
      userId: 'client-1',
      mode: 'CLIENT',
      type: 'COMMANDE_STEP',
      step: 'PAID',
      subject: 'Écran iPhone 13 fissuré',
      amountCents: 6500,
      demandeId: 'd1',
      commandeId: 'cmd1',
    });
  });

  // 🛑 The whole reason this is a function and not an inline call. The emit it sits beside in
  // completeBySessionId targets commande.repairerUserId, and the réparateur already has
  // OFFER_ACCEPTED for this same event - so sending PAID there would notify him twice about
  // one payment and still leave the client silent.
  it('never addresses the réparateur', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    await notifyClientOfPaidCommande({ emit } as never, commande, null);
    expect(emit.mock.calls[0]![0].userId).not.toBe('repairer-1');
    expect(emit.mock.calls[0]![0].mode).not.toBe('REPAIRER');
  });

  it('carries NO actor, because the client is being told about his own act', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    await notifyClientOfPaidCommande({ emit } as never, commande, null);
    // The PAID copy interpolates no actor at all, so a name here would be dead data that a
    // later copy edit could surface. Absence gets one representation, and it is null.
    expect(emit.mock.calls[0]![0].actorName).toBeNull();
    expect(emit.mock.calls[0]![0].subject).toBeNull();
  });
});

describe('notifyClientOfAbandonedPayment', () => {
  it('notifies the CLIENT that the payment never completed', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);

    await notifyClientOfAbandonedPayment({ emit } as never, commande, 'Écran iPhone 13 fissuré', 1);

    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0]).toMatchObject({
      userId: 'client-1',
      mode: 'CLIENT',
      type: 'PAYMENT_ABANDONED',
      subject: 'Écran iPhone 13 fissuré',
      demandeId: 'd1',
      commandeId: 'cmd1',
    });
  });

  // 🛑 The subject has to be SUPPLIED, not merely supported. The PAYMENT_ABANDONED copy has a
  // subject arm, and CF-30 is this repo's standing example of what happens when a field is
  // collected and rendered by nothing: `partsLabel` reached the client's app for weeks with
  // zero read sites. A hardcoded null here would make that copy arm dead in production and
  // testable only from a spec - which looks like coverage and is the opposite.
  it('passes the demande title through so the copy can name it', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    await notifyClientOfAbandonedPayment({ emit } as never, commande, 'Batterie gonflée', 1);
    expect(emit.mock.calls[0]![0].subject).toBe('Batterie gonflée');
  });

  it('still emits when the title is absent', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    await notifyClientOfAbandonedPayment({ emit } as never, commande, null, 1);
    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0].subject).toBeNull();
  });

  // 🛑 abandonBySessionId uses updateMany and is called from TWO places: the
  // checkout.session.expired webhook and P5's orphan-session job. Without this guard the
  // second caller re-notifies a lapse the client was already told about, or notifies about a
  // commande that had already moved on - updateMany matching nothing is not an error.
  it('stays silent when the update changed no row', async () => {
    const emit = vi.fn();
    await notifyClientOfAbandonedPayment({ emit } as never, commande, 'Écran iPhone 13 fissuré', 0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('carries no amount, because nothing was charged', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    await notifyClientOfAbandonedPayment({ emit } as never, commande, null, 1);
    // « Paiement non finalisé » with a figure beside it reads as a debit. Nothing left the
    // client's account, so no amount is the honest shape.
    expect(emit.mock.calls[0]![0].amountCents ?? null).toBeNull();
  });
});

/**
 * The functions above are pure enough to test directly; passing them proves nothing about
 * whether the SERVICE calls them. PaymentsService takes only three constructor dependencies,
 * so the real method runs against doubles - no Nest container, no database, no Stripe. Without
 * this, the wiring would be covered only by int specs, which `test:unit` excludes and which
 * write to the production database.
 */
describe('PaymentsService.abandonBySessionId - the wiring, not just the helper', () => {
  function serviceWith(count: number) {
    const emit = vi.fn().mockResolvedValue(undefined);
    const updateMany = vi.fn().mockResolvedValue({ count });
    const findFirst = vi.fn().mockResolvedValue({
      id: 'cmd1',
      demandeId: 'd1',
      clientUserId: 'client-1',
      demande: { title: 'Écran iPhone 13 fissuré' },
    });
    const prisma = { commande: { updateMany, findFirst } } as unknown as PrismaService;
    const service = new PaymentsService(
      prisma,
      { emit } as unknown as NotificationsService,
      {} as unknown as ConversationsService,
    );
    return { service, emit, updateMany, findFirst };
  }

  it('notifies the client, with the demande title, when a session expired unpaid', async () => {
    const { service, emit } = serviceWith(1);

    await service.abandonBySessionId('cs_test_1');

    expect(emit).toHaveBeenCalledOnce();
    expect(emit.mock.calls[0]![0]).toMatchObject({
      userId: 'client-1',
      mode: 'CLIENT',
      type: 'PAYMENT_ABANDONED',
      subject: 'Écran iPhone 13 fissuré',
    });
  });

  // 🛑 The guard, at the level that actually runs it. `updateMany` matching nothing is a
  // success in Prisma, so this is the difference between notifying once and notifying every
  // time P5's orphan-session job revisits an already-abandoned row.
  it('emits nothing, and does not even read, when no row changed', async () => {
    const { service, emit, findFirst } = serviceWith(0);
    await service.abandonBySessionId('cs_test_1');
    expect(emit).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does nothing at all on an empty session id', async () => {
    const { service, emit, updateMany } = serviceWith(1);
    await service.abandonBySessionId('');
    expect(updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
