import { describe, expect, it, vi, type Mock } from 'vitest';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CF4-27 (spec §4.2). `POST demandes/:id/cancel` - the pre-payment cancel: no approval, sets
 * the demande CANCELLED, rejects its live offers, notifies those réparateurs. Style follows
 * `demandes-delete.spec.ts` (a stubbed Prisma, so tests can assert on writes and non-writes).
 */

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEMANDE = '33333333-3333-4333-8333-333333333333';
const REPAIRER_1 = '88888888-8888-4888-8888-888888888888';
const REPAIRER_2 = '99999999-9999-4999-8999-999999999999';

type Row = {
  id: string;
  authorUserId: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  title: string;
  targetRepairerUserId: string | null;
  hiddenAt: null;
  deletedAt: null;
  _count: { offers: number; commandes: number };
};

function storedRow(opts: Partial<Row> = {}): Row {
  return {
    id: DEMANDE,
    authorUserId: ME,
    status: 'OPEN',
    title: 'iPhone 13, écran cassé',
    targetRepairerUserId: null,
    hiddenAt: null,
    deletedAt: null,
    _count: { offers: 1, commandes: 0 },
    ...opts,
  };
}

type Opts = {
  row?: Row | null;
  clientEnabled?: boolean;
  /** count returned by demande.updateMany({ status: 'CANCELLED', ... }) - 0 simulates a lost race. */
  demandeUpdateCount?: number;
  offerFindMany?: Mock;
  offerUpdateMany?: Mock;
  notificationsEmit?: Mock;
};

function harness({
  row = storedRow(),
  clientEnabled = true,
  demandeUpdateCount = 1,
  offerFindMany,
  offerUpdateMany,
  notificationsEmit,
}: Opts = {}) {
  const demandeFindFirst = vi.fn().mockResolvedValue(row);
  const demandeUpdateMany = vi.fn().mockResolvedValue({ count: demandeUpdateCount });
  const offerFind = offerFindMany ?? vi.fn().mockResolvedValue([]);
  const offerUpdate = offerUpdateMany ?? vi.fn().mockResolvedValue({ count: 0 });

  const tx = {
    demande: { updateMany: demandeUpdateMany },
    offer: { updateMany: offerUpdate },
  };

  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ clientEnabled }) },
    demande: { findFirst: demandeFindFirst, updateMany: demandeUpdateMany },
    offer: { findMany: offerFind, updateMany: offerUpdate },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const geocode = { lookupPostalCode: vi.fn().mockResolvedValue(null) } as unknown as GeocodeService;
  const notifications = { emit: notificationsEmit ?? vi.fn().mockResolvedValue(undefined) };

  return {
    service: new DemandesService(prisma, geocode, notifications as unknown as NotificationsService),
    demandeFindFirst,
    demandeUpdateMany,
    offerFind,
    offerUpdate,
    notificationsEmit: notifications.emit,
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

function bodyOf(error: AppException): { message: string } {
  return error.getResponse() as { message: string };
}

describe('DemandesService.cancel', () => {
  it("404s when the demande belongs to someone else", async () => {
    const { service, demandeUpdateMany } = harness({ row: null });
    const error = await rejection(service.cancel(OTHER, DEMANDE));
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).message).toBe('Ressource introuvable.');
    expect(demandeUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses when client mode is off, via the existing assertClientEnabled message', async () => {
    const { service } = harness({ clientEnabled: false });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error).message).toMatch(/mode client/);
  });

  it('422s a private request with QUOTE_USE_CANCEL', async () => {
    const row = storedRow({ targetRepairerUserId: REPAIRER_1 });
    const { service, demandeUpdateMany } = harness({ row });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Utilisez « Annuler la demande ».');
    expect(demandeUpdateMany).not.toHaveBeenCalled();
  });

  it('409s a demande that is no longer OPEN', async () => {
    const row = storedRow({ status: 'IN_PROGRESS' });
    const { service, demandeUpdateMany } = harness({ row });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Cette demande n'est plus ouverte.");
    expect(demandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s with CANCEL_USE_DELETE when there is no acceptable offer', async () => {
    const row = storedRow({ _count: { offers: 0, commandes: 0 } });
    const { service, demandeUpdateMany } = harness({ row });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Utilisez « Supprimer ».');
    expect(demandeUpdateMany).not.toHaveBeenCalled();
  });

  it('422s with CANCEL_PAYMENT_IN_FLIGHT when a PENDING_PAYMENT commande exists', async () => {
    const row = storedRow({ _count: { offers: 1, commandes: 1 } });
    const { service, demandeUpdateMany } = harness({ row });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(
      'Un paiement est en cours sur cette demande. Réessayez dans quelques minutes.',
    );
    expect(demandeUpdateMany).not.toHaveBeenCalled();
  });

  it('409s when the conditional CANCELLED write loses the race (count 0)', async () => {
    const { service, offerUpdate } = harness({ demandeUpdateCount: 0 });
    const error = await rejection(service.cancel(ME, DEMANDE));
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).message).toBe("Cette demande n'est plus ouverte.");
    // The offer write never runs once the demande write loses the race.
    expect(offerUpdate).not.toHaveBeenCalled();
  });

  it('runs the demande CANCELLED write and the offer REJECTED write in one transaction, demande first', async () => {
    const { service, demandeUpdateMany, offerUpdate } = harness();

    await service.cancel(ME, DEMANDE);

    expect(demandeUpdateMany).toHaveBeenCalledWith({
      where: { id: DEMANDE, status: 'OPEN', commandes: { none: { status: 'PENDING_PAYMENT' } } },
      data: { status: 'CANCELLED' },
    });
    expect(offerUpdate).toHaveBeenCalledWith({
      where: { demandeId: DEMANDE, status: 'SENT', deletedAt: null },
      data: { status: 'REJECTED' },
    });
  });

  it('notifies each réparateur whose offer was live, reading the recipient set before the write', async () => {
    const row = storedRow();
    const offerFindMany = vi.fn().mockResolvedValue([
      { repairerUserId: REPAIRER_1 },
      { repairerUserId: REPAIRER_2 },
    ]);
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const { service, demandeUpdateMany } = harness({ row, offerFindMany, notificationsEmit });

    const before = Date.now();
    await service.cancel(ME, DEMANDE);
    void before;

    expect(offerFindMany).toHaveBeenCalledTimes(1);
    expect(offerFindMany).toHaveBeenCalledWith({
      where: { demandeId: DEMANDE, status: 'SENT', deletedAt: null },
      select: { repairerUserId: true },
    });

    expect(notificationsEmit).toHaveBeenCalledTimes(2);
    expect(notificationsEmit).toHaveBeenNthCalledWith(1, {
      userId: REPAIRER_1,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'iPhone 13, écran cassé',
      demandeId: DEMANDE,
    });
    expect(notificationsEmit).toHaveBeenNthCalledWith(2, {
      userId: REPAIRER_2,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'iPhone 13, écran cassé',
      demandeId: DEMANDE,
    });

    // The write itself ran exactly once.
    expect(demandeUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('returns { ok: true }', async () => {
    const { service } = harness();
    const result = await service.cancel(ME, DEMANDE);
    expect(result).toEqual({ ok: true });
  });
});
