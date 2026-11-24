import { describe, expect, it, vi } from 'vitest';
import { promoteToBusinessIfEligible } from '../src/verification/promote-business.js';
import { AdminVerificationsService } from '../src/admin/admin-verifications.service.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * V7 D4 (2026-10-28). Approving a business verification raised the level to BUSINESS but never
 * touched `RepairerProfile.kind`, so production's `@nes` read « Niveau : Professionnel », « Badge :
 * Professionnel vérifié » and « Type : Particulier » on one sheet, and every reader keyed on `kind`
 * (the private-individual counter, the offer gate, CMP-D3's fiscal stamp) still treated him as an
 * individual. The client's ask: « passer automatiquement le type à « Professionnel » quand
 * l'entreprise est validée ».
 */
describe('V7 D4: an approved business makes the repairer PRO', () => {
  function prismaFor(opts: { business?: { status: string; verifiedAt: Date | null } | null; promoted?: number } = {}) {
    const calls: string[] = [];
    const prisma = {
      businessVerification: {
        findUnique: vi.fn().mockResolvedValue(
          opts.business === undefined ? { status: 'APPROVED', verifiedAt: new Date() } : opts.business,
        ),
      },
      profile: {
        updateMany: vi.fn(async () => {
          calls.push('profile');
          return { count: opts.promoted ?? 1 };
        }),
      },
      repairerProfile: {
        updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
          calls.push('kind' in args.data ? 'kind' : 'fiscal');
          return { count: 1 };
        }),
      },
    };
    return { prisma, calls };
  }

  const KIND_WRITE = {
    where: { userId: 'u1', kind: 'INDIVIDUAL', user: { profile: { verificationLevel: 'BUSINESS' } } },
    data: { kind: 'PRO' },
  };

  it('sets kind PRO, only on a profile that ends at BUSINESS', async () => {
    const { prisma } = prismaFor();
    await promoteToBusinessIfEligible(prisma as never, 'u1');
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith(KIND_WRITE);
  });

  it('sets it BEFORE the fiscal stamp, so a repairer who was INDIVIDUAL is stamped too', async () => {
    const { prisma, calls } = prismaFor();
    await promoteToBusinessIfEligible(prisma as never, 'u1');
    expect(calls).toEqual(['profile', 'kind', 'fiscal']);
  });

  it('also sets it when the profile was already BUSINESS (a re-approval, the @nes case)', async () => {
    const { prisma } = prismaFor({ promoted: 0 });
    await promoteToBusinessIfEligible(prisma as never, 'u1');
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith(KIND_WRITE);
    // The fiscal stamp keeps its own rule: only when THIS call promoted him.
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no verification', null],
    ['a pending verification', { status: 'PENDING', verifiedAt: null }],
    ['a refused verification', { status: 'REJECTED', verifiedAt: null }],
  ])('writes nothing for %s', async (_label, business) => {
    const { prisma } = prismaFor({ business });
    await promoteToBusinessIfEligible(prisma as never, 'u1');
    expect(prisma.repairerProfile.updateMany).not.toHaveBeenCalled();
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * V7 A4 / `DEC7-08` (`Q-12`). `@nes`'s verification was approved on 2026-10-27 with no document on
 * file (a row older than migration `20261003020000`, whose `registrationProofPath` defaulted to
 * ''). « From now on the dashboard must refuse to approve a verification that has no document. »
 */
describe('V7 A4: approval needs a registration proof on file', () => {
  function harness(registrationProofPath: string) {
    const tx = {
      businessVerification: { update: vi.fn(), findUnique: vi.fn() },
      profile: { updateMany: vi.fn() },
      repairerProfile: { updateMany: vi.fn() },
    };
    const prisma = {
      businessVerification: {
        findUnique: vi.fn().mockResolvedValue({ userId: 'u1', status: 'PENDING', registrationProofPath }),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const emit = vi.fn();
    const service = new AdminVerificationsService(prisma as never, { emit } as never);
    return { service, prisma, tx, emit };
  }

  it.each(['', '   '])('refuses with 422 and writes nothing when the path is %j', async (path) => {
    const { service, prisma, emit } = harness(path);
    const err = await service.approveBusiness('admin-1', 'u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(422);
    expect((err as AppException).message).toBe(
      "Aucun justificatif d'immatriculation n'est enregistré : demandez les documents au réparateur.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('still approves when a document is on file', async () => {
    const { service, tx } = harness('business-documents/u1/x-kbis.png');
    await expect(service.approveBusiness('admin-1', 'u1')).resolves.toEqual({ success: true });
    expect(tx.businessVerification.update).toHaveBeenCalledTimes(1);
  });
});
