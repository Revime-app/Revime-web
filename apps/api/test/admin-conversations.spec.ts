import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminConversationsService } from '../src/admin/admin-conversations.service.js';
import { AdminConversationsController } from '../src/admin/admin-conversations.controller.js';
import { AppException } from '../src/common/app-exception.js';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';
import { GENUINE_USER_WHERE } from '../src/admin/admin-constants.js';
import { ZodValidationPipe } from '../src/common/zod-validation.pipe.js';
import {
  adminConversationDetailResponseSchema,
  adminConversationListResponseSchema,
  adminConversationKpisSchema,
} from '@revime/shared';

describe('AdminConversationsService', () => {
  let mockPrisma: any;
  let service: AdminConversationsService;

  const validUuid1 = 'a0000000-0000-4000-8000-000000000001';
  const validUuid2 = 'a0000000-0000-4000-8000-000000000002';
  const validClientUserId = 'usr-client-123';
  const validRepairerUserId = 'usr-repairer-456';
  const validDemandeId = 'dmd-test-789';
  const validDisputeId = 'dsp-test-999';

  const sampleConversationRow = {
    id: validUuid1,
    demandeId: validDemandeId,
    clientUserId: validClientUserId,
    repairerUserId: validRepairerUserId,
    lastMessageAt: new Date('2026-10-16T12:00:00Z'),
    clientLastReadAt: new Date('2026-10-16T12:00:00Z'),
    repairerLastReadAt: new Date('2026-10-16T11:50:00Z'),
    createdAt: new Date('2026-10-15T10:00:00Z'),
    updatedAt: new Date('2026-10-16T12:00:00Z'),
    deletedAt: null,
    demande: {
      id: validDemandeId,
      title: 'Réparation iPhone 13 Pro',
      status: 'IN_PROGRESS',
      budgetCents: 15000,
      category: { labelFr: 'Smartphones' },
      commandes: [
        {
          id: 'cmd-1',
          status: 'PAID',
          totalCents: 14500,
          dispute: { id: validDisputeId },
        },
      ],
    },
    client: {
      id: validClientUserId,
      name: 'Alice Dupont',
      email: 'alice@example.com',
      phone: '+33612345678',
      createdAt: new Date('2026-09-01T08:00:00Z'),
      profile: {
        avatarPath: 'profiles/alice/avatar.jpg',
      },
    },
    repairer: {
      id: validRepairerUserId,
      name: 'Bob Réparateur',
      email: 'bob@atelier.fr',
      phone: '+33698765432',
      profile: { avatarPath: 'profiles/bob/avatar.jpg', verificationLevel: 'BUSINESS' },
      repairerProfile: {
        displayName: 'Atelier Mobile Express',
      },
    },
    reports: [{ id: 'rep-1' }],
    messages: [
      {
        id: 'msg-1',
        senderUserId: validClientUserId,
        kind: 'USER',
        body: 'Bonjour, avez-vous la vitre en stock ?',
        photoPath: null,
        documentPath: null,
        documentName: null,
        createdAt: new Date('2026-10-16T12:00:00Z'),
        deletedAt: null,
        sender: {
          id: validClientUserId,
          name: 'Alice Dupont',
          role: null,
        },
      },
    ],
    _count: {
      messages: 12,
    },
  };

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([sampleConversationRow]),
        findUnique: vi.fn().mockResolvedValue(sampleConversationRow),
        count: vi.fn().mockImplementation(async (args?: any) => {
          if (args?.where?.deletedAt === null) return 40;
          if (args?.where?.deletedAt?.not === null) return 10;
          if (args?.where?.demande?.commandes?.some?.dispute?.isNot === null) return 5;
          if (args?.where?.reports?.some) return 3;
          return 50;
        }),
        update: vi.fn().mockResolvedValue({ id: validUuid1 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: validUuid1 }]),
    };

    service = new AdminConversationsService(mockPrisma as any);
  });

  describe('listConversations', () => {
    it('returns paginated items and parallel KPIs conforming to shared schema', async () => {
      const res = await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(1);
      const findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(20);
      expect(findArgs.orderBy).toEqual([{ lastMessageAt: 'desc' }, { createdAt: 'desc' }]);

      expect(res.total).toBe(50);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.kpis).toEqual({
        total: 50,
        activeCount: 40,
        closedCount: 10,
        withDisputeCount: 5,
        withReportCount: 3,
      });

      expect(res.items).toHaveLength(1);
      const item = res.items[0]!;
      expect(item.id).toBe(validUuid1);
      expect(item.client.name).toBe('Alice Dupont');
      expect(item.repairer.companyName).toBe('Atelier Mobile Express');
      expect(item.demande?.title).toBe('Réparation iPhone 13 Pro');
      expect(item.messagesCount).toBe(12);
      expect(item.hasDispute).toBe(true);
      expect(item.disputeId).toBe(validDisputeId);
      expect(item.hasReport).toBe(true);
      expect(item.closed).toBe(false);
      expect(item.lastMessage?.body).toBe('Bonjour, avez-vous la vitre en stock ?');
      expect(item.lastMessage?.senderName).toBe('Alice Dupont');
      expect(item.lastMessage?.isSystem).toBe(false);

      // Contract validation
      expect(() => adminConversationListResponseSchema.parse(res)).not.toThrow();
    });

    it('handles conversations with no messages gracefully', async () => {
      const emptyRow = {
        ...sampleConversationRow,
        id: validUuid2,
        messages: [],
        _count: { messages: 0 },
        lastMessageAt: null,
      };
      mockPrisma.conversation.findMany.mockResolvedValueOnce([emptyRow]);

      const res = await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });

      const firstItem = res.items[0]!;
      expect(firstItem.lastMessage).toBeNull();
      expect(firstItem.lastMessageAt).toBeNull();
      expect(firstItem.messagesCount).toBe(0);
      expect(() => adminConversationListResponseSchema.parse(res)).not.toThrow();
    });

    it('searches in SQL with unaccent and feeds the matching ids back as id: { in }', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: validUuid2 }]);

      await service.listConversations({
        q: 'Eleonore',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = mockPrisma.$queryRaw.mock.calls[0][0];
      const text = sql.strings.join('?');
      // Every searched column is folded on its own: one bare `lower()` would miss « Éléonore » there
      for (const column of [
        'cu."name"',
        'cu."email"',
        'ru."name"',
        'ru."email"',
        `coalesce(rp."displayName", '')`,
        `coalesce(d."title", '')`,
        'm."body"',
      ]) {
        expect(text).toContain(`unaccent(lower(${column}))`);
      }
      expect(sql.values).toContain('Eleonore');

      const findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({ id: { in: [validUuid2] } });
    });

    it('does not run the search query for an empty q', async () => {
      await service.listConversations({
        q: '   ',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('leaves fixture and demo accounts out of the list and of every KPI', async () => {
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });

      const genuine = { client: GENUINE_USER_WHERE, repairer: GENUINE_USER_WHERE };
      expect(mockPrisma.conversation.findMany.mock.calls[0][0].where.AND).toContainEqual(genuine);
      // total + the five KPI counts: every count carries both participants' filter
      const counts = mockPrisma.conversation.count.mock.calls.map((c: any[]) => c[0].where);
      expect(counts).toHaveLength(6);
      for (const w of counts) {
        const flat = JSON.stringify(w);
        expect(flat).toContain(JSON.stringify(GENUINE_USER_WHERE));
      }
    });

    it('filters by status: open, closed, all', async () => {
      // status: open
      await service.listConversations({
        q: '',
        status: 'open',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      let findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({ deletedAt: null });

      mockPrisma.conversation.findMany.mockClear();

      // status: closed
      await service.listConversations({
        q: '',
        status: 'closed',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({ deletedAt: { not: null } });

      mockPrisma.conversation.findMany.mockClear();

      // status: all
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND.some((c: any) => 'deletedAt' in c)).toBe(false);
    });

    it('filters by dispute and report status', async () => {
      // hasDispute: true
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'true',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      let findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({
        demande: { commandes: { some: { dispute: { isNot: null } } } },
      });

      mockPrisma.conversation.findMany.mockClear();

      // hasDispute: false
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'false',
        hasReport: 'all',
        page: 1,
        limit: 20,
      });
      findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({
        NOT: { demande: { commandes: { some: { dispute: { isNot: null } } } } },
      });

      mockPrisma.conversation.findMany.mockClear();

      // hasReport: true
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'true',
        page: 1,
        limit: 20,
      });
      findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({
        reports: { some: {} },
      });

      mockPrisma.conversation.findMany.mockClear();

      // hasReport: false
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'false',
        page: 1,
        limit: 20,
      });
      findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.where.AND).toContainEqual({
        reports: { none: {} },
      });
    });

    it('applies date boundaries on createdAt', async () => {
      await service.listConversations({
        q: '',
        status: 'all',
        hasDispute: 'all',
        hasReport: 'all',
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-15T23:59:59Z',
        page: 2,
        limit: 15,
      });

      const findArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(findArgs.skip).toBe(15);
      expect(findArgs.take).toBe(15);

      const dateCondition = findArgs.where.AND.find((c: any) => c.createdAt);
      expect(dateCondition).toBeDefined();
      expect(dateCondition.createdAt.gte).toEqual(new Date('2026-10-01T00:00:00Z'));
      expect(dateCondition.createdAt.lte).toEqual(new Date('2026-10-15T23:59:59Z'));
    });
  });

  describe('getConversationDetail', () => {
    it('throws AppException(NOT_FOUND) when conversation does not exist', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.getConversationDetail('non-existent-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('returns full thread detail with correct message role attributions and soft-delete flags', async () => {
      const fullDetailRow = {
        ...sampleConversationRow,
        messages: [
          {
            id: 'msg-client',
            senderUserId: validClientUserId,
            kind: 'USER',
            body: 'Bonjour, pouvez-vous réparer mon écran ?',
            photoPath: 'conversations/conv-1/screen.jpg',
            documentPath: null,
            documentName: null,
            createdAt: new Date('2026-10-16T10:00:00Z'),
            deletedAt: null,
            sender: { id: validClientUserId, name: 'Alice Dupont', role: null },
          },
          {
            id: 'msg-repairer',
            senderUserId: validRepairerUserId,
            kind: 'USER',
            body: 'Oui bien sûr, voici le devis.',
            photoPath: null,
            documentPath: 'conversations/conv-1/devis.pdf',
            documentName: 'devis-123.pdf',
            createdAt: new Date('2026-10-16T10:05:00Z'),
            deletedAt: null,
            sender: { id: validRepairerUserId, name: 'Bob Réparateur', role: null },
          },
          {
            id: 'msg-admin',
            senderUserId: 'usr-admin-moderator',
            kind: 'SUPPORT',
            body: 'Message modéré suite à signalement.',
            photoPath: null,
            documentPath: null,
            documentName: null,
            createdAt: new Date('2026-10-16T10:10:00Z'),
            deletedAt: new Date('2026-10-16T10:11:00Z'),
            sender: { id: 'usr-admin-moderator', name: 'Support Revime', role: 'moderation' },
          },
          {
            id: 'msg-system',
            senderUserId: null,
            kind: 'SYSTEM',
            body: 'La commande a été payée.',
            photoPath: null,
            documentPath: null,
            documentName: null,
            createdAt: new Date('2026-10-16T10:15:00Z'),
            deletedAt: null,
            sender: null,
          },
        ],
      };

      mockPrisma.conversation.findUnique.mockResolvedValueOnce(fullDetailRow);

      const res = await service.getConversationDetail(validUuid1);

      expect(res.id).toBe(validUuid1);
      expect(res.client.id).toBe(validClientUserId);
      expect(res.client.email).toBe('alice@example.com');
      expect(res.repairer.id).toBe(validRepairerUserId);
      expect(res.repairer.companyName).toBe('Atelier Mobile Express');
      expect(res.repairer.verified).toBe(true);
      expect(res.commande?.id).toBe('cmd-1');
      expect(res.commande?.status).toBe('PAID');
      expect(res.commande?.disputeId).toBe(validDisputeId);
      expect(res.reportsCount).toBe(1);

      expect(res.messages).toHaveLength(4);

      // 1. Client message
      expect(res.messages[0]!.senderRole).toBe('CLIENT');
      expect(res.messages[0]!.senderName).toBe('Alice Dupont');
      expect(res.messages[0]!.deleted).toBe(false);

      // 2. Repairer message
      expect(res.messages[1]!.senderRole).toBe('REPAIRER');
      expect(res.messages[1]!.senderName).toBe('Bob Réparateur');
      expect(res.messages[1]!.documentName).toBe('devis-123.pdf');
      expect(res.messages[1]!.deleted).toBe(false);

      // 3. Admin message with soft-delete
      expect(res.messages[2]!.senderRole).toBe('ADMIN');
      expect(res.messages[2]!.senderName).toBe('Support Revime');
      expect(res.messages[2]!.deleted).toBe(true);
      expect(res.messages[2]!.deletedAt).toBe('2026-10-16T10:11:00.000Z');

      // 4. System message
      expect(res.messages[3]!.senderRole).toBe('SYSTEM');
      expect(res.messages[3]!.senderName).toBe('Revime');
      expect(res.messages[3]!.deleted).toBe(false);

      // Validate schema
      expect(() => adminConversationDetailResponseSchema.parse(res)).not.toThrow();
    });

    it('shows a repairer below identity level as not verified', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce({
        ...sampleConversationRow,
        repairer: {
          ...sampleConversationRow.repairer,
          profile: { avatarPath: null, verificationLevel: 'BASIC' },
        },
      });

      const res = await service.getConversationDetail(validUuid1);
      expect(res.repairer.verified).toBe(false);
      expect(res.repairer.avatarUrl).toBeNull();
    });
  });

  describe('moderation actions', () => {
    it('closeConversation stamps deletedAt', async () => {
      await service.closeConversation(validUuid1);

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: validUuid1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('closeConversation throws AppException(NOT_FOUND) when Prisma returns P2025', async () => {
      mockPrisma.conversation.update.mockRejectedValueOnce(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );

      await expect(service.closeConversation('non-existent')).rejects.toThrow(AppException);
    });

    it('reopenConversation clears deletedAt', async () => {
      await service.reopenConversation(validUuid1);

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: validUuid1 },
        data: { deletedAt: null },
      });
    });

    it('reopenConversation throws AppException(NOT_FOUND) when Prisma returns P2025', async () => {
      mockPrisma.conversation.update.mockRejectedValueOnce(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );

      await expect(service.reopenConversation('non-existent')).rejects.toThrow(AppException);
    });

    it('lets any other database error through', async () => {
      mockPrisma.conversation.update.mockRejectedValueOnce(new Error('connection lost'));
      await expect(service.closeConversation(validUuid1)).rejects.toThrow('connection lost');
    });
  });

  describe('getConversationKpis', () => {
    it('returns global conversation KPI aggregates', async () => {
      const kpis = await service.getConversationKpis();

      expect(kpis).toEqual({
        total: 50,
        activeCount: 40,
        closedCount: 10,
        withDisputeCount: 5,
        withReportCount: 3,
      });

      expect(() => adminConversationKpisSchema.parse(kpis)).not.toThrow();
    });
  });

  describe('AdminConversationsController', () => {
    let mockService: any;
    let controller: AdminConversationsController;

    beforeEach(() => {
      mockService = {
        listConversations: vi.fn(),
        getConversationDetail: vi.fn(),
        getConversationKpis: vi.fn(),
        closeConversation: vi.fn(),
        reopenConversation: vi.fn(),
      };
      controller = new AdminConversationsController(mockService);
    });

    it('getKpis returns the service KPIs without loading a page of conversations', async () => {
      const kpis = {
        total: 10,
        activeCount: 8,
        closedCount: 2,
        withDisputeCount: 1,
        withReportCount: 1,
      };
      mockService.getConversationKpis.mockResolvedValueOnce(kpis);

      expect(await controller.getKpis()).toEqual(kpis);
      expect(mockService.listConversations).not.toHaveBeenCalled();
    });

    it('closeConversation and reopenConversation forward the conversation id', async () => {
      expect(await controller.closeConversation('conv-123')).toEqual({ ok: true });
      expect(mockService.closeConversation).toHaveBeenCalledWith('conv-123');

      expect(await controller.reopenConversation('conv-123')).toEqual({ ok: true });
      expect(mockService.reopenConversation).toHaveBeenCalledWith('conv-123');
    });

    it('audits the two moderation actions AND the read of a private thread, with the session actor', () => {
      const meta = (name: keyof AdminConversationsController) =>
        Reflect.getMetadata(AUDIT_KEY, AdminConversationsController.prototype[name]) as {
          action: string;
          targetType: string;
          targetParam: string;
          detailFields?: string[];
        };

      expect(meta('getDetail')).toMatchObject({
        action: 'conversation.read',
        targetType: 'Conversation',
        targetParam: 'id',
      });
      expect(meta('closeConversation')).toMatchObject({
        action: 'conversation.close',
        targetParam: 'id',
        detailFields: ['reason'],
      });
      expect(meta('reopenConversation')).toMatchObject({ action: 'conversation.reopen', targetParam: 'id' });
    });

    it('getDetail delegates to conversationsService.getConversationDetail', async () => {
      const mockDetail = { id: 'conv-123', closed: false } as any;
      mockService.getConversationDetail.mockResolvedValueOnce(mockDetail);

      const res = await controller.getDetail('conv-123');
      expect(res).toBe(mockDetail);
      expect(mockService.getConversationDetail).toHaveBeenCalledWith('conv-123');
    });

    it('validates the list query with the shared schema (400, not 500, on limit=999)', () => {
      const params = Reflect.getMetadata('__routeArguments__', AdminConversationsController, 'list') as Record<
        string,
        { index: number; pipes?: unknown[] }
      >;
      const query = Object.values(params).find((p) => p.index === 0);
      const pipe = query?.pipes?.[0] as ZodValidationPipe<unknown>;
      expect(pipe).toBeInstanceOf(ZodValidationPipe);

      expect(pipe.transform({ q: 'smartphone', status: 'open', page: '2', limit: '15' })).toMatchObject({
        q: 'smartphone',
        status: 'open',
        page: 2,
        limit: 15,
      });
      expect(() => pipe.transform({ limit: '999' })).toThrow(AppException);
    });

    it('list delegates the validated query to listConversations', async () => {
      const mockList = { total: 1, items: [], page: 1, limit: 20, kpis: {} as any };
      mockService.listConversations.mockResolvedValueOnce(mockList);
      const query = { q: '', status: 'all', hasDispute: 'all', hasReport: 'all', page: 1, limit: 20 } as const;

      expect(await controller.list(query)).toBe(mockList);
      expect(mockService.listConversations).toHaveBeenCalledWith(query);
    });
  });
});
