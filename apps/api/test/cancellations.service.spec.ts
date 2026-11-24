import { describe, expect, it, vi, type Mock } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { CancellationsService } from '../src/cancellations/cancellations.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CF4-27 (spec §4.2, §4.4). `POST commandes/:id/cancellation` (request) and
 * `POST commandes/:id/cancellation/withdraw`. Style follows `demandes-cancel.spec.ts` and
 * `quote-requests-transitions.spec.ts` for the array/callback `$transaction` stubs.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const OTHER = '44444444-4444-4444-8444-444444444444';
const COMMANDE = '33333333-3333-4333-8333-333333333333';

type Row = {
  id: string;
  clientUserId: string;
  repairerUserId: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'ABANDONED' | 'REFUNDED';
  step: string | null;
  stripeTransferId: string | null;
  disputedAt: Date | null;
  cancellationRequestedAt: Date | null;
  demande: { title: string };
  dispute: { status: string } | null;
};

function storedRow(opts: Partial<Row> = {}): Row {
  return {
    id: COMMANDE,
    clientUserId: CLIENT,
    repairerUserId: REPAIRER,
    status: 'PAID',
    step: 'REPAIR_STARTED',
    stripeTransferId: null,
    disputedAt: null,
    cancellationRequestedAt: null,
    demande: { title: 'iPhone 13, écran cassé' },
    dispute: null,
    ...opts,
  };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

function bodyOf(error: AppException): { message: string; fields?: Record<string, string> } {
  return error.getResponse() as { message: string; fields?: Record<string, string> };
}

describe('CancellationsService.request', () => {
  type Opts = {
    row?: Row | null;
    /** count returned by commande.updateMany's conditional write. */
    updateCount?: number;
    p2002?: boolean;
    notificationsEmit?: Mock;
  };

  function harness({ row = storedRow(), updateCount = 1, p2002 = false, notificationsEmit }: Opts = {}) {
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: updateCount });
    const requestCreate = p2002
      ? vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
      : vi.fn().mockResolvedValue({
          id: 'req-1',
          status: 'PENDING',
          reason: 'TOO_SLOW',
          comment: null,
          refusalNote: null,
          createdAt: new Date('2026-09-30T12:00:00.000Z'),
        });

    const tx = {
      commande: { updateMany: commandeUpdateMany },
      cancellationRequest: { create: requestCreate },
    };

    const commandeFindFirst = vi.fn().mockResolvedValue(row);
    const prisma = {
      commande: { findFirst: commandeFindFirst, updateMany: commandeUpdateMany },
      cancellationRequest: { create: requestCreate },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const notifications = { emit: notificationsEmit ?? vi.fn().mockResolvedValue(undefined) };
    return {
      service: new CancellationsService(prisma, notifications as unknown as NotificationsService),
      commandeFindFirst,
      commandeUpdateMany,
      requestCreate,
      notificationsEmit: notifications.emit,
    };
  }

  it('404s when the caller is not the client (including the réparateur)', async () => {
    const { service, commandeUpdateMany } = harness({ row: null });
    const error = await rejection(service.request(OTHER, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).message).toBe('Ressource introuvable.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('404s the réparateur of this very commande too', async () => {
    // The findFirst's WHERE is clientUserId-scoped, so the stub returning null covers this;
    // asserted at the query level below.
    const { service, commandeFindFirst } = harness({ row: null });
    await rejection(service.request(REPAIRER, COMMANDE, { reason: 'TOO_SLOW' }));
    const call = commandeFindFirst.mock.calls[0];
    if (!call) throw new Error('expected the read to have been called');
    expect(call[0].where).toMatchObject({ id: COMMANDE, clientUserId: REPAIRER });
  });

  it('refuses (existing message) a REFUNDED commande', async () => {
    const row = storedRow({ status: 'REFUNDED' });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Ce paiement a déjà été remboursé.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s a not-yet-PAID commande', async () => {
    const row = storedRow({ status: 'PENDING_PAYMENT' });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s CANCELLATION_RELEASED once RELEASED', async () => {
    const row = storedRow({ step: 'RELEASED' });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Les fonds ont déjà été versés : ouvrez un litige.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s CANCELLATION_RELEASED once a transfer has succeeded', async () => {
    const row = storedRow({ stripeTransferId: 'tr_123' });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Les fonds ont déjà été versés : ouvrez un litige.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s CANCELLATION_DISPUTED once disputedAt is set', async () => {
    const row = storedRow({ disputedAt: new Date() });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Un litige est en cours sur cette commande.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s CANCELLATION_DISPUTED while an OPEN dispute exists', async () => {
    const row = storedRow({ dispute: { status: 'OPEN' } });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Un litige est en cours sur cette commande.');
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('409s CANCELLATION_ALREADY_PENDING when already pending (flag set)', async () => {
    const row = storedRow({ cancellationRequestedAt: new Date() });
    const { service, commandeUpdateMany } = harness({ row });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Une demande d'annulation est déjà en cours.");
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('409s CANCELLATION_ALREADY_PENDING when the conditional write loses the race (count 0)', async () => {
    const { service, requestCreate } = harness({ updateCount: 0 });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Une demande d'annulation est déjà en cours.");
    expect(requestCreate).not.toHaveBeenCalled();
  });

  it('409s CANCELLATION_ALREADY_PENDING on a P2002 from the partial unique index', async () => {
    const { service } = harness({ p2002: true });
    const error = await rejection(service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' }));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Une demande d'annulation est déjà en cours.");
  });

  it('writes the conditional commande flag, then creates the request, in one transaction', async () => {
    const { service, commandeUpdateMany, requestCreate } = harness();

    await service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' });

    const updateCall = commandeUpdateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: { cancellationRequestedAt: Date };
    };
    expect(updateCall.where).toEqual({
      id: COMMANDE,
      status: 'PAID',
      stripeTransferId: null,
      step: { not: 'RELEASED' },
      disputedAt: null,
      cancellationRequestedAt: null,
    });
    expect(updateCall.data.cancellationRequestedAt).toBeInstanceOf(Date);

    expect(requestCreate).toHaveBeenCalledTimes(1);
    const createCall = requestCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createCall.data).toMatchObject({
      commandeId: COMMANDE,
      requestedByUserId: CLIENT,
      reason: 'TOO_SLOW',
      status: 'PENDING',
    });
  });

  it('notifies the réparateur after commit, with the reason label as actorName', async () => {
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const { service } = harness({ notificationsEmit });

    await service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' });

    expect(notificationsEmit).toHaveBeenCalledWith({
      userId: REPAIRER,
      mode: 'REPAIRER',
      type: 'CANCELLATION_REQUESTED',
      actorName: 'Délai trop long',
      subject: 'iPhone 13, écran cassé',
      commandeId: COMMANDE,
    });
  });

  it('returns the CancellationRequestInfo shape', async () => {
    const { service } = harness();
    const result = await service.request(CLIENT, COMMANDE, { reason: 'TOO_SLOW' });
    expect(result).toEqual({
      id: 'req-1',
      status: 'PENDING',
      reason: 'TOO_SLOW',
      comment: null,
      refusalNote: null,
      createdAt: '2026-09-30T12:00:00.000Z',
    });
  });
});

describe('CancellationsService.withdraw', () => {
  type Opts = {
    row?: { clientUserId: string; repairerUserId: string; demande: { title: string } } | null;
    withdrawCount?: number;
    notificationsEmit?: Mock;
  };

  function harness({ row = { clientUserId: CLIENT, repairerUserId: REPAIRER, demande: { title: 'iPhone 13, écran cassé' } }, withdrawCount = 1, notificationsEmit }: Opts = {}) {
    const requestUpdateMany = vi.fn().mockResolvedValue({ count: withdrawCount });
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const tx = {
      cancellationRequest: { updateMany: requestUpdateMany },
      commande: { updateMany: commandeUpdateMany },
    };

    const commandeFindFirst = vi.fn().mockResolvedValue(row);
    const prisma = {
      commande: { findFirst: commandeFindFirst },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const notifications = { emit: notificationsEmit ?? vi.fn().mockResolvedValue(undefined) };
    return {
      service: new CancellationsService(prisma, notifications as unknown as NotificationsService),
      commandeFindFirst,
      requestUpdateMany,
      commandeUpdateMany,
      notificationsEmit: notifications.emit,
    };
  }

  it('404s when the caller is not the client', async () => {
    const { service, requestUpdateMany } = harness({ row: null });
    const error = await rejection(service.withdraw(OTHER, COMMANDE));
    expect(error.getStatus()).toBe(404);
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it('409s CANCELLATION_NOT_PENDING when there is no PENDING row (count 0)', async () => {
    const { service, commandeUpdateMany } = harness({ withdrawCount: 0 });
    const error = await rejection(service.withdraw(CLIENT, COMMANDE));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Cette demande d'annulation n'est plus en attente.");
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('withdraws the PENDING row and clears the flag in one transaction', async () => {
    const { service, requestUpdateMany, commandeUpdateMany } = harness();

    await service.withdraw(CLIENT, COMMANDE);

    const reqCall = requestUpdateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: { status: string; decidedAt: Date };
    };
    expect(reqCall.where).toEqual({ commandeId: COMMANDE, status: 'PENDING' });
    expect(reqCall.data.status).toBe('WITHDRAWN');
    expect(reqCall.data.decidedAt).toBeInstanceOf(Date);

    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE },
      data: { cancellationRequestedAt: null },
    });
  });

  it('notifies the réparateur with CANCELLATION_WITHDRAWN', async () => {
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const { service } = harness({ notificationsEmit });

    await service.withdraw(CLIENT, COMMANDE);

    expect(notificationsEmit).toHaveBeenCalledWith({
      userId: REPAIRER,
      mode: 'REPAIRER',
      type: 'CANCELLATION_WITHDRAWN',
      actorName: null,
      subject: 'iPhone 13, écran cassé',
      commandeId: COMMANDE,
    });
  });

  it('returns { ok: true }', async () => {
    const { service } = harness();
    const result = await service.withdraw(CLIENT, COMMANDE);
    expect(result).toEqual({ ok: true });
  });
});
