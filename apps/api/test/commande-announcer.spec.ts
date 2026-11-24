import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';
import { systemMessageFor } from '../src/conversations/system-message.js';

// CF4-17 (design §E). `announce` is the single place a commande lifecycle event becomes
// both a system message and a notification pair - fake prisma + fake notifications, no
// database, per constraints.md.
describe('CommandeAnnouncer.announce', () => {
  const commandeRow = {
    id: 'c1',
    clientUserId: 'cl',
    repairerUserId: 'rp',
    demandeId: 'd1',
    repairCents: 8000,
    transferredCents: 8000,
    demande: { title: 'Écran' },
  };

  let prisma: {
    commande: { findUnique: ReturnType<typeof vi.fn> };
    conversation: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    message: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let notifications: { emit: ReturnType<typeof vi.fn> };
  let announcer: CommandeAnnouncer;

  beforeEach(() => {
    prisma = {
      commande: { findUnique: vi.fn().mockResolvedValue(commandeRow) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conv1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (ops: unknown) => ops),
    };
    notifications = { emit: vi.fn().mockResolvedValue(undefined) };
    announcer = new CommandeAnnouncer(prisma as never, notifications as never);
  });

  it('posts the DISPUTE_OPENED system message and notifies both parties', async () => {
    await announcer.announce('c1', 'DISPUTE_OPENED');

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv1',
          senderUserId: null,
          kind: 'SYSTEM',
          body: systemMessageFor('DISPUTE_OPENED'),
        }),
      }),
    );
    expect(notifications.emit).toHaveBeenCalledTimes(2);
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'cl',
      mode: 'CLIENT',
      type: 'DISPUTE_OPENED',
      subject: 'Écran',
      commandeId: 'c1',
    });
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'rp',
      mode: 'REPAIRER',
      type: 'DISPUTE_OPENED',
      subject: 'Écran',
      commandeId: 'c1',
    });
  });

  it('posts the DISPUTE_DISMISSED system message and notifies both parties, same shape', async () => {
    await announcer.announce('c1', 'DISPUTE_DISMISSED');

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: systemMessageFor('DISPUTE_DISMISSED') }),
      }),
    );
    expect(notifications.emit).toHaveBeenCalledTimes(2);
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'cl',
      mode: 'CLIENT',
      type: 'DISPUTE_DISMISSED',
      subject: 'Écran',
      commandeId: 'c1',
    });
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'rp',
      mode: 'REPAIRER',
      type: 'DISPUTE_DISMISSED',
      subject: 'Écran',
      commandeId: 'c1',
    });
  });

  it('DISPUTE_RELEASED emits FUNDS_RELEASED to both parties with amountCents', async () => {
    await announcer.announce('c1', 'DISPUTE_RELEASED');

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: systemMessageFor('DISPUTE_RELEASED') }),
      }),
    );
    expect(notifications.emit).toHaveBeenCalledTimes(2);
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'cl',
      mode: 'CLIENT',
      type: 'FUNDS_RELEASED',
      subject: 'Écran',
      commandeId: 'c1',
      amountCents: 8000,
    });
    expect(notifications.emit).toHaveBeenCalledWith({
      userId: 'rp',
      mode: 'REPAIRER',
      type: 'FUNDS_RELEASED',
      subject: 'Écran',
      commandeId: 'c1',
      amountCents: 8000,
    });
  });

  it.each(['FUNDS_RELEASED', 'DISPUTE_REFUNDED', 'REFUNDED'] as const)(
    '%s posts the message but never calls emit (notified elsewhere)',
    async (event) => {
      await announcer.announce('c1', event);

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ body: systemMessageFor(event) }),
        }),
      );
      expect(notifications.emit).not.toHaveBeenCalled();
    },
  );

  it('no conversation: skips the message but still emits twice', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await announcer.announce('c1', 'DISPUTE_OPENED');

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(notifications.emit).toHaveBeenCalledTimes(2);
  });

  it('never throws when commande.findUnique rejects', async () => {
    prisma.commande.findUnique.mockRejectedValue(new Error('db down'));

    await expect(announcer.announce('c1', 'DISPUTE_OPENED')).resolves.toBeUndefined();
  });

  it('never throws when message.create rejects, and still emits', async () => {
    prisma.$transaction.mockRejectedValue(new Error('write failed'));

    await expect(announcer.announce('c1', 'DISPUTE_OPENED')).resolves.toBeUndefined();
    expect(notifications.emit).toHaveBeenCalledTimes(2);
  });

  it('resolves and does nothing when the commande is not found', async () => {
    prisma.commande.findUnique.mockResolvedValue(null);

    await announcer.announce('c1', 'DISPUTE_OPENED');

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  // Task 3 (CF4-D). The 3rd param threads straight into `systemMessageFor` so the posted
  // system message names the partial amount - `announce` itself does no formatting.
  it('REFUNDED with a partialRefundCents posts the partial-refund line', async () => {
    await announcer.announce('c1', 'REFUNDED', 4900);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: systemMessageFor('REFUNDED', 4900) }),
      }),
    );
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('REFUNDED without a 3rd argument still posts the full-refund line', async () => {
    await announcer.announce('c1', 'REFUNDED');

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: systemMessageFor('REFUNDED') }),
      }),
    );
  });
});
