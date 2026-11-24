import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { AppException } from '../src/common/app-exception.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const DEMANDE_ID = '33333333-3333-4333-8333-333333333333';
const OFFER_ID = '44444444-4444-4444-8444-444444444444';

function harness(overrides?: {
  offerRow?: Record<string, unknown> | null;
  updateManyOfferCount?: number;
  updateManyDemandeCount?: number;
}) {
  const defaultOffer = {
    id: OFFER_ID,
    status: 'SENT',
    repairerUserId: REPAIRER,
    demande: {
      id: DEMANDE_ID,
      title: 'Écran iPhone 13 cassé',
      status: 'OPEN',
      targetRepairerUserId: null,
    },
    _count: { commandes: 0 },
  };

  const offerFindFirst = vi.fn().mockResolvedValue(
    overrides?.offerRow === undefined ? defaultOffer : overrides.offerRow,
  );
  const offerUpdateMany = vi.fn().mockResolvedValue({
    count: overrides?.updateManyOfferCount ?? 1,
  });
  const demandeUpdateMany = vi.fn().mockResolvedValue({
    count: overrides?.updateManyDemandeCount ?? 1,
  });

  const tx = {
    demande: { updateMany: demandeUpdateMany },
    offer: { updateMany: offerUpdateMany },
  };

  const prisma = {
    offer: {
      findFirst: offerFindFirst,
      updateMany: offerUpdateMany,
    },
    demande: {
      updateMany: demandeUpdateMany,
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;

  const emit = vi.fn().mockResolvedValue(undefined);
  const notifications = { emit } as unknown as NotificationsService;

  const service = new OffersService(prisma, notifications);
  return {
    service,
    prisma,
    tx,
    offerFindFirst,
    offerUpdateMany,
    demandeUpdateMany,
    emit,
  };
}

describe('OffersService.decline', () => {
  it('throws 404 NOT_FOUND if offer does not exist or caller is not author', async () => {
    const h = harness({ offerRow: null });
    await expect(h.service.decline(CLIENT, OFFER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws 409 CONFLICT if offer is not SENT', async () => {
    const h = harness({
      offerRow: {
        id: OFFER_ID,
        status: 'WITHDRAWN',
        repairerUserId: REPAIRER,
        demande: { id: DEMANDE_ID, title: 'Test', status: 'OPEN', targetRepairerUserId: null },
        _count: { commandes: 0 },
      },
    });
    await expect(h.service.decline(CLIENT, OFFER_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws 409 CONFLICT if demande is not OPEN', async () => {
    const h = harness({
      offerRow: {
        id: OFFER_ID,
        status: 'SENT',
        repairerUserId: REPAIRER,
        demande: { id: DEMANDE_ID, title: 'Test', status: 'CANCELLED', targetRepairerUserId: null },
        _count: { commandes: 0 },
      },
    });
    await expect(h.service.decline(CLIENT, OFFER_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws 422 UNPROCESSABLE_ENTITY if commande checkout is in flight', async () => {
    const h = harness({
      offerRow: {
        id: OFFER_ID,
        status: 'SENT',
        repairerUserId: REPAIRER,
        demande: { id: DEMANDE_ID, title: 'Test', status: 'OPEN', targetRepairerUserId: null },
        _count: { commandes: 1 },
      },
    });
    await expect(h.service.decline(CLIENT, OFFER_ID)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('declines a public offer: sets offer REJECTED and emits OFFER_DECLINED', async () => {
    const h = harness();
    const result = await h.service.decline(CLIENT, OFFER_ID);

    expect(result).toEqual({ ok: true });
    expect(h.offerUpdateMany).toHaveBeenCalledWith({
      where: { id: OFFER_ID, status: 'SENT', deletedAt: null },
      data: { status: 'REJECTED' },
    });
    expect(h.emit).toHaveBeenCalledWith({
      userId: REPAIRER,
      mode: 'REPAIRER',
      type: 'OFFER_DECLINED',
      actorName: null,
      subject: 'Écran iPhone 13 cassé',
      demandeId: DEMANDE_ID,
    });
  });

  it('declines a private quote request: closes demande QUOTE_REFUSED, sets offer REJECTED and emits QUOTE_REFUSED', async () => {
    const h = harness({
      offerRow: {
        id: OFFER_ID,
        status: 'SENT',
        repairerUserId: REPAIRER,
        demande: {
          id: DEMANDE_ID,
          title: 'Devis privé écran',
          status: 'OPEN',
          targetRepairerUserId: REPAIRER,
        },
        _count: { commandes: 0 },
      },
    });

    const result = await h.service.decline(CLIENT, OFFER_ID);

    expect(result).toEqual({ ok: true });
    expect(h.tx.demande.updateMany).toHaveBeenCalledWith({
      where: { id: DEMANDE_ID, status: 'OPEN' },
      data: { status: 'CANCELLED', quoteClosedReason: 'QUOTE_REFUSED', quoteExpiresAt: null },
    });
    expect(h.tx.offer.updateMany).toHaveBeenCalledWith({
      where: { id: OFFER_ID, status: 'SENT', deletedAt: null },
      data: { status: 'REJECTED' },
    });
    expect(h.emit).toHaveBeenCalledWith({
      userId: REPAIRER,
      mode: 'REPAIRER',
      type: 'QUOTE_REFUSED',
      actorName: null,
      subject: 'Devis privé écran',
      demandeId: DEMANDE_ID,
    });
  });
});
