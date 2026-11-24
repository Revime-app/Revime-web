import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminVerificationsService } from '../src/admin/admin-verifications.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { BusinessDecisionInput } from '@revime/shared';

const ACTOR = 'admin-1';
const USER = 'user-1';

function harness(
  opts: {
    user?: null | {
      id?: string;
      email?: string;
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      image?: string | null;
      profile?: { avatarPath?: string | null; verificationLevel?: string } | null;
    };
    business?: null | {
      id?: string;
      userId?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DOCUMENTS_REQUIRED';
      siren?: string;
      siret?: string | null;
      denomination?: string;
      legalForm?: string;
      establishmentAddress?: string;
      vatNumber?: string | null;
      dirigeantName?: string;
      registrationProofPath?: string;
      registrationProofName?: string;
      registrationProofSizeBytes?: number;
      insuranceProofPath?: string | null;
      insuranceProofName?: string | null;
      insuranceProofSizeBytes?: number | null;
      decisionMotif?: string | null;
      decisionNote?: string | null;
      decidedAt?: Date | null;
      decidedByUserId?: string | null;
      submittedAt?: Date;
      verifiedAt?: Date | null;
    };
    deciderUser?: { email: string } | null;
  } = {},
) {
  const businessRow =
    opts.business === null
      ? null
      : {
          id: opts.business?.id ?? 'biz-1',
          userId: opts.business?.userId ?? USER,
          status: opts.business?.status ?? 'PENDING',
          siren: opts.business?.siren ?? '980491005',
          siret: opts.business?.siret ?? '98049100500016',
          denomination: opts.business?.denomination ?? 'ATELIER TEST',
          legalForm: opts.business?.legalForm ?? 'SAS',
          establishmentAddress: opts.business?.establishmentAddress ?? '10 Rue de la Paix 75002 Paris',
          vatNumber: opts.business?.vatNumber ?? 'FR12980491005',
          dirigeantName: opts.business?.dirigeantName ?? 'Jean Dupont',
          registrationProofPath: opts.business?.registrationProofPath ?? 'business-documents/user-1/kbis.pdf',
          registrationProofName: opts.business?.registrationProofName ?? 'kbis.pdf',
          registrationProofSizeBytes: opts.business?.registrationProofSizeBytes ?? 10240,
          insuranceProofPath: opts.business?.insuranceProofPath ?? 'business-documents/user-1/rcpro.pdf',
          insuranceProofName: opts.business?.insuranceProofName ?? 'rcpro.pdf',
          insuranceProofSizeBytes: opts.business?.insuranceProofSizeBytes ?? 20480,
          decisionMotif: opts.business?.decisionMotif ?? null,
          decisionNote: opts.business?.decisionNote ?? null,
          decidedAt: opts.business?.decidedAt ?? null,
          decidedByUserId: opts.business?.decidedByUserId ?? null,
          submittedAt: opts.business?.submittedAt ?? new Date('2026-10-01T10:00:00.000Z'),
          verifiedAt: opts.business?.verifiedAt ?? null,
          user: opts.user === null ? null : {
            id: opts.user?.id ?? USER,
            email: opts.user?.email ?? 'repairer@example.com',
            name: opts.user?.name ?? 'Jean Dupont',
            firstName: opts.user?.firstName ?? 'Jean',
            lastName: opts.user?.lastName ?? 'Dupont',
            image: opts.user?.image ?? null,
            profile: {
              avatarPath: opts.user?.profile?.avatarPath ?? null,
              verificationLevel: opts.user?.profile?.verificationLevel ?? 'IDENTITY',
            },
          },
        };

  const tx = {
    businessVerification: {
      update: vi.fn().mockResolvedValue(businessRow),
      findUnique: vi.fn().mockResolvedValue(businessRow ? { status: 'APPROVED', verifiedAt: new Date() } : null),
    },
    profile: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    repairerProfile: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const order: string[] = [];
  const prisma = {
    businessVerification: {
      findUnique: vi.fn().mockResolvedValue(businessRow),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.deciderUser !== undefined ? opts.deciderUser : { email: 'admin@revime.fr' }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const r = await fn(tx);
      order.push('commit');
      return r;
    }),
  };

  const emit = vi.fn(async () => {
    order.push('emit');
  });

  const service = new AdminVerificationsService(prisma as never, { emit } as never);
  return { service, prisma, tx, emit, order };
}

const failure = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppException);
  const ex = e as AppException;
  return { status: ex.getStatus(), message: ex.message };
};

describe('AdminVerificationsService - Business Decisions', () => {
  describe('getBusinessDetails', () => {
    it('returns formatted business verification details with signed URLs and decider email', async () => {
      const { service } = harness({
        business: {
          decisionMotif: 'DOCUMENT_EXPIRED',
          decisionNote: 'KBIS date de plus de 3 mois',
          decidedAt: new Date('2026-10-02T12:00:00.000Z'),
          decidedByUserId: 'admin-99',
        },
        deciderUser: { email: 'superadmin@revime.fr' },
      });

      const details = await service.getBusinessDetails(USER);

      expect(details.userId).toBe(USER);
      expect(details.user.email).toBe('repairer@example.com');
      expect(details.user.verifiedIdentityName).toBe('Jean Dupont');
      expect(details.business).not.toBeNull();
      expect(details.business?.denomination).toBe('ATELIER TEST');
      expect(details.business?.siren).toBe('980491005');
      expect(details.business?.registrationProof.name).toBe('kbis.pdf');
      expect(details.business?.insuranceProof?.name).toBe('rcpro.pdf');
      expect(details.decision).toEqual({
        motif: 'DOCUMENT_EXPIRED',
        note: 'KBIS date de plus de 3 mois',
        decidedAt: '2026-10-02T12:00:00.000Z',
        decidedByEmail: 'superadmin@revime.fr',
      });
    });

    it('throws 404 when BusinessVerification does not exist', async () => {
      const { service } = harness({ business: null });
      const f = await failure(service.getBusinessDetails(USER));
      expect(f.status).toBe(404);
    });
  });

  describe('approveBusiness', () => {
    it('approves verification, promotes profile, and emits BUSINESS_VERIFIED notification', async () => {
      const { service, tx, emit, order } = harness();

      const res = await service.approveBusiness(ACTOR, USER);
      expect(res).toEqual({ success: true });

      expect(tx.businessVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER },
          data: expect.objectContaining({
            status: 'APPROVED',
            decidedByUserId: ACTOR,
            decisionMotif: null,
            decisionNote: null,
          }),
        }),
      );

      expect(tx.profile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER, verificationLevel: 'IDENTITY', verificationRevokedAt: null },
          data: expect.objectContaining({
            verificationLevel: 'BUSINESS',
          }),
        }),
      );

      // CMP-D3. The approval that promoted him also marks the fiscal step done, for a PRO only.
      expect(tx.repairerProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: USER, kind: 'PRO', fiscalCompletedAt: null },
        data: { fiscalCompletedAt: expect.any(Date) },
      });

      expect(emit).toHaveBeenCalledWith({
        userId: USER,
        mode: 'REPAIRER',
        type: 'BUSINESS_VERIFIED',
        actorName: 'REVIME',
      });
      expect(order).toEqual(['commit', 'emit']);
    });

    it('throws 404 if business verification does not exist', async () => {
      const { service } = harness({ business: null });
      const f = await failure(service.approveBusiness(ACTOR, USER));
      expect(f.status).toBe(404);
    });
  });

  describe('refuseBusiness', () => {
    it('sets REJECTED, demotes profile to IDENTITY, and emits BUSINESS_REFUSED notification', async () => {
      const { service, tx, emit, order } = harness();
      const input: BusinessDecisionInput = {
        motif: 'DIRIGEANT_MISMATCH',
        note: 'Le nom ne correspond pas',
      };

      const res = await service.refuseBusiness(ACTOR, USER, input);
      expect(res).toEqual({ success: true });

      expect(tx.businessVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER },
          data: expect.objectContaining({
            status: 'REJECTED',
            decisionMotif: 'DIRIGEANT_MISMATCH',
            decisionNote: 'Le nom ne correspond pas',
            decidedByUserId: ACTOR,
            verifiedAt: null,
          }),
        }),
      );

      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { userId: USER, verificationLevel: 'BUSINESS' },
        data: { verificationLevel: 'IDENTITY' },
      });

      expect(emit).toHaveBeenCalledWith({
        userId: USER,
        mode: 'REPAIRER',
        type: 'BUSINESS_REFUSED',
        actorName: 'REVIME',
      });
      expect(order).toEqual(['commit', 'emit']);
    });

    it('throws 404 if business verification does not exist', async () => {
      const { service } = harness({ business: null });
      const f = await failure(service.refuseBusiness(ACTOR, USER, { motif: 'OTHER', note: 'Explications' }));
      expect(f.status).toBe(404);
    });
  });

  describe('requestBusinessDocuments', () => {
    it('sets DOCUMENTS_REQUIRED, demotes profile to IDENTITY, and emits BUSINESS_DOCUMENTS_REQUIRED notification', async () => {
      const { service, tx, emit, order } = harness();
      const input: BusinessDecisionInput = {
        motif: 'DOCUMENT_ILLEGIBLE',
        note: 'Scan trop sombre',
      };

      const res = await service.requestBusinessDocuments(ACTOR, USER, input);
      expect(res).toEqual({ success: true });

      expect(tx.businessVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER },
          data: expect.objectContaining({
            status: 'DOCUMENTS_REQUIRED',
            decisionMotif: 'DOCUMENT_ILLEGIBLE',
            decisionNote: 'Scan trop sombre',
            decidedByUserId: ACTOR,
            verifiedAt: null,
          }),
        }),
      );

      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { userId: USER, verificationLevel: 'BUSINESS' },
        data: { verificationLevel: 'IDENTITY' },
      });

      expect(emit).toHaveBeenCalledWith({
        userId: USER,
        mode: 'REPAIRER',
        type: 'BUSINESS_DOCUMENTS_REQUIRED',
        actorName: 'REVIME',
      });
      expect(order).toEqual(['commit', 'emit']);
    });

    it('throws 404 if business verification does not exist', async () => {
      const { service } = harness({ business: null });
      const f = await failure(service.requestBusinessDocuments(ACTOR, USER, { motif: 'DOCUMENT_EXPIRED' }));
      expect(f.status).toBe(404);
    });
  });
});
