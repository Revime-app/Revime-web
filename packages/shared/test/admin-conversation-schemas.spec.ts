import { describe, expect, it } from 'vitest';
import {
  adminConversationStatusFilterSchema,
  adminConversationListQuerySchema,
  adminConversationSummaryItemSchema,
  adminConversationMessageItemSchema,
  adminConversationDetailResponseSchema,
  adminConversationKpisSchema,
  adminConversationListResponseSchema,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
} from '../src/index.js';

describe('F9: Admin Conversation Schemas (@revime/shared)', () => {
  describe('adminConversationStatusFilterSchema', () => {
    it('accepts valid statuses and rejects invalid ones', () => {
      expect(adminConversationStatusFilterSchema.safeParse('all').success).toBe(true);
      expect(adminConversationStatusFilterSchema.safeParse('open').success).toBe(true);
      expect(adminConversationStatusFilterSchema.safeParse('closed').success).toBe(true);
      expect(adminConversationStatusFilterSchema.safeParse('archived').success).toBe(false);
      expect(adminConversationStatusFilterSchema.safeParse('').success).toBe(false);
    });
  });

  describe('adminConversationListQuerySchema', () => {
    it('applies defaults for status, hasDispute, hasReport, page, and limit', () => {
      const parsed = adminConversationListQuerySchema.parse({});
      expect(parsed.q).toBe('');
      expect(parsed.status).toBe('all');
      expect(parsed.hasDispute).toBe('all');
      expect(parsed.hasReport).toBe('all');
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.startDate).toBeUndefined();
      expect(parsed.endDate).toBeUndefined();
    });

    it('coerces and clamps pagination and search parameters', () => {
      const parsed = adminConversationListQuerySchema.parse({
        q: '  iphone screen  ',
        status: 'open',
        hasDispute: 'true',
        hasReport: 'false',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-16T23:59:59.999Z',
        page: '3',
        limit: '15',
      });
      expect(parsed.q).toBe('iphone screen');
      expect(parsed.status).toBe('open');
      expect(parsed.hasDispute).toBe('true');
      expect(parsed.hasReport).toBe('false');
      expect(parsed.startDate).toBe('2026-10-01T00:00:00.000Z');
      expect(parsed.endDate).toBe('2026-10-16T23:59:59.999Z');
      expect(parsed.page).toBe(3);
      expect(parsed.limit).toBe(15);
    });

    it('clamps query string to 100 characters max and trims whitespace', () => {
      const longQuery = '   ' + 'a'.repeat(150) + '   ';
      const parsed = adminConversationListQuerySchema.parse({ q: longQuery });
      expect(parsed.q).toHaveLength(100);
      expect(parsed.q).toBe('a'.repeat(100));
    });

    it('rejects page < 1 and limit > 50', () => {
      expect(() => adminConversationListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => adminConversationListQuerySchema.parse({ page: -1 })).toThrow();
      expect(() => adminConversationListQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => adminConversationListQuerySchema.parse({ limit: 51 })).toThrow();
      expect(() => adminConversationListQuerySchema.parse({ limit: 100 })).toThrow();
    });

    it('rejects invalid enum values for hasDispute and hasReport', () => {
      expect(adminConversationListQuerySchema.safeParse({ hasDispute: 'maybe' }).success).toBe(false);
      expect(adminConversationListQuerySchema.safeParse({ hasReport: 'unknown' }).success).toBe(false);
    });
  });

  describe('adminConversationSummaryItemSchema', () => {
    it('validates a complete thread summary item', () => {
      const payload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        demande: {
          id: 'dmd-1',
          title: 'Écran cassé iPhone 13',
          status: 'IN_PROGRESS',
        },
        client: {
          id: 'usr-client',
          name: 'Alice Martin',
          email: 'alice@example.com',
          phone: '+33612345678',
        },
        repairer: {
          id: 'usr-rep',
          name: 'Bob Atelier',
          email: 'bob@example.com',
          companyName: 'Atelier Express',
        },
        messagesCount: 5,
        lastMessage: {
          id: 'msg-5',
          body: 'Parfait, nous commençons la réparation.',
          senderName: 'Bob Atelier',
          createdAt: '2026-10-16T12:00:00.000Z',
          isSystem: false,
        },
        lastMessageAt: '2026-10-16T12:00:00.000Z',
        closed: false,
        hasDispute: false,
        hasReport: false,
        disputeId: null,
        createdAt: '2026-10-15T10:00:00.000Z',
      };

      const parsed = adminConversationSummaryItemSchema.parse(payload);
      expect(parsed.client.name).toBe('Alice Martin');
      expect(parsed.messagesCount).toBe(5);
      expect(parsed.demande?.id).toBe('dmd-1');
      expect(parsed.lastMessage?.senderName).toBe('Bob Atelier');
    });

    it('accepts nullables for demande, lastMessage, lastMessageAt, and disputeId', () => {
      const payload = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        demande: null,
        client: {
          id: 'usr-client-2',
          name: 'Charlie Dupont',
          email: 'charlie@example.com',
        },
        repairer: {
          id: 'usr-rep-2',
          name: 'David Reparations',
          email: 'david@example.com',
        },
        messagesCount: 0,
        lastMessage: null,
        lastMessageAt: null,
        closed: true,
        hasDispute: true,
        hasReport: true,
        disputeId: 'dsp-123',
        createdAt: '2026-10-10T08:00:00.000Z',
      };

      const parsed = adminConversationSummaryItemSchema.parse(payload);
      expect(parsed.demande).toBeNull();
      expect(parsed.lastMessage).toBeNull();
      expect(parsed.lastMessageAt).toBeNull();
      expect(parsed.disputeId).toBe('dsp-123');
      expect(parsed.closed).toBe(true);
    });

    it('rejects negative messagesCount or non-uuid id', () => {
      const basePayload = {
        id: 'not-a-uuid',
        demande: null,
        client: { id: 'c1', name: 'A', email: 'a@b.com' },
        repairer: { id: 'r1', name: 'B', email: 'b@b.com' },
        messagesCount: -1,
        lastMessage: null,
        lastMessageAt: null,
        closed: false,
        hasDispute: false,
        hasReport: false,
        createdAt: '2026-10-10T08:00:00.000Z',
      };
      expect(adminConversationSummaryItemSchema.safeParse(basePayload).success).toBe(false);
    });
  });

  describe('adminConversationMessageItemSchema', () => {
    it('validates message item with all sender roles and kinds', () => {
      const roles = ['CLIENT', 'REPAIRER', 'SYSTEM', 'ADMIN'] as const;
      const kinds = ['USER', 'SYSTEM', 'SUPPORT'] as const;

      for (const senderRole of roles) {
        for (const kind of kinds) {
          const item = {
            id: `msg-${senderRole}-${kind}`,
            senderId: senderRole === 'SYSTEM' ? null : 'usr-1',
            senderName: senderRole === 'SYSTEM' ? 'Système' : 'John Doe',
            senderRole,
            body: 'Message content',
            kind,
            photoUrl: 'https://cdn.example.com/photo.jpg',
            documentUrl: 'https://cdn.example.com/invoice.pdf',
            documentName: 'Facture.pdf',
            createdAt: '2026-10-16T12:00:00.000Z',
            deleted: false,
            deletedAt: null,
          };
          expect(adminConversationMessageItemSchema.safeParse(item).success).toBe(true);
        }
      }
    });

    it('rejects invalid senderRole or invalid kind', () => {
      const item = {
        id: 'msg-err',
        senderId: 'usr-1',
        senderName: 'John',
        senderRole: 'MODERATOR',
        body: 'Hello',
        kind: 'USER',
        createdAt: '2026-10-16T12:00:00.000Z',
        deleted: false,
      };
      expect(adminConversationMessageItemSchema.safeParse(item).success).toBe(false);
    });
  });

  describe('adminConversationDetailResponseSchema', () => {
    it('validates full thread detail including message bubbles and role attributions', () => {
      const payload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        demande: {
          id: 'dmd-1',
          title: 'Écran cassé iPhone 13',
          status: 'IN_PROGRESS',
          categoryLabel: 'Smartphones',
          budgetCents: 12000,
        },
        client: {
          id: 'usr-client',
          name: 'Alice Martin',
          email: 'alice@example.com',
          phone: '+33612345678',
          avatarUrl: 'https://cdn.example.com/alice.jpg',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
        repairer: {
          id: 'usr-rep',
          name: 'Bob Atelier',
          email: 'bob@example.com',
          phone: '+33698765432',
          companyName: 'Atelier Express',
          avatarUrl: 'https://cdn.example.com/bob.jpg',
          verified: true,
        },
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          totalCents: 12000,
          disputeId: null,
        },
        closed: false,
        closedAt: null,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-16T12:00:00.000Z',
        reportsCount: 0,
        messages: [
          {
            id: 'msg-1',
            senderId: 'usr-client',
            senderName: 'Alice Martin',
            senderRole: 'CLIENT',
            body: 'Bonjour, avez-vous la pièce en stock ?',
            kind: 'USER',
            photoUrl: null,
            documentUrl: null,
            documentName: null,
            createdAt: '2026-10-15T10:05:00.000Z',
            deleted: false,
          },
          {
            id: 'msg-2',
            senderId: 'usr-rep',
            senderName: 'Bob Atelier',
            senderRole: 'REPAIRER',
            body: 'Oui tout à fait, disponible immédiatement.',
            kind: 'USER',
            photoUrl: 'https://cdn.revime.fr/photos/part.jpg',
            documentUrl: null,
            documentName: null,
            createdAt: '2026-10-15T10:15:00.000Z',
            deleted: false,
          },
          {
            id: 'msg-3',
            senderId: null,
            senderName: 'Système',
            senderRole: 'SYSTEM',
            body: 'Commande validée par le client.',
            kind: 'SYSTEM',
            createdAt: '2026-10-15T10:30:00.000Z',
            deleted: false,
          },
          {
            id: 'msg-4',
            senderId: 'adm-1',
            senderName: 'Admin Support',
            senderRole: 'ADMIN',
            body: 'Message d intervention modération',
            kind: 'SUPPORT',
            createdAt: '2026-10-16T11:00:00.000Z',
            deleted: true,
            deletedAt: '2026-10-16T11:30:00.000Z',
          },
        ],
      };

      const parsed = adminConversationDetailResponseSchema.parse(payload);
      expect(parsed.messages).toHaveLength(4);
      expect(parsed.messages[0].senderRole).toBe('CLIENT');
      expect(parsed.messages[1].senderRole).toBe('REPAIRER');
      expect(parsed.messages[2].senderRole).toBe('SYSTEM');
      expect(parsed.messages[3].senderRole).toBe('ADMIN');
      expect(parsed.messages[3].deleted).toBe(true);
      expect(parsed.repairer.verified).toBe(true);
      expect(parsed.commande?.totalCents).toBe(12000);
    });

    it('accepts null for demande and commande', () => {
      const payload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        demande: null,
        client: {
          id: 'usr-client',
          name: 'Alice Martin',
          email: 'alice@example.com',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
        repairer: {
          id: 'usr-rep',
          name: 'Bob Atelier',
          email: 'bob@example.com',
          verified: false,
        },
        commande: null,
        closed: true,
        closedAt: '2026-10-16T14:00:00.000Z',
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-16T14:00:00.000Z',
        reportsCount: 2,
        messages: [],
      };

      const parsed = adminConversationDetailResponseSchema.parse(payload);
      expect(parsed.demande).toBeNull();
      expect(parsed.commande).toBeNull();
      expect(parsed.closed).toBe(true);
      expect(parsed.reportsCount).toBe(2);
      expect(parsed.messages).toHaveLength(0);
    });
  });

  describe('adminConversationKpisSchema & adminConversationListResponseSchema', () => {
    it('validates KPIs schema and rejects negative values', () => {
      const kpis = {
        total: 100,
        activeCount: 75,
        closedCount: 25,
        withDisputeCount: 5,
        withReportCount: 3,
      };
      expect(adminConversationKpisSchema.parse(kpis)).toEqual(kpis);
      expect(adminConversationKpisSchema.safeParse({ ...kpis, activeCount: -1 }).success).toBe(false);
    });

    it('validates list response schema', () => {
      const response = {
        total: 0,
        items: [],
        page: 1,
        limit: 20,
        kpis: {
          total: 0,
          activeCount: 0,
          closedCount: 0,
          withDisputeCount: 0,
          withReportCount: 0,
        },
      };
      expect(adminConversationListResponseSchema.safeParse(response).success).toBe(true);
    });
  });

  describe('Audit Actions Mapping', () => {
    it('maps conversation.close and conversation.reopen audit actions', () => {
      expect(adminAuditActionSchema.safeParse('conversation.close').success).toBe(true);
      expect(adminAuditActionSchema.safeParse('conversation.reopen').success).toBe(true);
      expect(ADMIN_AUDIT_ACTION_LABEL['conversation.close']).toBe('Clôture modération conversation');
      expect(ADMIN_AUDIT_ACTION_LABEL['conversation.reopen']).toBe('Réouverture conversation');
    });
  });
});
