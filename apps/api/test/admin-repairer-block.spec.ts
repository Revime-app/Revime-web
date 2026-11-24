import { describe, expect, it, vi } from 'vitest';
import { AdminRepairersService } from '../src/admin/admin-repairers.service.js';

/**
 * The repairer block on the user fiche. §8.3. Null in THREE cases: no `RepairerProfile` row,
 * réparateur mode off WITH NO SUSPENSION recorded, or no such user. It is deliberately NOT null
 * for a suspended account whose mode is off - see the last test in this file.
 */
describe('repairer block', () => {
  it('returns null for an account with the mode off and no suspension', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: null,
          profile: { repairerEnabled: false, repairerSuspendedAt: null },
        }),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');
    expect(block).toBeNull();
  });

  /**
   * 🛑 THE SAME CASE WITH `repairerSuspendedAt` ABSENT RATHER THAN NULL, and it is not
   * redundant. The suspension test goes through `isRepairerSuspended`, whose loose `!= null` is
   * what stops an absent field reading as a live suspension, since `undefined !== null` is TRUE.
   *
   * 🛑 CORRECTED 2026-09-04: this docblock used to claim that under a strict `!== null` « this account
   * would get a block ». MEASURED FALSE - injecting the strict form leaves this file at 11/11, because the
   * fixture sets `repairerProfile: null` and the `!repairerProfile` guard returns null first, whichever
   * comparison the suspension test uses. **The real coverage of the loose form lives in
   * `admin-suspended-predicate.spec.ts`, which does redden under the strict form.** Neither
   * null-returning fixture here can distinguish the suspension guard from the `!repairerProfile` guard, so
   * this file asserts the OUTCOME and not the mechanism. Said plainly because a docblock claiming a gate the
   * file does not provide is how a reviewer concludes a subtlety is pinned when it is not.
   */
  it('returns null when repairerSuspendedAt is absent, not merely null', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: null,
          profile: { repairerEnabled: false },
        }),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    expect(await service.repairerBlock('u1')).toBeNull();
  });

  it('shows the public badge the client sees, through verifiedBadgeFor', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: 'Test bio',
            postalCode: '75001',
            serviceAreaLabel: 'Paris',
            serviceRadiusKm: 10,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(5),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    // verifiedBadgeFor('IDENTITY') = 'IDENTITY'
    expect(block!.publicBadge).toBe('IDENTITY');
  });

  it('shows null for BASIC level, which has no public badge', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'BASIC',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    // verifiedBadgeFor('BASIC') = null
    expect(block!.publicBadge).toBeNull();
  });

  it('shows identity outcome fields, never the document itself', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: {
            status: 'VERIFIED',
            verifiedAt: new Date('2026-09-01T10:00:00Z'),
            lastErrorCode: null,
            variant: 'DOCUMENT_AND_SELFIE',
            redactionStatus: null,
            erasureRequestedAt: null,
            selfieFraudSignalAt: null,
          },
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    expect(block!.identity).toEqual({
      status: 'VERIFIED',
      verifiedAt: '2026-09-01T10:00:00.000Z',
      lastErrorCode: null,
      variant: 'DOCUMENT_AND_SELFIE',
      redactionStatus: null,
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });
  });

  it('calculates hiddenLiveOffers as the suspension delta', async () => {
    // A suspended réparateur has 10 LIVE offers but only 3 are ACCEPTABLE.
    // The operator needs to see that 7 offers are hidden by the suspension.
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: new Date('2026-09-01T10:00:00Z'),
            repairerSuspendedUntil: null,
            repairerSuspendedReason: 'Test suspension',
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn()
          .mockResolvedValueOnce(10) // LIVE_OFFER_WHERE count
          .mockResolvedValueOnce(3), // ACCEPTABLE_OFFER_WHERE count
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    expect(block!.counts.liveOffers).toBe(10);
    expect(block!.counts.hiddenLiveOffers).toBe(7);
  });

  it('shows suspension details when present', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: new Date('2026-09-01T10:00:00Z'),
            repairerSuspendedUntil: new Date('2026-09-08T10:00:00Z'),
            repairerSuspendedReason: 'Fraud detected',
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    expect(block!.suspension).toEqual({
      at: '2026-09-01T10:00:00.000Z',
      until: '2026-09-08T10:00:00.000Z',
      reason: 'Fraud detected',
    });
  });

  it('shows revocation details when present', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'BASIC',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: new Date('2026-09-01T10:00:00Z'),
            verificationRevokedReason: 'Fake documents',
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    expect(block!.revocation).toEqual({
      at: '2026-09-01T10:00:00.000Z',
      reason: 'Fake documents',
    });
  });

  it('shows business verification when present', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'PRO',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'BUSINESS',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: {
            siren: '123456789',
            siret: '12345678900016',
            denomination: 'ATELIER TEST SARL',
            establishmentAddress: '12 RUE DE TEST 75001 PARIS',
            etatAdministratif: 'A',
            verifiedAt: new Date('2026-09-01T10:00:00Z'),
          },
          connectAccount: null,
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    // verifiedBadgeFor('BUSINESS') = 'BUSINESS'
    expect(block!.publicBadge).toBe('BUSINESS');
    expect(block!.business).toEqual({
      siren: '123456789',
      siret: '12345678900016',
      denomination: 'ATELIER TEST SARL',
      establishmentAddress: '12 RUE DE TEST 75001 PARIS',
      etatAdministratif: 'A',
      verifiedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('shows connect status as read-only', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            repairerEnabled: true,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: null,
            repairerSuspendedUntil: null,
            repairerSuspendedReason: null,
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: {
            status: 'PENDING',
          },
        }),
      },
      offer: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    // A PENDING Connect account means the réparateur cannot be paid
    expect(block!.connectStatus).toBe('PENDING');
  });

  /**
   * 🛑 THE STATE THE OPERATOR COULD NOT RECOVER FROM, AND ITS TARGET COULD REACH HIMSELF.
   *
   * Guard 7 (`users.service.ts`) refuses only `repairerEnabled: false → true`, so a suspended
   * réparateur may turn the mode OFF - deliberate, so he is never trapped in réparateur mode.
   * The block then used to return null on `!repairerEnabled`, so `RepairerBlock.tsx` rendered
   * nothing at all: no suspension, and no « Réactiver le mode réparateur » button. He also
   * dropped out of `?type=reparateur`, and `AdminUserDetail` has no suspension columns of its
   * own - so the fiche told the operator NOTHING about a live suspension, and recovery existed
   * only as a hand-crafted API call.
   *
   * This asserts the full state, not just non-null: the suspension must be present (it carries
   * the reactivate control) and `repairerEnabled` must be reported false (the operator has to
   * know that reactivating does not put him back in the directory).
   */
  it('returns the block for a SUSPENDED account whose repairerEnabled is false', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          repairerProfile: {
            displayName: 'Atelier Test',
            kind: 'INDIVIDUAL',
            bio: null,
            postalCode: null,
            serviceAreaLabel: null,
            serviceRadiusKm: null,
          },
          profile: {
            // 🛑 The whole point of the fixture: the mode is OFF and the suspension stands.
            repairerEnabled: false,
            verificationLevel: 'IDENTITY',
            repairerSuspendedAt: new Date('2026-09-01T10:00:00Z'),
            repairerSuspendedUntil: null,
            repairerSuspendedReason: 'Propos abusifs',
            verificationRevokedAt: null,
            verificationRevokedReason: null,
          },
          identityVerification: null,
          businessVerification: null,
          connectAccount: null,
        }),
      },
      offer: { count: vi.fn().mockResolvedValue(0) },
    };

    const service = new AdminRepairersService(prisma as never);
    const block = await service.repairerBlock('u1');

    expect(block).not.toBeNull();
    expect(block!.suspension).toEqual({
      at: '2026-09-01T10:00:00.000Z',
      until: null,
      reason: 'Propos abusifs',
    });
    expect(block!.repairerEnabled).toBe(false);
  });
});
