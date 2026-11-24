import { describe, expect, it, vi } from 'vitest';
import { moderateOfferBodySchema, type ModerateOfferBody } from '@revime/shared';
import { AdminOffresService } from '../src/admin/admin-offres.service.js';

type AdminOffresServiceWithWrite = AdminOffresService & {
  moderateDelete(id: string, body: ModerateOfferBody, adminUserId: string): Promise<unknown>;
};

describe('§8.5 moderateOfferBodySchema', () => {
  it('refuses missing or empty reason', () => {
    const result = moderateOfferBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('refuses reason under 3 characters', () => {
    const result = moderateOfferBodySchema.safeParse({ reason: 'no' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      'Le motif doit contenir au moins 3 caractères.',
    );
  });

  it('trims whitespace and accepts valid reason', () => {
    const result = moderateOfferBodySchema.safeParse({ reason: '  Tarif abusif  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Tarif abusif');
    }
  });
});

const LIVE_OFFER = {
  id: 'o1',
  demandeId: 'd1',
  repairerUserId: 'r1',
  priceCents: 12000,
  status: 'SENT',
  deletedAt: null,
  deletedReason: null,
  deletedByUserId: null,
  commandes: [] as Array<{ id: string; status: string }>,
};

function writeStub({
  offer = LIVE_OFFER as unknown,
  pendingPaymentCount = 0,
  updateResult = {
    id: 'o1',
    demandeId: 'd1',
    repairerUserId: 'r1',
    deletedAt: new Date('2026-09-21T10:00:00.000Z'),
  } as unknown,
} = {}) {
  const offerWithCommandes =
    offer && typeof offer === 'object'
      ? {
          ...offer,
          commandes:
            (offer as any)?.commandes?.length
              ? (offer as any).commandes
              : (pendingPaymentCount > 0 ? [{ id: 'cmd-1', status: 'PENDING_PAYMENT' }] : []),
        }
      : offer;

  return {
    offer: {
      findUnique: vi.fn().mockResolvedValue(offerWithCommandes),
      update: vi.fn().mockResolvedValue(updateResult),
    },
    commande: {
      count: vi.fn().mockResolvedValue(pendingPaymentCount),
    },
  };
}

const svc = (p: ReturnType<typeof writeStub>) =>
  new AdminOffresService(p as never) as AdminOffresServiceWithWrite;

describe('AdminOffresService.moderateDelete', () => {
  it('Guard 1: Throws 404 Ressource introuvable. if offer not found', async () => {
    const p = writeStub({ offer: null });
    await expect(
      svc(p).moderateDelete('unknown-offer', { reason: 'Contenu inapproprié' }, 'admin-1'),
    ).rejects.toThrow('Ressource introuvable.');
  });

  it('Guard 2: Throws 422 Cette offre est déjà retirée. if offer has deletedAt set', async () => {
    const p = writeStub({
      offer: { ...LIVE_OFFER, deletedAt: new Date('2026-09-20T12:00:00.000Z') },
    });
    await expect(
      svc(p).moderateDelete('o1', { reason: 'Doublon' }, 'admin-1'),
    ).rejects.toThrow('Cette offre est déjà retirée.');
  });

  it('Guard 2: Throws 422 Cette offre est déjà retirée. if offer has status WITHDRAWN', async () => {
    const p = writeStub({
      offer: { ...LIVE_OFFER, deletedAt: null, status: 'WITHDRAWN' },
    });
    await expect(
      svc(p).moderateDelete('o1', { reason: 'Doublon' }, 'admin-1'),
    ).rejects.toThrow('Cette offre est déjà retirée.');
  });

  it('Guard 3: Throws 422 Un paiement est en cours sur cette offre. if any PENDING_PAYMENT order exists', async () => {
    const p = writeStub({
      offer: LIVE_OFFER,
      pendingPaymentCount: 1,
    });
    await expect(
      svc(p).moderateDelete('o1', { reason: 'Spam' }, 'admin-1'),
    ).rejects.toThrow('Un paiement est en cours sur cette offre.');
  });

  it('Guard 3: does not block when existing orders are PAID or ABANDONED (not PENDING_PAYMENT)', async () => {
    const p = writeStub({
      offer: { ...LIVE_OFFER, commandes: [{ id: 'cmd-1', status: 'PAID' }] },
      pendingPaymentCount: 0,
    });
    const result = await svc(p).moderateDelete(
      'o1',
      { reason: 'Contenu non conforme' },
      'admin-1',
    );
    expect(p.offer.update).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it('Success: updates offer with deletedAt, status WITHDRAWN, deletedReason, and deletedByUserId', async () => {
    const p = writeStub({
      offer: LIVE_OFFER,
      pendingPaymentCount: 0,
      updateResult: {
        id: 'o1',
        demandeId: 'd1',
        repairerUserId: 'r1',
        deletedAt: new Date('2026-09-21T10:00:00.000Z'),
      },
    });

    const result = await svc(p).moderateDelete('o1', { reason: 'Spam détecté' }, 'admin-1');

    expect(p.offer.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        deletedAt: expect.any(Date),
        status: 'WITHDRAWN',
        deletedReason: 'Spam détecté',
        deletedByUserId: 'admin-1',
      },
      select: {
        id: true,
        demandeId: true,
        repairerUserId: true,
        deletedAt: true,
      },
    });

    expect(result).toEqual({
      success: true,
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      deletedAt: expect.any(Date),
    });
  });
});
