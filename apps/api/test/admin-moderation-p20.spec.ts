import { describe, expect, it, vi } from 'vitest';
import { ModerationAdminService } from '../src/admin/moderation-admin.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { ReportTargetType } from '@revime/shared';

function makePrismaMock(options: {
  reportRows?: any[];
  singleReport?: any | null;
  findFirstReport?: any | null;
  updateManyCount?: number;
} = {}) {
  const {
    reportRows = [],
    singleReport = null,
    findFirstReport = null,
    updateManyCount = 1,
  } = options;

  return {
    conversationReport: {
      findMany: vi.fn().mockResolvedValue(reportRows),
      findUnique: vi.fn().mockResolvedValue(singleReport),
      findFirst: vi.fn().mockResolvedValue(findFirstReport),
      count: vi.fn().mockResolvedValue(reportRows.length),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    review: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as any;
}

const createService = (prisma: any) => new ModerationAdminService(prisma);

describe('P20 — ModerationAdminService: Multi-Entity Previews & Controls Guard', () => {
  describe('getReportDetail() target derivation & summaries', () => {
    it('populates default targetType MESSAGE, estimates the reported message, and sets targetEntitySummary', async () => {
      const mockReport = {
        id: 'rep-msg-1',
        conversationId: 'conv-1',
        reporterUserId: 'usr-reporter-1',
        reportedUserId: 'usr-reported-1',
        reason: 'HARASSMENT',
        createdAt: new Date('2026-10-14T10:00:00Z'),
        resolvedAt: null,
        assignedToUserId: null,
        assignedAt: null,
        resolvedByUserId: null,
        resolutionVerdict: null,
        resolutionNote: null,
        reporter: {
          id: 'usr-reporter-1',
          name: 'Alice Client',
          email: 'alice@example.fr',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        reported: {
          id: 'usr-reported-1',
          name: 'Bob Réparateur',
          email: 'bob@example.fr',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          role: 'repairer',
          banned: false,
          profile: { repairerSuspendedAt: null },
        },
        conversation: {
          id: 'conv-1',
          deletedAt: null,
          demande: {
            id: 'dem-1',
            title: 'Réparation écran iPhone 13',
          },
          messages: [
            {
              id: 'msg-1',
              body: 'Bonjour, pouvez-vous réparer mon écran ?',
              createdAt: new Date('2026-10-14T09:00:00Z'),
              deletedAt: null,
              senderUserId: 'usr-reporter-1',
              sender: { name: 'Alice Client' },
            },
            {
              id: 'msg-2',
              body: 'Passez hors plateforme ou je refuse le devis.',
              createdAt: new Date('2026-10-14T09:30:00Z'),
              deletedAt: null,
              senderUserId: 'usr-reported-1',
              sender: { name: 'Bob Réparateur' },
            },
          ],
        },
      };

      const prisma = makePrismaMock({ singleReport: mockReport });
      const service = createService(prisma);

      const detail = await service.getReportDetail('rep-msg-1');

      expect(detail.targetType).toBe('MESSAGE');
      expect(detail.likelyReportedMessageId).toBe('msg-2');
      expect(detail.targetEntitySummary.targetType).toBe('MESSAGE');
      expect(detail.targetEntitySummary.title).toContain('Bob Réparateur');
      expect(detail.targetEntitySummary.description).toBe('Passez hors plateforme ou je refuse le devis.');
    });

    it('never invents a profile, review or demande target: the schema cannot carry one', async () => {
      const prisma = makePrismaMock({
        singleReport: {
          id: 'rep-x',
          conversationId: 'conv-x',
          reporterUserId: 'u-1',
          reportedUserId: 'u-2',
          reason: 'SPAM',
          createdAt: new Date('2026-10-14T10:00:00Z'),
          resolvedAt: null,
          assignedToUserId: null,
          assignedAt: null,
          resolvedByUserId: null,
          resolutionVerdict: null,
          resolutionNote: null,
          // Columns the schema does not have: whatever a double supplies must not change the answer.
          targetType: 'REVIEW',
          reviewComment: 'invented',
          reporter: { id: 'u-1', name: 'Alice', email: 'a@example.fr', createdAt: new Date('2026-01-01T00:00:00Z') },
          reported: {
            id: 'u-2',
            name: 'Charlie',
            email: 'c@example.fr',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            role: 'client',
            banned: false,
            profile: { repairerSuspendedAt: null },
          },
          conversation: { id: 'conv-x', deletedAt: null, demande: { id: 'd', title: 'T' }, messages: [] },
        },
      });

      const detail = await createService(prisma).getReportDetail('rep-x');

      expect(detail.targetType).toBe('MESSAGE');
      expect(detail.targetEntitySummary.targetType).toBe('MESSAGE');
      expect(detail.targetEntitySummary.rating).toBeUndefined();
      expect(detail.targetEntitySummary.comment).toBeUndefined();
      expect(detail.likelyReportedMessageId).toBeNull();
    });
  });

  describe('listReports() targetType inclusion', () => {
    it('returns targetType for each report item', async () => {
      const mockRow = {
        id: 'rep-item-1',
        conversationId: 'conv-1',
        reason: 'SCAM',
        createdAt: new Date('2026-10-14T08:00:00Z'),
        resolvedAt: null,
        resolutionVerdict: null,
        assignedToUserId: null,
        reporter: {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@example.fr',
        },
        reported: {
          id: 'u-2',
          name: 'Bob',
          email: 'bob@example.fr',
        },
        conversation: {
          deletedAt: null,
          demande: {
            id: 'dem-1',
            title: 'Changement batterie Mac',
          },
        },
      };

      const prisma = makePrismaMock({ reportRows: [mockRow] });
      const service = createService(prisma);

      const result = await service.listReports();

      expect(result.items.length).toBe(1);
      expect(result.items[0]!.targetType).toBe('MESSAGE');
    });
  });

  describe('Resolved report guards', () => {
    it('still closes a conversation whose earlier report was resolved (RU-22: the page hides the button, the API stays idempotent)', async () => {
      const resolvedReport = {
        id: 'rep-res-1',
        conversationId: 'conv-resolved-1',
        resolvedAt: new Date('2026-10-13T12:00:00Z'),
      };

      const prisma = makePrismaMock({ findFirstReport: resolvedReport });
      const service = createService(prisma);

      await expect(service.closeConversation('conv-resolved-1')).resolves.toBeUndefined();
      expect(prisma.conversation.updateMany).toHaveBeenCalled();
    });

    it('throws UNPROCESSABLE_ENTITY when attempting to unassign an already resolved report', async () => {
      const resolvedReport = {
        id: 'rep-res-2',
        resolvedAt: new Date('2026-10-13T12:00:00Z'),
      };

      const prisma = makePrismaMock({ singleReport: resolvedReport });
      const service = createService(prisma);

      await expect(service.unassignReport('rep-res-2')).rejects.toThrow(AppException);
      await expect(service.unassignReport('rep-res-2')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
      });
    });
  });
});
