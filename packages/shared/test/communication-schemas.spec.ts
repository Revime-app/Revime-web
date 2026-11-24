import { describe, it, expect } from 'vitest';
import {
  broadcastTargetSchema,
  adminBroadcastSendSchema,
  adminBroadcastPreviewSchema,
  adminBroadcastItemSchema,
  adminBroadcastHistoryResponseSchema,
  type AdminBroadcastPreview,
  type AdminBroadcastItem,
  type AdminBroadcastHistoryResponse,
  type AdminBroadcastSendInput,
  type BroadcastTarget,
} from '../src/communication.schemas.js';

describe('Communication Schemas (@revime/shared)', () => {
  describe('broadcastTargetSchema', () => {
    it('validates a valid individual target', () => {
      const target = {
        type: 'INDIVIDUAL',
        userId: '2c53de51-b157-430a-9d90-349f481a539b',
      };
      const parsed = broadcastTargetSchema.parse(target);
      expect(parsed).toEqual(target);
    });

    it('validates a valid segment target with defaults', () => {
      const target = {
        type: 'SEGMENT',
        role: 'REPAIRER',
        city: 'Lyon',
        department: '69',
      };
      const parsed = broadcastTargetSchema.parse(target);
      expect(parsed).toEqual({
        type: 'SEGMENT',
        role: 'REPAIRER',
        city: 'Lyon',
        department: '69',
        verifiedOnly: false,
        activeOnly: true,
      });
    });

    it('accepts a real Better Auth user id (32 characters, not a UUID)', () => {
      const target = { type: 'INDIVIDUAL', userId: 'e2xRd3VFq9ZkT1mNpLw8YbHc4sJaUo6G' };
      expect(broadcastTargetSchema.parse(target)).toEqual(target);
    });

    it('rejects an empty or malformed id in individual target', () => {
      for (const userId of ['', '   ', 'abcd efgh ijkl', '../../etc/passwd', 'abc$(whoami)xyz', 'x'.repeat(200)]) {
        expect(() => broadcastTargetSchema.parse({ type: 'INDIVIDUAL', userId })).toThrow();
      }
    });

    it('validates segment defaults when fields are omitted', () => {
      const parsed = broadcastTargetSchema.parse({ type: 'SEGMENT' });
      expect(parsed).toEqual({
        type: 'SEGMENT',
        role: 'ALL',
        verifiedOnly: false,
        activeOnly: true,
      });
    });
  });

  describe('adminBroadcastSendSchema', () => {
    it('validates valid send payload with both channels', () => {
      const input = {
        target: { type: 'SEGMENT', role: 'ALL' },
        channels: { email: true, push: true },
        templateKey: 'ANNOUNCEMENT',
        subject: 'Maintenance de la plateforme',
        body: 'Bonjour {{prenom}}, une maintenance aura lieu ce soir.',
      };
      const parsed = adminBroadcastSendSchema.parse(input);
      expect(parsed.subject).toBe('Maintenance de la plateforme');
    });

    it('rejects payload when neither email nor push is selected', () => {
      const input = {
        target: { type: 'SEGMENT', role: 'ALL' },
        channels: { email: false, push: false },
        templateKey: 'CUSTOM',
        subject: 'Annonce',
        body: 'Ceci est un test de message.',
      };
      expect(() => adminBroadcastSendSchema.parse(input)).toThrow(
        /Au moins un canal de diffusion/
      );
    });

    it('rejects subjects shorter than 3 characters or empty body', () => {
      expect(() =>
        adminBroadcastSendSchema.parse({
          target: { type: 'SEGMENT', role: 'ALL' },
          channels: { email: true, push: false },
          templateKey: 'CUSTOM',
          subject: 'Hi',
          body: 'Short',
        })
      ).toThrow();
    });

    it('defaults templateKey to CUSTOM', () => {
      const input = {
        target: { type: 'SEGMENT' },
        channels: { email: true, push: false },
        subject: 'Mise à jour importante',
        body: 'Bonjour à tous, une mise à jour est en ligne.',
      };
      const parsed = adminBroadcastSendSchema.parse(input);
      expect(parsed.templateKey).toBe('CUSTOM');
    });
  });

  describe('adminBroadcastPreviewSchema', () => {
    it('validates a valid preview object', () => {
      const preview: AdminBroadcastPreview = {
        totalRecipients: 42,
        emailEligibleCount: 40,
        pushEligibleCount: 25,
        sampleRecipients: [
          {
            id: '2c53de51-b157-430a-9d90-349f481a539b',
            name: 'Jean Dupont',
            email: 'jean@example.com',
            city: 'Paris',
            role: 'CLIENT',
          },
          {
            id: '9b2c349f-b157-430a-9d90-2c53de51539b',
            name: 'Alice Réparateur',
            email: 'alice@example.com',
            city: null,
            role: 'REPAIRER',
          },
        ],
      };
      const parsed = adminBroadcastPreviewSchema.parse(preview);
      expect(parsed.totalRecipients).toBe(42);
      expect(parsed.sampleRecipients).toHaveLength(2);
    });

    it('rejects negative recipient counts', () => {
      expect(() =>
        adminBroadcastPreviewSchema.parse({
          totalRecipients: -1,
          emailEligibleCount: 0,
          pushEligibleCount: 0,
          sampleRecipients: [],
        })
      ).toThrow();
    });
  });

  describe('adminBroadcastItemSchema & adminBroadcastHistoryResponseSchema', () => {
    it('validates broadcast item and history response structure', () => {
      const item: AdminBroadcastItem = {
        id: 'bc-12345',
        subject: 'Annonce importante',
        channelEmail: true,
        channelPush: false,
        targetType: 'SEGMENT',
        targetSummary: 'Réparateurs vérifiés - Lyon (69)',
        totalRecipients: 15,
        sentEmailCount: 15,
        sentPushCount: 0,
        operatorName: 'Super Admin',
        createdAt: '2026-10-16T10:00:00.000Z',
      };

      const parsedItem = adminBroadcastItemSchema.parse(item);
      expect(parsedItem.id).toBe('bc-12345');

      const history: AdminBroadcastHistoryResponse = {
        items: [item],
        total: 1,
      };

      const parsedHistory = adminBroadcastHistoryResponseSchema.parse(history);
      expect(parsedHistory.total).toBe(1);
      expect(parsedHistory.items[0]?.subject).toBe('Annonce importante');
    });
  });
});
