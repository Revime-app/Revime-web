import { describe, expect, it, vi } from 'vitest';
import { PARTICULAR_CAP_REACHED_TEXT } from '@revime/shared';
import { assertUnderParticularCap, readParticularQuota } from '../src/verification/particular-quota.js';
import { OffersService } from '../src/offers/offers.service.js';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * V7 A10 (U7, `DEC7-22`). CGU art. 53: a private individual at 10 paid missions or 1 500 € over a
 * rolling 12 months « ne peut plus publier de nouvelle offre ». Until now only the dashboard counted
 * (V6 `ISS-061`); the offer gate now refuses, and the repairer reads his own counter. Q10 closes
 * `ISS7-011`: an approved professional can no longer set himself back to « Particulier ».
 */

const PENDING_FR =
  'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.';
const REDO_FR = "Votre vérification d'entreprise est à refaire : ouvrez « Mon entreprise » pour en voir le motif.";
const KEEP_PRO_FR = 'Votre entreprise est vérifiée : votre statut reste Professionnel.';

const NOW = new Date('2026-10-29T10:00:00.000Z');

function paid(n: number, repairCents = 5000) {
  return Array.from({ length: n }, (_, i) => ({
    repairCents,
    refundRepairCents: null,
    paidAt: new Date(Date.UTC(2026, 0, i + 1)),
  }));
}

function capPrisma(
  kind: 'PRO' | 'INDIVIDUAL' | null,
  orders: ReturnType<typeof paid>,
  business: { status: string } | null = null,
) {
  return {
    repairerProfile: { findUnique: vi.fn().mockResolvedValue(kind ? { kind } : null) },
    commande: { findMany: vi.fn().mockResolvedValue(orders) },
    businessVerification: { findUnique: vi.fn().mockResolvedValue(business) },
  };
}

async function refusalOf(prisma: ReturnType<typeof capPrisma>) {
  return assertUnderParticularCap(prisma as never, 'u1', NOW).then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string },
  );
}

describe('V7 A10: the offer gate refuses a private individual at the cap', () => {
  it('refuses at 10 paid missions, with its own code and the agreed sentence (Q2, Q7)', async () => {
    const err = await refusalOf(capPrisma('INDIVIDUAL', paid(10)));
    expect(err?.code).toBe('PARTICULAR_CAP_REACHED');
    expect(err?.message).toBe(PARTICULAR_CAP_REACHED_TEXT);
  });

  it('refuses at 1 500 € collected, whatever the number of missions', async () => {
    const err = await refusalOf(capPrisma('INDIVIDUAL', paid(3, 50_000)));
    expect(err?.code).toBe('PARTICULAR_CAP_REACHED');
  });

  it('lets 9 missions and 1 499,99 € through', async () => {
    expect(await refusalOf(capPrisma('INDIVIDUAL', paid(9, 16_666)))).toBeNull();
  });

  it('counts only paid, not fully refunded orders paid in the last 12 months (Q1, the dashboard’s rule)', async () => {
    const prisma = capPrisma('INDIVIDUAL', paid(1));
    await refusalOf(prisma);
    expect(prisma.commande.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repairerUserId: 'u1',
          status: 'PAID',
          stripeRefundId: null,
          paidAt: { gte: new Date('2025-10-29T10:00:00.000Z') },
        },
      }),
    );
  });

  it('never counts a professional, and never reads his orders (criterion 4)', async () => {
    const prisma = capPrisma('PRO', paid(20, 100_000));
    expect(await refusalOf(prisma)).toBeNull();
    expect(prisma.commande.findMany).not.toHaveBeenCalled();
  });

  it('a capped individual whose business verification is pending reads « Vérification en cours » (Q9)', async () => {
    const err = await refusalOf(capPrisma('INDIVIDUAL', paid(10), { status: 'PENDING' }));
    expect(err?.code).toBe('PARTICULAR_CAP_REACHED');
    expect(err?.message).toBe(PENDING_FR);
  });

  it.each(['REJECTED', 'DOCUMENTS_REQUIRED'])('a capped individual whose business is %s is told to redo it (Q9)', async (status) => {
    const err = await refusalOf(capPrisma('INDIVIDUAL', paid(10), { status }));
    expect(err?.message).toBe(REDO_FR);
  });
});

describe('V7 A10: the repairer’s own counter', () => {
  it('is null for a professional', async () => {
    expect(await readParticularQuota(capPrisma('PRO', paid(4)) as never, 'u1', NOW)).toEqual({
      quota: null,
      offerBlockedMessage: null,
    });
  });

  it('gives the figures, the limits, the release date and a WARNING standing at 8 missions', async () => {
    const res = await readParticularQuota(capPrisma('INDIVIDUAL', paid(8, 8_000)) as never, 'u1', NOW);
    expect(res).toEqual({
      quota: {
        missionsCount: 8,
        missionsMax: 10,
        amountCollectedCents: 64_000,
        amountMaxCents: 150_000,
        nextMissionReleaseAt: '2027-01-01T00:00:00.000Z',
        standing: 'WARNING',
      },
      offerBlockedMessage: null,
    });
  });

  it('at the cap, says REACHED and carries the gate’s own sentence', async () => {
    const res = await readParticularQuota(capPrisma('INDIVIDUAL', paid(10)) as never, 'u1', NOW);
    expect(res.quota?.standing).toBe('REACHED');
    expect(res.offerBlockedMessage).toBe(PARTICULAR_CAP_REACHED_TEXT);
  });

  it('is served at GET /users/me/particular-quota', async () => {
    const users = { myParticularQuota: vi.fn().mockResolvedValue({ quota: null, offerBlockedMessage: null }) };
    const controller = new UsersController(users as never, {} as never);
    await controller.particularQuota({ user: { id: 'u1' } } as never);
    expect(users.myParticularQuota).toHaveBeenCalledWith('u1');
    const path = Reflect.getMetadata('path', UsersController.prototype.particularQuota);
    expect(path).toBe('me/particular-quota');
  });
});

describe('V7 A10: OffersService.create applies the cap', () => {
  function offerPrisma(orders: ReturnType<typeof paid>) {
    return {
      profile: {
        findFirst: vi.fn().mockResolvedValue({
          repairerEnabled: true,
          verificationLevel: 'IDENTITY',
          repairerSuspendedAt: null,
        }),
      },
      repairerProfile: { findUnique: vi.fn().mockResolvedValue({ kind: 'INDIVIDUAL' }) },
      commande: { findMany: vi.fn().mockResolvedValue(orders) },
      businessVerification: { findUnique: vi.fn().mockResolvedValue(null) },
      demande: { findFirst: vi.fn().mockResolvedValue(null) },
      offer: { create: vi.fn() },
    };
  }

  const input = {
    priceCents: 5000,
    delayHours: 24,
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: false,
  } as const;

  it('refuses a capped individual before anything is written', async () => {
    const prisma = offerPrisma(paid(10));
    const service = new OffersService(prisma as unknown as PrismaService, {} as NotificationsService);
    await expect(service.create('u1', 'd1', input)).rejects.toMatchObject({ code: 'PARTICULAR_CAP_REACHED' });
    expect(prisma.demande.findFirst).not.toHaveBeenCalled();
    expect(prisma.offer.create).not.toHaveBeenCalled();
  });

  it('lets an individual under the cap reach the rest of the checks', async () => {
    const prisma = offerPrisma(paid(9));
    const service = new OffersService(prisma as unknown as PrismaService, {} as NotificationsService);
    // The demande lookup answers null, so the next refusal is the ordinary « introuvable ».
    await expect(service.create('u1', 'd1', input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.demande.findFirst).toHaveBeenCalled();
  });
});

describe('V7 A10 Q10 (ISS7-011): an approved professional stays Professionnel', () => {
  function modesPrisma(business: { status: string } | null) {
    return {
      profile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          clientEnabled: true,
          repairerEnabled: true,
          activeMode: 'REPAIRER',
          repairerSuspendedAt: null,
          onboardingCompletedAt: new Date(),
        }),
      },
      businessVerification: { findUnique: vi.fn().mockResolvedValue(business) },
      $transaction: vi.fn().mockResolvedValue(undefined),
    };
  }

  function serviceFor(prisma: ReturnType<typeof modesPrisma>) {
    const service = new UsersService(prisma as never, {} as never);
    vi.spyOn(service, 'me').mockResolvedValue({} as never);
    return service;
  }

  it('refuses kind INDIVIDUAL while the business verification is APPROVED, before any write', async () => {
    const prisma = modesPrisma({ status: 'APPROVED' });
    await expect(serviceFor(prisma).updateModes('u1', { kind: 'INDIVIDUAL' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: KEEP_PRO_FR,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([[null], [{ status: 'PENDING' }], [{ status: 'REJECTED' }]])(
    'lets kind INDIVIDUAL through when the business is not approved (%j)',
    async (business) => {
      const prisma = modesPrisma(business);
      await serviceFor(prisma).updateModes('u1', { kind: 'INDIVIDUAL' });
      expect(prisma.$transaction).toHaveBeenCalled();
    },
  );

  it('a mode switch that names no kind is never refused, and reads no business row', async () => {
    const prisma = modesPrisma({ status: 'APPROVED' });
    await serviceFor(prisma).updateModes('u1', { activeMode: 'CLIENT' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.businessVerification.findUnique).not.toHaveBeenCalled();
  });
});
