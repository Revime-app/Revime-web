import { describe, expect, it, vi } from 'vitest';
import { OFFER_UNANSWERED_AFTER_DAYS } from '@revime/shared';
import { AdminOffresService } from '../src/admin/admin-offres.service.js';

function prismaStub(
  rows: unknown[] = [],
  total = rows.length,
  revisionData: unknown[] = [],
  conversations: unknown[] = [],
  reviews: unknown[] = [],
  repairs: unknown[] = [],
) {
  const stub = {
    $transaction: vi
      .fn()
      .mockResolvedValueOnce([rows, total])
      .mockResolvedValueOnce([revisionData, conversations]),
    offer: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue(conversations),
    },
    review: {
      groupBy: vi.fn().mockResolvedValue(reviews),
    },
    commande: {
      groupBy: vi.fn().mockResolvedValue(repairs),
    },
  };
  return stub;
}

const svc = (p: unknown) => new AdminOffresService(p as never);

function createMockOfferRow(overrides: Partial<any> = {}) {
  return {
    id: 'off-1',
    demandeId: 'dem-1',
    repairerUserId: 'rep-1',
    priceCents: 6500,
    delayHours: 24,
    warrantyLabel: '3 mois',
    partsLabel: 'Pièces d\'origine',
    travel: 'WORKSHOP',
    acceptsParcel: false,
    comment: 'Je répare cela rapidement.',
    status: 'SENT',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    deletedAt: null,
    deletedReason: null,
    deletedByUserId: null,
    demande: {
      title: 'Réparation cafetière Delonghi',
      budgetCents: 5000,
      status: 'OPEN',
      commandes: [],
    },
    repairer: {
      name: 'Mario Réparateur',
      repairerProfile: { kind: 'PRO' },
    },
    ...overrides,
  };
}

describe('AdminOffresService.list - P10 Over-Budget, Expiration, and Pending Payment', () => {
  describe('Over-Budget calculations', () => {
    it('sets isOverBudget: true and calculates overBudgetCents when price exceeds demande budget', async () => {
      const row = createMockOfferRow({
        priceCents: 6500,
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          status: 'OPEN',
          commandes: [],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.isOverBudget).toBe(true);
      expect(res.items[0]!.overBudgetCents).toBe(1500);
      expect(res.items[0]!.demandeBudgetCents).toBe(5000);
    });

    it('sets isOverBudget: false when price is within or equal to demande budget', async () => {
      const row = createMockOfferRow({
        priceCents: 5000,
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          status: 'OPEN',
          commandes: [],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.isOverBudget).toBe(false);
      expect(res.items[0]!.overBudgetCents).toBeNull();
      expect(res.items[0]!.demandeBudgetCents).toBe(5000);
    });

    it('sets isOverBudget: false when demande has no budget specified (null)', async () => {
      const row = createMockOfferRow({
        priceCents: 5000,
        demande: {
          title: 'Cafetière',
          budgetCents: null,
          status: 'OPEN',
          commandes: [],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.isOverBudget).toBe(false);
      expect(res.items[0]!.overBudgetCents).toBeNull();
      expect(res.items[0]!.demandeBudgetCents).toBeNull();
    });
  });

  describe('Offer without response', () => {
    const rowAged = (days: number, overrides: Partial<any> = {}) =>
      createMockOfferRow({ createdAt: new Date(Date.now() - days * 86_400_000), ...overrides });

    it('flags a SENT offer older than the threshold as unanswered', async () => {
      const res = await svc(prismaStub([rowAged(OFFER_UNANSWERED_AFTER_DAYS + 1)])).list({});

      expect(res.items[0]!.isUnanswered).toBe(true);
    });

    it('does not flag a SENT offer younger than the threshold', async () => {
      const res = await svc(prismaStub([rowAged(OFFER_UNANSWERED_AFTER_DAYS - 1)])).list({});

      expect(res.items[0]!.isUnanswered).toBe(false);
    });

    it('does not flag an offer that was answered, however old', async () => {
      for (const status of ['ACCEPTED', 'REJECTED', 'WITHDRAWN']) {
        const res = await svc(prismaStub([rowAged(OFFER_UNANSWERED_AFTER_DAYS + 5, { status })])).list({});

        expect(res.items[0]!.isUnanswered).toBe(false);
      }
    });

    it('does not read the demande status: only the offer age and its own status decide', async () => {
      const row = rowAged(2, {
        demande: { title: 'Cafetière', budgetCents: 5000, commandes: [] },
      });
      const res = await svc(prismaStub([row])).list({});

      expect(res.items[0]!.isUnanswered).toBe(false);
    });
  });

  describe('Pending payment order state', () => {
    it('sets hasPendingPaymentOrder: true when offer is ACCEPTED and an associated commande is in PENDING_PAYMENT', async () => {
      const row = createMockOfferRow({
        id: 'off-1',
        status: 'ACCEPTED',
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          status: 'IN_PROGRESS',
          commandes: [
            { id: 'cmd-1', status: 'PENDING_PAYMENT', offerId: 'off-1' },
          ],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.hasPendingPaymentOrder).toBe(true);
    });

    it('sets hasPendingPaymentOrder: false when commande is PAID or not PENDING_PAYMENT', async () => {
      const row = createMockOfferRow({
        id: 'off-1',
        status: 'ACCEPTED',
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          status: 'IN_PROGRESS',
          commandes: [
            { id: 'cmd-1', status: 'PAID', offerId: 'off-1' },
          ],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.hasPendingPaymentOrder).toBe(false);
    });

    it('sets hasPendingPaymentOrder: false when the pending commande belongs to ANOTHER offer', async () => {
      const row = createMockOfferRow({
        id: 'off-1',
        status: 'ACCEPTED',
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          commandes: [{ status: 'PENDING_PAYMENT', offerId: 'off-2' }],
        },
      });
      const res = await svc(prismaStub([row])).list({});

      expect(res.items[0]!.hasPendingPaymentOrder).toBe(false);
    });

    it('sets hasPendingPaymentOrder: false when offer is not ACCEPTED (e.g. SENT) even if commande exists', async () => {
      const row = createMockOfferRow({
        id: 'off-1',
        status: 'SENT',
        demande: {
          title: 'Cafetière',
          budgetCents: 5000,
          status: 'OPEN',
          commandes: [
            { id: 'cmd-1', status: 'PENDING_PAYMENT', offerId: 'off-1' },
          ],
        },
      });
      const p = prismaStub([row]);
      const res = await svc(p).list({});

      expect(res.items[0]!.hasPendingPaymentOrder).toBe(false);
    });
  });

  describe('Prisma query select verification', () => {
    it('includes budgetCents and commandes in demande selection', async () => {
      const p = prismaStub();
      await svc(p).list({});

      const findManyCall = p.offer.findMany.mock.calls[0]![0]!;
      expect(findManyCall.select.demande).toEqual({
        select: {
          title: true,
          budgetCents: true,
          commandes: { select: { status: true, offerId: true } },
        },
      });
    });
  });
});
