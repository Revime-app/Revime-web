import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteRequestsService } from '../src/quote-requests/quote-requests.service.js';
import { CronService } from '../src/cron/cron.service.js';
import { OffersService, REPAIRER_SUSPENDED } from '../src/offers/offers.service.js';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import { CANCEL_PAYMENT_IN_FLIGHT, QUOTE_REQUEST_TTL_DAYS } from '@revime/shared';
import { QUOTE_ALREADY_ACCEPTED } from '../src/quote-requests/quote-request-messages.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * CF4-25 (spec §4.2). Every state change on a private request is a conditional write on
 * `status = 'OPEN'`; the loser of a race gets 409 and nothing else is written (Review Focus 2).
 */

const CLIENT = 'client-1';
const TARGET = 'repairer-1';
const OTHER = 'repairer-2';
const ID = 'd1';
const NOT_OPEN = "Cette demande n'est plus ouverte.";

type CommandeRow = {
  id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'ABANDONED';
  createdAt?: Date;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
};

type ConversationRow = {
  id: string;
  demandeId: string;
  clientUserId: string;
  repairerUserId: string;
  lastMessageAt?: Date;
  deletedAt?: Date | null;
};

// The fake gateway the service resolves through `paymentsGateway()`; every test decides what
// Stripe answers. `reset` in beforeEach so nothing leaks between tests.
const gw = {
  retrievePaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
  expireCheckoutSession: vi.fn(),
};
const intent = (status: string) => ({ id: 'pi_1', clientSecret: 's', status, chargeId: null });
const session = (status: 'open' | 'complete' | 'expired') => ({
  id: 'cs_1', url: '', status, paymentIntentId: null, chargeId: null,
});

beforeEach(() => {
  __resetPaymentsGateway();
  const real = paymentsGateway();
  vi.spyOn(real, 'retrievePaymentIntent').mockImplementation(gw.retrievePaymentIntent);
  vi.spyOn(real, 'cancelPaymentIntent').mockImplementation(gw.cancelPaymentIntent);
  vi.spyOn(real, 'retrieveCheckoutSession').mockImplementation(gw.retrieveCheckoutSession);
  vi.spyOn(real, 'expireCheckoutSession').mockImplementation(gw.expireCheckoutSession);
  for (const fn of Object.values(gw)) fn.mockReset();
  gw.retrievePaymentIntent.mockResolvedValue(intent('requires_payment_method'));
  gw.cancelPaymentIntent.mockResolvedValue(undefined);
  gw.retrieveCheckoutSession.mockResolvedValue(session('open'));
  gw.expireCheckoutSession.mockResolvedValue(undefined);
  process.env.MESSAGING_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.MESSAGING_ENABLED;
  vi.restoreAllMocks();
});

type Req = {
  id: string;
  title: string;
  status: string;
  authorUserId: string;
  targetRepairerUserId: string;
  offers: { id: string; repairerUserId: string }[];
};

function harness(opts: {
  request?: Partial<Req> | null;
  openWins?: boolean;
  offerWins?: boolean;
  commandes?: CommandeRow[];
  conversation?: ConversationRow | null;
} = {}) {
  const request: Req | null =
    opts.request === null
      ? null
      : { id: ID, title: 'Écran cassé', status: 'OPEN', authorUserId: CLIENT, targetRepairerUserId: TARGET, offers: [], ...opts.request };
  const writes: string[] = [];
  const commandes: CommandeRow[] = opts.commandes ? [...opts.commandes] : [];
  const conversations: { id: string; demandeId: string; clientUserId: string; repairerUserId: string; lastMessageAt?: Date; deletedAt?: Date | null }[] = opts.conversation ? [{ ...opts.conversation }] : [];
  const messages: { id: string; conversationId: string; senderUserId: string | null; kind: string; body: string; createdAt: Date }[] = [];
  const tx = {
    demande: {
      updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
        writes.push(`demande:${String(args.data.quoteClosedReason ?? 'update')}`);
        return { count: opts.openWins === false ? 0 : 1 };
      }),
    },
    offer: {
      updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
        writes.push(`offer:${String(args.data.status)}`);
        return { count: opts.offerWins === false ? 0 : 1 };
      }),
    },
    commande: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writes.push(`commande:${String(args.data.status ?? 'update')}`);
        return { count: 1 };
      }),
    },
    conversation: {
      findUnique: vi.fn(async () => conversations.find((c) => c.demandeId === ID && c.repairerUserId === TARGET) ?? null),
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        let conv = conversations.find((c) => c.demandeId === ID && c.repairerUserId === TARGET);
        if (conv) {
          Object.assign(conv, args.update);
        } else {
          conv = {
            id: 'conv-1',
            demandeId: ID,
            clientUserId: CLIENT,
            repairerUserId: TARGET,
            deletedAt: null,
            ...(args.create as { lastMessageAt?: Date }),
          };
          conversations.push(conv);
        }
        writes.push('conversation:upsert');
        return conv;
      }),
    },
    message: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const msg = {
          id: `msg-${messages.length + 1}`,
          conversationId: String(args.data.conversationId),
          senderUserId: (args.data.senderUserId as string | null) ?? null,
          kind: String(args.data.kind),
          body: String(args.data.body),
          createdAt: (args.data.createdAt as Date) ?? new Date(),
        };
        messages.push(msg);
        writes.push(`message:${msg.kind}`);
        return msg;
      }),
    },
  };
  const prisma = {
    demande: {
      // Honours the ownership keys in the WHERE the way Postgres would.
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        if (!request) return null;
        const w = args.where;
        if (w.authorUserId !== undefined && w.authorUserId !== request.authorUserId) return null;
        if (typeof w.targetRepairerUserId === 'string' && w.targetRepairerUserId !== request.targetRepairerUserId) return null;
        return request;
      }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    commande: {
      findFirst: vi.fn(async (args: { where: { status?: string } }) =>
        commandes.find((c) => c.status === args.where.status) ?? null,
      ),
      findMany: vi.fn(async (args: { where: { status?: string } }) =>
        commandes
          .filter((c) => c.status === args.where.status)
          .map((c) => ({
            stripePaymentIntentId: c.stripePaymentIntentId ?? null,
            stripeSessionId: c.stripeSessionId ?? null,
            createdAt: c.createdAt ?? new Date(),
          })),
      ),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      // Rolled back on throw: the writes recorded inside are discarded.
      const before = writes.length;
      try {
        return await fn(tx);
      } catch (e) {
        writes.splice(before);
        throw e;
      }
    }),
  };
  const emit = vi.fn().mockResolvedValue(undefined);
  const service = new QuoteRequestsService(
    withUserLookups(prisma) as unknown as PrismaService,
    {} as DemandesService,
    { emit } as unknown as NotificationsService,
  );
  return { service, prisma, tx, emit, writes, commandes, conversations, messages };
}

describe('decline', () => {
  it('only the target may decline (else 404)', async () => {
    const { service, emit } = harness();
    await expect(service.decline(OTHER, ID, { note: 'Trop loin' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.decline(CLIENT, ID, { note: 'Trop loin' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('→ CANCELLED + DECLINED + note, live quote withdrawn, QUOTE_DECLINED to the client', async () => {
    const { service, tx, emit, writes } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] } });
    expect(await service.decline(TARGET, ID, { note: 'Trop loin' })).toEqual({ ok: true });
    expect(tx.demande.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'OPEN' },
      data: { status: 'CANCELLED', quoteClosedReason: 'DECLINED', quoteDeclineNote: 'Trop loin', quoteExpiresAt: null },
    });
    expect(tx.offer.updateMany.mock.calls[0]![0]).toEqual({
      where: { demandeId: ID, status: 'SENT', deletedAt: null },
      data: { status: 'WITHDRAWN' },
    });
    // Demande first, then the offer (Review Focus 2), then reaping abandoned checkout.
    expect(writes).toEqual(['demande:DECLINED', 'offer:WITHDRAWN', 'commande:ABANDONED']);
    expect(emit).toHaveBeenCalledWith({
      userId: CLIENT,
      mode: 'CLIENT',
      type: 'QUOTE_DECLINED',
      actorName: null,
      subject: 'Écran cassé',
      demandeId: ID,
    });
  });

  it('rejects with QUOTE_ALREADY_ACCEPTED if a paid commande exists', async () => {
    const { service, tx } = harness({
      commandes: [{ id: 'c1', status: 'PAID' }],
    });
    await expect(service.decline(TARGET, ID, { note: 'Non' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: QUOTE_ALREADY_ACCEPTED,
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with CANCEL_PAYMENT_IN_FLIGHT while a checkout with no Stripe id is younger than 2 min', async () => {
    const recent = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    const { service, tx } = harness({
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: recent }],
    });
    await expect(service.decline(TARGET, ID, { note: 'Non' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: CANCEL_PAYMENT_IN_FLIGHT,
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('succeeds and reaps a PENDING_PAYMENT commande that never got a Stripe id (older than 2 min)', async () => {
    const abandoned = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const { service, tx, writes } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: abandoned }],
    });
    expect(await service.decline(TARGET, ID, { note: 'Non' })).toEqual({ ok: true });
    expect(tx.commande.updateMany).toHaveBeenCalledWith({
      where: { demandeId: ID, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });
    expect(writes).toContain('commande:ABANDONED');
  });

  it('rejects with QUOTE_NOT_OPEN if the request was already CANCELLED, without throwing QUOTE_ALREADY_ACCEPTED', async () => {
    const { service } = harness({
      request: { status: 'CANCELLED' },
      commandes: [{ id: 'c1', status: 'PAID' }],
    });
    await expect(service.decline(TARGET, ID, { note: 'Non' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: NOT_OPEN,
    });
  });

  it('rejects with QUOTE_ALREADY_ACCEPTED if request status is already IN_PROGRESS', async () => {
    const { service } = harness({
      request: { status: 'IN_PROGRESS' },
    });
    await expect(service.decline(TARGET, ID, { note: 'Non' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: QUOTE_ALREADY_ACCEPTED,
    });
  });
});

describe('refuse', () => {
  it('only the author may refuse (else 404)', async () => {
    const { service } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] } });
    await expect(service.refuse(TARGET, ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires a live quote', async () => {
    const { service, tx } = harness();
    await expect(service.refuse(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Aucun devis à refuser.',
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('→ offer REJECTED, CANCELLED + QUOTE_REFUSED, QUOTE_REFUSED to the réparateur', async () => {
    const { service, tx, emit, writes } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] } });
    expect(await service.refuse(CLIENT, ID)).toEqual({ ok: true });
    expect(tx.demande.updateMany.mock.calls[0]![0].data).toEqual({
      status: 'CANCELLED',
      quoteClosedReason: 'QUOTE_REFUSED',
      quoteExpiresAt: null,
    });
    expect(tx.offer.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'o1', status: 'SENT', deletedAt: null },
      data: { status: 'REJECTED' },
    });
    expect(writes).toEqual(['demande:QUOTE_REFUSED', 'offer:REJECTED', 'commande:ABANDONED']);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TARGET, mode: 'REPAIRER', type: 'QUOTE_REFUSED', subject: 'Écran cassé' }),
    );
  });

  it('a quote withdrawn in the meantime rolls the whole thing back → 409', async () => {
    const { service, emit, writes } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      offerWins: false,
    });
    await expect(service.refuse(CLIENT, ID)).rejects.toMatchObject({ code: 'CONFLICT', message: NOT_OPEN });
    expect(writes).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects with CANCEL_PAYMENT_IN_FLIGHT if a recent checkout is in flight (< 2 min)', async () => {
    const recent = new Date(Date.now() - 30 * 1000);
    const { service, tx } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: recent }],
    });
    await expect(service.refuse(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: CANCEL_PAYMENT_IN_FLIGHT,
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('succeeds and reaps abandoned PENDING_PAYMENT commande (>= 2 min) to ABANDONED', async () => {
    const abandoned = new Date(Date.now() - 5 * 60 * 1000);
    const { service, tx, writes } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: abandoned }],
    });
    expect(await service.refuse(CLIENT, ID)).toEqual({ ok: true });
    expect(tx.commande.updateMany).toHaveBeenCalledWith({
      where: { demandeId: ID, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });
    expect(writes).toContain('commande:ABANDONED');
  });
});

describe('cancel', () => {
  it('only the author may cancel (else 404)', async () => {
    const { service } = harness();
    await expect(service.cancel(OTHER, ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with QUOTE_ALREADY_ACCEPTED once a payment is done (PAID)', async () => {
    const { service, tx } = harness({
      commandes: [{ id: 'c1', status: 'PAID' }],
    });
    await expect(service.cancel(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: QUOTE_ALREADY_ACCEPTED,
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with CANCEL_PAYMENT_IN_FLIGHT once a payment is in flight (< 2 min)', async () => {
    const recent = new Date(Date.now() - 30 * 1000);
    const { service, tx } = harness({
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: recent }],
    });
    await expect(service.cancel(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: CANCEL_PAYMENT_IN_FLIGHT,
    });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('succeeds and reaps abandoned PENDING_PAYMENT commande (>= 2 min) to ABANDONED', async () => {
    const abandoned = new Date(Date.now() - 5 * 60 * 1000);
    const { service, tx, writes } = harness({
      commandes: [{ id: 'c1', status: 'PENDING_PAYMENT', createdAt: abandoned }],
    });
    expect(await service.cancel(CLIENT, ID)).toEqual({ ok: true });
    expect(tx.commande.updateMany).toHaveBeenCalledWith({
      where: { demandeId: ID, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });
    expect(writes).toContain('commande:ABANDONED');
  });

  it('→ CANCELLED + CANCELLED_BY_CLIENT, live quote WITHDRAWN, creates conversation, posts SYSTEM message, DEMANDE_WITHDRAWN with conversationId to the réparateur', async () => {
    const { service, tx, emit, writes } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] } });
    expect(await service.cancel(CLIENT, ID)).toEqual({ ok: true });
    expect(tx.demande.updateMany.mock.calls[0]![0].data).toEqual({
      status: 'CANCELLED',
      quoteClosedReason: 'CANCELLED_BY_CLIENT',
      quoteExpiresAt: null,
    });
    expect(tx.conversation.upsert).toHaveBeenCalledWith({
      where: {
        demandeId_repairerUserId: {
          demandeId: ID,
          repairerUserId: TARGET,
        },
      },
      create: {
        demandeId: ID,
        clientUserId: CLIENT,
        repairerUserId: TARGET,
        lastMessageAt: expect.any(Date),
      },
      update: { lastMessageAt: expect.any(Date) },
      select: { id: true },
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        senderUserId: null,
        kind: 'SYSTEM',
        body: 'Demande de devis annulée par le client.',
        createdAt: expect.any(Date),
      },
    });
    expect(writes).toEqual([
      'demande:CANCELLED_BY_CLIENT',
      'offer:WITHDRAWN',
      'commande:ABANDONED',
      'conversation:upsert',
      'message:SYSTEM',
    ]);
    expect(emit).toHaveBeenCalledWith({
      userId: TARGET,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'Écran cassé',
      demandeId: ID,
      conversationId: 'conv-1',
    });
  });

  it('does not post system message if conversation was closed by an operator', async () => {
    const { service, tx, emit, messages } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      conversation: {
        id: 'conv-closed',
        demandeId: ID,
        clientUserId: CLIENT,
        repairerUserId: TARGET,
        deletedAt: new Date(),
      },
    });
    expect(await service.cancel(CLIENT, ID)).toEqual({ ok: true });
    // Neither revived nor touched: no upsert means `lastMessageAt` was not bumped either.
    expect(tx.conversation.upsert).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(messages).toHaveLength(0);
    expect(emit).toHaveBeenCalledWith({
      userId: TARGET,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'Écran cassé',
      demandeId: ID,
    });
  });

  it('posts into an EXISTING conversation without creating a second one, and bumps lastMessageAt', async () => {
    const before = new Date('2026-10-01T00:00:00.000Z');
    const { service, conversations, messages, emit } = harness({
      request: { offers: [{ id: 'o1', repairerUserId: TARGET }] },
      conversation: { id: 'conv-9', demandeId: ID, clientUserId: CLIENT, repairerUserId: TARGET, lastMessageAt: before },
    });
    expect(await service.cancel(CLIENT, ID)).toEqual({ ok: true });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.lastMessageAt!.getTime()).toBeGreaterThan(before.getTime());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ conversationId: 'conv-9', kind: 'SYSTEM', senderUserId: null });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-9' }));
  });

  it('records nothing in a conversation while messaging is off, and the notification carries no conversationId', async () => {
    delete process.env.MESSAGING_ENABLED;
    const { service, tx, emit } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] } });
    expect(await service.cancel(CLIENT, ID)).toEqual({ ok: true });
    expect(tx.conversation.upsert).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(emit.mock.calls[0]![0]).not.toHaveProperty('conversationId');
  });

  it('rejects with QUOTE_ALREADY_ACCEPTED if request status is already DONE', async () => {
    const { service } = harness({
      request: { status: 'DONE' },
    });
    await expect(service.cancel(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: QUOTE_ALREADY_ACCEPTED,
    });
  });
});

// `refuse` needs a live quote to refuse; the others do not.
const TRANSITIONS: [string, (s: QuoteRequestsService) => Promise<unknown>, Partial<Req>][] = [
  ['decline', (s) => s.decline(TARGET, ID, { note: 'Non' }), {}],
  ['refuse', (s) => s.refuse(CLIENT, ID), { offers: [{ id: 'o1', repairerUserId: TARGET }] }],
  ['cancel', (s) => s.cancel(CLIENT, ID), {}],
];

describe.each(TRANSITIONS)('%s: a pending checkout is settled at Stripe before it is reaped (CF6-13)', (_name, act, request) => {
  const openIntent = (extra: Partial<CommandeRow> = {}): CommandeRow => ({
    id: 'c1',
    status: 'PENDING_PAYMENT',
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
    stripePaymentIntentId: 'pi_1',
    ...extra,
  });

  it('cancels a still-payable PaymentIntent first, then reaps, so a left-open PaymentSheet cannot charge', async () => {
    const { service, writes } = harness({ request, commandes: [openIntent()] });
    expect(await act(service)).toEqual({ ok: true });
    expect(gw.cancelPaymentIntent).toHaveBeenCalledWith('pi_1');
    expect(writes).toContain('commande:ABANDONED');
  });

  it('an already cancelled PaymentIntent is just reaped', async () => {
    gw.retrievePaymentIntent.mockResolvedValue(intent('canceled'));
    const { service, writes } = harness({ request, commandes: [openIntent()] });
    expect(await act(service)).toEqual({ ok: true });
    expect(gw.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(writes).toContain('commande:ABANDONED');
  });

  it('a PaymentIntent that already SUCCEEDED (webhook not landed yet) refuses with QUOTE_ALREADY_ACCEPTED and writes nothing', async () => {
    gw.retrievePaymentIntent.mockResolvedValue(intent('succeeded'));
    const { service, tx, emit } = harness({ request, commandes: [openIntent()] });
    await expect(act(service)).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY', message: QUOTE_ALREADY_ACCEPTED });
    expect(gw.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('a PaymentIntent still PROCESSING refuses with CANCEL_PAYMENT_IN_FLIGHT', async () => {
    gw.retrievePaymentIntent.mockResolvedValue(intent('processing'));
    const { service, tx } = harness({ request, commandes: [openIntent()] });
    await expect(act(service)).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY', message: CANCEL_PAYMENT_IN_FLIGHT });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('a payment that succeeds between the read and the cancel is caught by the re-read, not reaped', async () => {
    gw.retrievePaymentIntent
      .mockResolvedValueOnce(intent('requires_payment_method'))
      .mockResolvedValueOnce(intent('succeeded'));
    gw.cancelPaymentIntent.mockRejectedValue(new Error('payment_intent_unexpected_state'));
    const { service, tx } = harness({ request, commandes: [openIntent()] });
    await expect(act(service)).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY', message: QUOTE_ALREADY_ACCEPTED });
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('a cancel that fails for any other reason leaves the request open and rethrows', async () => {
    gw.cancelPaymentIntent.mockRejectedValue(new Error('stripe down'));
    const { service, tx } = harness({ request, commandes: [openIntent()] });
    await expect(act(service)).rejects.toThrow('stripe down');
    expect(tx.demande.updateMany).not.toHaveBeenCalled();
  });

  it('a Checkout Session already complete refuses; an open one is expired, then reaped', async () => {
    gw.retrieveCheckoutSession.mockResolvedValueOnce(session('complete'));
    const row = openIntent({ stripePaymentIntentId: null, stripeSessionId: 'cs_1' });
    const first = harness({ request, commandes: [row] });
    await expect(act(first.service)).rejects.toMatchObject({ message: QUOTE_ALREADY_ACCEPTED });

    const second = harness({ request, commandes: [row] });
    expect(await act(second.service)).toEqual({ ok: true });
    expect(gw.expireCheckoutSession).toHaveBeenCalledWith('cs_1');
    expect(second.writes).toContain('commande:ABANDONED');
  });
});

describe('a lost race answers 409 and writes nothing else (Review Focus 2)', () => {
  it.each([
    ['decline', (s: QuoteRequestsService) => s.decline(TARGET, ID, { note: 'Non' })],
    ['refuse', (s: QuoteRequestsService) => s.refuse(CLIENT, ID)],
    ['cancel', (s: QuoteRequestsService) => s.cancel(CLIENT, ID)],
  ] as const)('%s', async (_name, act) => {
    const { service, tx, emit } = harness({ request: { offers: [{ id: 'o1', repairerUserId: TARGET }] }, openWins: false });
    await expect(act(service)).rejects.toMatchObject({ code: 'CONFLICT', message: NOT_OPEN });
    expect(tx.offer.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([
    ['decline', (s: QuoteRequestsService) => s.decline(TARGET, ID, { note: 'Non' })],
    ['cancel', (s: QuoteRequestsService) => s.cancel(CLIENT, ID)],
  ] as const)('%s on an already closed request → 409 before any write', async (_name, act) => {
    const { service, prisma } = harness({ request: { status: 'CANCELLED' } });
    await expect(act(service)).rejects.toMatchObject({ code: 'CONFLICT', message: NOT_OPEN });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('expireDue (the cron job)', () => {
  const NOW = new Date('2026-10-08T00:00:00.000Z');

  it('selects OPEN private requests past expiry with no live quote', async () => {
    const { service, prisma } = harness();
    await service.expireDue(NOW);
    expect(prisma.demande.findMany.mock.calls[0]![0].where).toEqual({
      status: 'OPEN',
      targetRepairerUserId: { not: null },
      quoteExpiresAt: { lt: NOW },
      deletedAt: null,
      hiddenAt: null,
      offers: { none: { status: 'SENT', deletedAt: null } },
    });
  });

  it('closes each with a conditional write, notifies the client, counts acted / failed', async () => {
    const { service, prisma, emit } = harness();
    prisma.demande.findMany.mockResolvedValue([
      { id: 'a', title: 'A', authorUserId: 'c-a' },
      { id: 'b', title: 'B', authorUserId: 'c-b' },
      { id: 'c', title: 'C', authorUserId: 'c-c' },
    ]);
    prisma.demande.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 0 }); // raced: a quote arrived first
    const result = await service.expireDue(NOW);
    expect(result).toEqual({ scanned: 3, acted: 1, failed: 1 });
    expect(prisma.demande.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'a', status: 'OPEN', quoteExpiresAt: { lt: NOW } },
      data: { status: 'CANCELLED', quoteClosedReason: 'EXPIRED', quoteExpiresAt: null },
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      userId: 'c-a',
      mode: 'CLIENT',
      type: 'QUOTE_EXPIRED',
      actorName: null,
      subject: 'A',
      demandeId: 'a',
    });
  });

  it('a second run acts on nothing', async () => {
    const { service, emit } = harness();
    expect(await service.expireDue(NOW)).toEqual({ scanned: 0, acted: 0, failed: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('CronService.expireQuoteRequests delegates to it', async () => {
    const expireDue = vi.fn().mockResolvedValue({ scanned: 2, acted: 2, failed: 0 });
    const cron = new CronService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { expireDue } as unknown as QuoteRequestsService,
      {} as never, // FiscalService (CMP-D3), unused here
      {} as never, // SetupRemindersService (V8 E1), unused here
    );
    expect(await cron.expireQuoteRequests()).toEqual({ scanned: 2, acted: 2, failed: 0 });
    expect(expireDue).toHaveBeenCalledTimes(1);
  });
});

describe('offers.create on a private request (Review Focus 3)', () => {
  const input = {
    priceCents: 5000,
    delayHours: 24,
    warrantyLabel: 'Aucune' as const,
    partsLabel: "Pièce d'origine" as const,
    travel: 'WORKSHOP' as const,
    acceptsParcel: false,
  };

  function offers(opts: { openWins?: boolean; suspended?: boolean; row?: Record<string, unknown> } = {}) {
    const offerRow = {
      id: 'o1', repairerUserId: TARGET, priceCents: 5000, delayHours: 24, warrantyLabel: 'Aucune',
      partsLabel: "Pièce d'origine", travel: 'WORKSHOP', acceptsParcel: false, comment: null, status: 'SENT',
      createdAt: new Date(),
      repairer: { username: 'bob', createdAt: new Date(), repairerProfile: { displayName: 'Bob', postalCode: '69001', lat: null, lng: null }, profile: { verificationLevel: 'IDENTITY' } },
    };
    const tx = {
      demande: { updateMany: vi.fn().mockResolvedValue({ count: opts.openWins === false ? 0 : 1 }) },
      offer: { create: vi.fn().mockResolvedValue(offerRow) },
    };
    const prisma = {
      profile: {
        findFirst: vi.fn().mockResolvedValue({
          repairerEnabled: true,
          repairerSuspendedAt: opts.suspended ? new Date() : null,
          verificationLevel: 'IDENTITY',
        }),
      },
      repairerProfile: { findUnique: vi.fn().mockResolvedValue({ kind: 'INDIVIDUAL' }), findFirst: vi.fn().mockResolvedValue({ kind: 'INDIVIDUAL' }) },
      demande: {
        findFirst: vi.fn().mockResolvedValue({
          id: ID, authorUserId: CLIENT, status: 'OPEN', title: 'Écran cassé', mode: 'OFFERS', budgetCents: null,
          targetRepairerUserId: TARGET,
          ...opts.row,
        }),
      },
      offer: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      review: { groupBy: vi.fn().mockResolvedValue([]) },
      // `findMany`: V7 A10's CGU art. 53 cap reads an INDIVIDUAL's paid missions; this one has none.
      commande: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const emit = vi.fn().mockResolvedValue(undefined);
    const service = new OffersService(withUserLookups(prisma) as unknown as PrismaService, { emit } as unknown as NotificationsService);
    return { service, prisma, tx, emit };
  }

  it('clears quoteExpiresAt in a write conditional on OPEN, then creates the offer in the same transaction', async () => {
    const { service, prisma, tx, emit } = offers();
    await service.create(TARGET, ID, input);
    expect(tx.demande.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'OPEN', targetRepairerUserId: TARGET },
      data: { quoteExpiresAt: null },
    });
    expect(tx.offer.create).toHaveBeenCalledTimes(1);
    expect(prisma.offer.create).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'OFFER_RECEIVED', userId: CLIENT }));
  });

  it('loses to a close (expire / decline / cancel) → 409 and no offer', async () => {
    const { service, tx, emit } = offers({ openWins: false });
    await expect(service.create(TARGET, ID, input)).rejects.toMatchObject({ code: 'CONFLICT', message: NOT_OPEN });
    expect(tx.offer.create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('a suspended target is still refused by the existing gate, before any demande read', async () => {
    const { service, prisma } = offers({ suspended: true });
    await expect(service.create(TARGET, ID, input)).rejects.toThrow(REPAIRER_SUSPENDED);
    expect(prisma.demande.findFirst).not.toHaveBeenCalled();
  });

  it('a private request with a « budget éventuel » accepts the réparateur\'s own price (H3: the budget is indicative)', async () => {
    const { service, tx } = offers({ row: { mode: 'BUDGET', budgetCents: 3000 } });
    await service.create(TARGET, ID, input); // 5000 ≠ 3000
    expect(tx.offer.create).toHaveBeenCalledTimes(1);
  });
});

describe('offers.withdraw on a private request re-arms the expiry (else it would stay OPEN forever)', () => {
  function withdrawHarness(targetRepairerUserId: string | null) {
    const offerUpdate = vi.fn().mockResolvedValue({});
    const demandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      offer: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'o1',
          status: 'SENT',
          demande: { id: ID, status: 'OPEN', targetRepairerUserId },
          _count: { commandes: 0 },
        }),
        update: offerUpdate,
      },
      demande: { updateMany: demandeUpdateMany },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    const service = new OffersService(withUserLookups(prisma) as unknown as PrismaService, { emit: vi.fn() } as unknown as NotificationsService);
    return { service, prisma, offerUpdate, demandeUpdateMany };
  }

  it('withdraws the quote and sets quoteExpiresAt to now + TTL, conditional on OPEN / target / unarmed, in one transaction', async () => {
    const { service, prisma, offerUpdate, demandeUpdateMany } = withdrawHarness(TARGET);
    const before = Date.now();
    await service.withdraw(TARGET, 'o1');
    expect(offerUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'WITHDRAWN' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const call = demandeUpdateMany.mock.calls[0]![0] as { where: unknown; data: { quoteExpiresAt: Date } };
    expect(call.where).toEqual({ id: ID, status: 'OPEN', targetRepairerUserId: TARGET, quoteExpiresAt: null });
    const ms = call.data.quoteExpiresAt.getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(QUOTE_REQUEST_TTL_DAYS * 86_400_000 - 1000);
    expect(ms).toBeLessThanOrEqual(QUOTE_REQUEST_TTL_DAYS * 86_400_000 + 5000);
  });

  it('leaves a public demande alone (no transaction, no demande write)', async () => {
    const { service, prisma, offerUpdate, demandeUpdateMany } = withdrawHarness(null);
    await service.withdraw(TARGET, 'o1');
    expect(offerUpdate).toHaveBeenCalledTimes(1);
    expect(demandeUpdateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('older app builds: PATCH / DELETE on a private request (Review Focus 4)', () => {
  function demandes(row: Record<string, unknown>) {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ clientEnabled: true, verificationLevel: 'BASIC' }) },
      demande: { findFirst: vi.fn().mockResolvedValue(row), update: vi.fn() },
      offer: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new DemandesService(withUserLookups(prisma) as unknown as PrismaService, {} as GeocodeService, {} as NotificationsService);
    return { service, prisma };
  }
  const privateRow = {
    id: ID, status: 'OPEN', title: 'Écran cassé', targetRepairerUserId: TARGET,
    _count: { offers: 0, commandes: 0 }, photos: [],
  };

  it('PATCH → 422 with the spec message, nothing written', async () => {
    const { service, prisma } = demandes(privateRow);
    await expect(service.update(CLIENT, ID, {} as never)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Une demande de devis ne peut pas être modifiée. Annulez-la et envoyez-en une nouvelle.',
    });
    expect(prisma.demande.update).not.toHaveBeenCalled();
  });

  it('DELETE → 422 pointing at « Annuler la demande », nothing written', async () => {
    const { service, prisma } = demandes(privateRow);
    await expect(service.softDelete(CLIENT, ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Utilisez « Annuler la demande ».',
    });
    expect(prisma.demande.update).not.toHaveBeenCalled();
  });
});

describe('account deletion closes private requests (Review Focus 3)', () => {
  const USER = 'u-deleted';
  let tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  beforeEach(() => {
    const ok = () => vi.fn().mockResolvedValue({ count: 0 });
    tx = {
      user: {
        update: ok(),
        findUnique: vi.fn().mockResolvedValue({ role: 'user' }),
        count: vi.fn().mockResolvedValue(3),
      },
      profile: { update: ok() },
      repairerProfile: { updateMany: ok() },
      session: { deleteMany: ok() },
      account: { deleteMany: ok() },
      verificationAttempt: { deleteMany: ok() },
      favoriteRepairer: { deleteMany: ok() },
      favoriteDemande: { deleteMany: ok() },
      repairerCategory: { deleteMany: ok() },
      repairerAvailability: { deleteMany: ok() },
      demande: { updateMany: ok() },
      offer: { updateMany: ok() },
      dispute: { updateMany: ok() },
      conversationReport: { updateMany: ok() },
    };
  });

  it('his open requests → CANCELLED_BY_CLIENT; requests to him → DECLINED with no note; live quotes withdrawn first', async () => {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ userId: USER, deletedAt: null }) },
      commande: { count: vi.fn().mockResolvedValue(0) },
      identityVerification: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    const service = new UsersService(withUserLookups(prisma) as unknown as PrismaService, { lookup: vi.fn() } as unknown as GeocodeService);
    await service.deleteAccount(USER);

    const offerCalls = tx.offer!.updateMany!.mock.calls.map((c) => c[0]);
    expect(offerCalls).toEqual([
      {
        where: { status: 'SENT', deletedAt: null, demande: { status: 'OPEN', authorUserId: USER, targetRepairerUserId: { not: null } } },
        data: { status: 'WITHDRAWN' },
      },
      {
        where: { status: 'SENT', deletedAt: null, demande: { status: 'OPEN', targetRepairerUserId: USER } },
        data: { status: 'WITHDRAWN' },
      },
    ]);
    const demandeCalls = tx.demande!.updateMany!.mock.calls.map((c) => c[0]);
    expect(demandeCalls).toEqual([
      {
        where: { status: 'OPEN', authorUserId: USER, targetRepairerUserId: { not: null } },
        data: { status: 'CANCELLED', quoteClosedReason: 'CANCELLED_BY_CLIENT', quoteExpiresAt: null },
      },
      {
        where: { status: 'OPEN', targetRepairerUserId: USER },
        data: { status: 'CANCELLED', quoteClosedReason: 'DECLINED', quoteDeclineNote: null, quoteExpiresAt: null },
      },
    ]);
    // Offers before demandes, so no live quote is left on a CANCELLED request even mid-transaction.
    expect(tx.offer!.updateMany!.mock.invocationCallOrder[1]!).toBeLessThan(
      tx.demande!.updateMany!.mock.invocationCallOrder[0]!,
    );
  });
});
