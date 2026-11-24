import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

describe('OffersService.create - CF3-06 Fixed Budget Enforcement', () => {
  it('rejects an offer whose price does not match the fixed budget', async () => {
    const prisma = withUserLookups({
      profile: {
        findFirst: vi.fn().mockResolvedValue({
          repairerEnabled: true,
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
          user: { emailVerified: new Date(), phoneVerifiedAt: new Date() },
        }),
      },
      repairerProfile: {
        findFirst: vi.fn().mockResolvedValue({
          postalCode: '75001',
          kind: 'PRO',
        }),
        findUnique: vi.fn().mockResolvedValue({
          kind: 'PRO',
        }),
      },
      demande: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'demande-1',
          authorUserId: 'client-1',
          status: 'OPEN',
          title: 'Réparation iPhone',
          mode: 'BUDGET',
          budgetCents: 5000,
        }),
      },
      offer: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }) as unknown as PrismaService;

    const notifications = {} as unknown as NotificationsService;
    const service = new OffersService(prisma, notifications);

    await expect(
      service.create('repairer-1', 'demande-1', {
        priceCents: 6000,
        delayHours: 24,
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        acceptsParcel: false,
      }),
    ).rejects.toThrow("Le montant de l'offre doit correspondre au budget fixé par le client.");
  });

  it('accepts an offer matching the client fixed budget', async () => {
    const prisma = withUserLookups({
      profile: {
        findFirst: vi.fn().mockResolvedValue({
          repairerEnabled: true,
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
          user: { emailVerified: new Date(), phoneVerifiedAt: new Date() },
        }),
      },
      repairerProfile: {
        findFirst: vi.fn().mockResolvedValue({
          postalCode: '75001',
          kind: 'PRO',
        }),
        findUnique: vi.fn().mockResolvedValue({
          kind: 'PRO',
        }),
      },
      demande: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'demande-1',
          authorUserId: 'client-1',
          status: 'OPEN',
          title: 'Réparation iPhone',
          mode: 'BUDGET',
          budgetCents: 5000,
        }),
      },
      offer: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'offer-1',
          repairerUserId: 'repairer-1',
          priceCents: 5000,
          delayHours: 24,
          warrantyLabel: 'Aucune',
          partsLabel: "Pièce d'origine",
          travel: 'WORKSHOP',
          acceptsParcel: false,
          comment: null,
          status: 'SENT',
          createdAt: new Date(),
          repairer: {
            username: 'bob',
            createdAt: new Date(),
            repairerProfile: { displayName: 'Bob', postalCode: '75001', lat: null, lng: null },
            profile: { verificationLevel: 'BUSINESS' },
          },
        }),
      },
      review: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      commande: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    }) as unknown as PrismaService;

    const notifications = {
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const service = new OffersService(prisma, notifications);

    const result = await service.create('repairer-1', 'demande-1', {
      priceCents: 5000,
      delayHours: 24,
      warrantyLabel: 'Aucune',
      partsLabel: "Pièce d'origine",
      travel: 'WORKSHOP',
      acceptsParcel: false,
    });

    expect(result.priceCents).toBe(5000);
  });
});
