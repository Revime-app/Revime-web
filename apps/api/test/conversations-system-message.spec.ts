import { describe, expect, it, vi } from 'vitest';
import { euros } from '@revime/shared';
import { toMessageDto, systemMessageBody, systemMessageFor, quoteCancelledSystemMessage } from '../src/conversations/system-message.js';

describe('quoteCancelledSystemMessage', () => {
  it('returns neutral cancellation copy for private quote cancellation', () => {
    expect(quoteCancelledSystemMessage()).toBe('Demande de devis annulée par le client.');
  });
});

describe('systemMessageBody', () => {
  it('reads correctly for BOTH parties, so it cannot say « votre réparateur »', () => {
    expect(systemMessageBody()).toBe(
      'Paiement effectué ✅ - Le paiement de la réparation a bien été effectué. Vous pouvez maintenant échanger pour organiser la suite de la réparation.',
    );
    expect(systemMessageBody()).not.toContain('votre réparateur');
  });
});

// CF4-17 (design §E). One row per AnnounceEvent, read by both parties - same rule as
// `systemMessageBody`: neither party is addressed by name, so one string serves both.
describe('systemMessageFor', () => {
  it('returns the exact French copy for each announce event', () => {
    expect(systemMessageFor('FUNDS_RELEASED')).toBe(
      '🎉 Réparation validée ! Les fonds ont été débloqués.',
    );
    expect(systemMessageFor('DISPUTE_OPENED')).toBe(
      "⚠️ Litige ouvert : REVIME examine la situation. Les fonds sont conservés jusqu'à la résolution.",
    );
    expect(systemMessageFor('DISPUTE_RELEASED')).toBe(
      '⚖️ Litige résolu : les fonds ont été versés au réparateur.',
    );
    expect(systemMessageFor('DISPUTE_REFUNDED')).toBe(
      '⚖️ Litige résolu : la commande a été remboursée au client.',
    );
    expect(systemMessageFor('DISPUTE_DISMISSED')).toBe(
      '⚖️ Litige clos : la commande reprend son cours normal.',
    );
    expect(systemMessageFor('REFUNDED')).toBe(
      '↩️ Commande remboursée : le client a été remboursé.',
    );
  });
});

// Task 3 (CF4-D). `REFUNDED` / `DISPUTE_REFUNDED` alone read the 2nd param: a non-null
// amount selects the partial-refund line instead of the full one. Every other event
// ignores it - the amount only makes sense once the refund is not the whole commande.
describe('systemMessageFor with partialRefundCents', () => {
  it('REFUNDED with an amount uses the partial-refund line naming that amount', () => {
    expect(systemMessageFor('REFUNDED', 4900)).toBe(
      `↩️ Remboursement partiel : ${euros(4900)} remboursés au client.`,
    );
  });

  it('DISPUTE_REFUNDED with an amount uses the partial-refund line naming that amount', () => {
    expect(systemMessageFor('DISPUTE_REFUNDED', 4900)).toBe(
      `⚖️ Litige résolu : remboursement partiel de ${euros(4900)} au client.`,
    );
  });

  it('REFUNDED with null or omitted keeps the full-refund line unchanged', () => {
    expect(systemMessageFor('REFUNDED', null)).toBe(
      '↩️ Commande remboursée : le client a été remboursé.',
    );
    expect(systemMessageFor('REFUNDED')).toBe(
      '↩️ Commande remboursée : le client a été remboursé.',
    );
  });

  it('DISPUTE_REFUNDED with null or omitted keeps the full-refund line unchanged', () => {
    expect(systemMessageFor('DISPUTE_REFUNDED', null)).toBe(
      '⚖️ Litige résolu : la commande a été remboursée au client.',
    );
    expect(systemMessageFor('DISPUTE_REFUNDED')).toBe(
      '⚖️ Litige résolu : la commande a été remboursée au client.',
    );
  });

  it('other events ignore the amount entirely', () => {
    expect(systemMessageFor('FUNDS_RELEASED', 4900)).toBe(
      '🎉 Réparation validée ! Les fonds ont été débloqués.',
    );
    expect(systemMessageFor('DISPUTE_OPENED', 4900)).toBe(
      "⚠️ Litige ouvert : REVIME examine la situation. Les fonds sont conservés jusqu'à la résolution.",
    );
    expect(systemMessageFor('DISPUTE_RELEASED', 4900)).toBe(
      '⚖️ Litige résolu : les fonds ont été versés au réparateur.',
    );
    expect(systemMessageFor('DISPUTE_DISMISSED', 4900)).toBe(
      '⚖️ Litige clos : la commande reprend son cours normal.',
    );
  });
});

describe('toMessageDto', () => {
  const at = new Date('2026-08-25T10:00:00.000Z');

  it('marks a USER message mine for its sender only', () => {
    const row = { id: 'm1', body: 'salut', senderUserId: 'u1', kind: 'USER' as const, createdAt: at };
    expect(toMessageDto(row, 'u1')).toMatchObject({ kind: 'USER', mine: true });
    expect(toMessageDto(row, 'u2')).toMatchObject({ kind: 'USER', mine: false });
  });

  it('attaches photoUrl when provided', () => {
    const row = { id: 'm1', body: 'regarde', senderUserId: 'u1', kind: 'USER' as const, createdAt: at };
    expect(toMessageDto(row, 'u1', 'https://signed.url/photo.jpg')).toEqual({
      id: 'm1',
      body: 'regarde',
      kind: 'USER',
      mine: true,
      createdAt: at.toISOString(),
      photoUrl: 'https://signed.url/photo.jpg',
    });
  });

  it('omits photoUrl property when photoUrl is undefined', () => {
    const row = { id: 'm1', body: 'salut', senderUserId: 'u1', kind: 'USER' as const, createdAt: at };
    const dto = toMessageDto(row, 'u1');
    expect('photoUrl' in dto).toBe(false);
  });

  // 🛑 The bug this test exists to stop: `null === userId` is false for EVERYONE, so
  // without an explicit kind branch a SYSTEM message renders as the counterpart's bubble
  // to BOTH readers.
  it('never marks a SYSTEM message mine, for either party', () => {
    const row = { id: 'm2', body: 'Paiement effectué', senderUserId: null, kind: 'SYSTEM' as const, createdAt: at };
    expect(toMessageDto(row, 'client')).toEqual({
      id: 'm2',
      body: 'Paiement effectué',
      kind: 'SYSTEM',
      mine: false,
      createdAt: at.toISOString(),
    });
    expect(toMessageDto(row, 'repairer').mine).toBe(false);
  });
});

// 🛑 RULING (pre-flight scan): an earlier draft of this plan had a third describe block
// here that built a `{ senderUserId: { not: 'me' } }` literal and then asserted on that
// same literal. It exercised no production code and would have read as coverage for
// something untested. It is deliberately NOT included.
//
// What it gestured at is real: `countUnread` filters `senderUserId: { not: userId }`,
// which Prisma emits as `<> $1`, which is NULL-not-true for a null sender - so a SYSTEM
// message is silently excluded from the unread count. That is the behaviour we want, but
// it can only be exercised against a real database, and this suite has none (the
// integration suite writes to production and must never run).
//
// So the contract lives in a comment on `countUnread` itself, and the ledger records that
// this behaviour is UNVERIFIED BY TEST rather than pretending otherwise.

describe('kind is the only thing that decides attribution', () => {
  const at = new Date('2026-08-25T10:00:00.000Z');

  // The real regression guard: if someone later derives `mine` from the sender alone,
  // this fails. That is a test of our code, unlike the literal-asserting version.
  it('a SYSTEM row with a sender id somehow set is still not mine', () => {
    const rogue = { id: 'm3', body: 'x', senderUserId: 'client', kind: 'SYSTEM' as const, createdAt: at };
    expect(toMessageDto(rogue, 'client').mine).toBe(false);
  });
});

describe('openForPayment with a closed conversation', () => {
  it('skips message creation when deletedAt is set', async () => {
    const mockTx = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'conv1', deletedAt: new Date() }),
        upsert: vi.fn(),
      },
      message: {
        count: vi.fn(),
        create: vi.fn(),
      },
    };

    const mockConversations = {
      openForPayment: async (input: { demandeId: string; clientUserId: string; repairerUserId: string }) => {
        const existing = await mockTx.conversation.findUnique({
          where: { demandeId_repairerUserId: { demandeId: input.demandeId, repairerUserId: input.repairerUserId } },
          select: { id: true, deletedAt: true },
        });
        if (existing?.deletedAt) return;
        await mockTx.conversation.upsert({ where: {}, create: {}, update: {}, select: {} } as any);
        await mockTx.message.create({ data: {} } as any);
      },
    };

    await mockConversations.openForPayment({
      demandeId: 'demande1',
      clientUserId: 'client1',
      repairerUserId: 'repairer1',
    });

    expect(mockTx.conversation.findUnique).toHaveBeenCalled();
    expect(mockTx.conversation.upsert).not.toHaveBeenCalled();
    expect(mockTx.message.create).not.toHaveBeenCalled();
  });
});
