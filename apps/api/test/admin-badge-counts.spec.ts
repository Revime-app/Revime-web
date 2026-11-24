import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import { adminBadgeCountsSchema } from '@revime/shared';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';
import { AdminController } from '../src/admin/admin.controller.js';
import {
  BUSINESS_NEEDS_DECISION_WHERE,
  IDENTITY_NEEDS_DECISION_WHERE,
} from '../src/admin/verification-needs-decision.js';

describe('UI3: Admin Badge Counts', () => {
  let prismaMock: {
    dispute: { count: ReturnType<typeof vi.fn> };
    cancellationRequest: { count: ReturnType<typeof vi.fn> };
    conversationReport: { count: ReturnType<typeof vi.fn> };
    identityVerification: { count: ReturnType<typeof vi.fn> };
    businessVerification: { count: ReturnType<typeof vi.fn> };
    staffInvitation: { count: ReturnType<typeof vi.fn> };
  };
  let cronMock: {
    attentionItems: ReturnType<typeof vi.fn>;
  };
  let overviewService: AdminOverviewService;

  beforeEach(() => {
    prismaMock = {
      dispute: { count: vi.fn().mockResolvedValue(3) },
      cancellationRequest: { count: vi.fn().mockResolvedValue(2) },
      conversationReport: { count: vi.fn().mockResolvedValue(5) },
      identityVerification: { count: vi.fn().mockResolvedValue(4) },
      businessVerification: { count: vi.fn().mockResolvedValue(1) },
      staffInvitation: { count: vi.fn().mockResolvedValue(6) },
    };
    cronMock = {
      attentionItems: vi.fn().mockResolvedValue([
        { commandeId: 'c1', reason: 'PAYMENT_EXPIRED' },
        { commandeId: 'c2', reason: 'NO_TRACKING' },
      ]),
    };
    overviewService = new AdminOverviewService(prismaMock as never, NO_ATTENTION as never);
  });

  describe('AdminOverviewService.getBadgeCounts', () => {
    it('queries action-required queues with correct filter conditions', async () => {
      const counts = await overviewService.getBadgeCounts();

      expect(prismaMock.dispute.count).toHaveBeenCalledWith({
        where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      });
      expect(prismaMock.cancellationRequest.count).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
      expect(prismaMock.conversationReport.count).toHaveBeenCalledWith({
        where: { resolvedAt: null },
      });
      // The rule is pinned in admin-verification-needs-decision.spec.ts; here only that the badge reads it.
      expect(prismaMock.identityVerification.count).toHaveBeenCalledWith({
        where: IDENTITY_NEEDS_DECISION_WHERE,
      });
      expect(prismaMock.businessVerification.count).toHaveBeenCalledWith({
        where: BUSINESS_NEEDS_DECISION_WHERE,
      });

      // Only an invitation that can still be accepted is pending.
      expect(prismaMock.staffInvitation.count).toHaveBeenCalledWith({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      });

      expect(counts).toEqual({
        litiges: 3,
        annulations: 2,
        signalements: 5,
        verifications: 5, // 4 identity + 1 business
        equipe: 6,
      });
    });

    it('handles zero counts gracefully', async () => {
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.cancellationRequest.count.mockResolvedValue(0);
      prismaMock.conversationReport.count.mockResolvedValue(0);
      prismaMock.identityVerification.count.mockResolvedValue(0);
      prismaMock.businessVerification.count.mockResolvedValue(0);
      prismaMock.staffInvitation.count.mockResolvedValue(0);

      const counts = await overviewService.getBadgeCounts();
      expect(counts).toEqual({
        litiges: 0,
        annulations: 0,
        signalements: 0,
        verifications: 0,
        equipe: 0,
      });
    });
  });

  describe('AdminController.badgeCounts', () => {
    it('aggregates overview counts with cron attention items count and validates schema', async () => {
      const controller = new AdminController(
        prismaMock as never,
        {} as never, // refunds
        cronMock as never,
        {} as never, // catalog
        {} as never, // moderationAdmin
        overviewService,
        {} as never, // auditService
        {} as never, // users
        {} as never, // usersWrite
        {} as never, // repairers
        {} as never, // repairersWrite
        {} as never, // demandes
        {} as never, // demandesWrite
        {} as never, // offres
        {} as never, // shipments
      );

      const res = await controller.badgeCounts();

      expect(res).toEqual({
        litiges: 3,
        annulations: 2,
        signalements: 5,
        verifications: 5,
        equipe: 6,
        attention: 2,
      });

      // Validates schema adherence
      const parsed = adminBadgeCountsSchema.parse(res);
      expect(parsed).toEqual(res);
    });
  });
});
