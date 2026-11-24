import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENUINE_COLLECTED_COMMANDE_WHERE } from '../src/admin/admin-constants.js';
import { AdminUsersService } from '../src/admin/admin-users.service.js';
import { AppException } from '../src/common/app-exception.js';
import { __setMailSender } from '../src/mail/mail.service.js';

// `auth.ts` builds the whole Better Auth instance when loaded; the service imports it lazily and
// only to ask for the reset e-mail, which is what these specs pin.
const requestPasswordReset = vi.hoisted(() => vi.fn());
vi.mock('../src/auth/auth.js', () => ({ auth: { api: { requestPasswordReset } } }));

describe('AdminUsersService - P6 Fiche Operations, Notes, and Tabulated Data', () => {
  let prisma: any;
  let service: AdminUsersService;
  let sentMails: Array<{ to: string; subject: string; text: string; html?: string }>;

  beforeEach(() => {
    sentMails = [];
    requestPasswordReset.mockReset();
    __setMailSender({
      send: async (mail) => {
        sentMails.push(mail);
      },
    });

    prisma = {
      $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      demande: {
        count: vi.fn().mockResolvedValue(5),
        findMany: vi.fn().mockResolvedValue([]),
      },
      commande: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([]),
        // What he paid (client side, order total) and what he earned (his side, his quote).
        aggregate: vi.fn().mockImplementation(({ where }: { where: { clientUserId?: string } }) =>
          Promise.resolve(where.clientUserId ? { _sum: { totalCents: 45000 } } : { _sum: { repairCents: 30000 } }),
        ),
      },
      review: {
        count: vi.fn().mockResolvedValue(8),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({
          _avg: { rating: 4.8 },
          _count: { id: 8 },
        }),
      },
      dispute: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([]),
      },
      conversationReport: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([]),
      },
      offer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      // V7 U2: the « Blocage de connexion » block.
      authThrottle: { findMany: vi.fn().mockResolvedValue([]) },
      authLockEvent: { findMany: vi.fn().mockResolvedValue([]) },
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
    };

    service = new AdminUsersService(prisma, { repairerBlock: vi.fn().mockResolvedValue(null) } as never, {} as never);
  });

  describe('detail() with summary KPIs and 7 tabs', () => {
    it('returns calculated summary KPIs, internal notes and tabsData', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Marie Dupont',
        firstName: 'Marie',
        lastName: 'Dupont',
        username: 'maried',
        email: 'marie@example.com',
        emailVerified: true,
        phone: '+33612345678',
        phoneVerifiedAt: new Date('2026-01-01'),
        role: 'user',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        banned: false,
        banReason: null,
        banExpires: null,
        profile: {
          deletedAt: null,
          clientEnabled: true,
          repairerEnabled: true,
          activeMode: 'CLIENT',
          verificationLevel: 'BASIC',
        },
        identityVerification: null,
      });

      // Mock internal notes in adminAuditLog
      prisma.adminAuditLog.findMany.mockImplementation(({ where }: { where: { action?: string } }) => {
        if (where?.action === 'user.note_add') {
          return Promise.resolve([
            {
              id: 'note-1',
              actorEmail: 'admin@revime.fr',
              createdAt: new Date('2026-09-10T12:00:00.000Z'),
              detail: {
                content: 'Utilisateur fiable.',
                authorName: 'Admin Sarah',
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      // Mock orders in commande.findMany
      prisma.commande.findMany.mockResolvedValue([
        {
          id: 'cmd-1',
          clientUserId: 'user-1',
          repairerUserId: 'other-rep',
          totalCents: 12000,
          status: 'PAID',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          demande: { title: 'Écran iPhone 12' },
        },
      ]);

      // Mock disputes in dispute.findMany
      prisma.dispute.findMany.mockResolvedValue([
        {
          id: 'disp-1',
          number: 101,
          commandeId: 'cmd-1',
          status: 'OPEN',
          verdict: null,
          reason: 'Pièce non conforme',
          createdAt: new Date('2026-09-02T10:00:00.000Z'),
          commande: { status: 'PAID', totalCents: 6500, refundedCents: null },
        },
        {
          id: 'disp-2',
          number: 102,
          commandeId: 'cmd-2',
          status: 'OPEN',
          verdict: null,
          reason: 'Écran toujours cassé',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          commande: { status: 'REFUNDED', totalCents: 6500, refundedCents: 6500 },
        },
      ]);

      // Mock reviews in review.findMany
      prisma.review.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          rating: 5,
          comment: 'Super réparation !',
          repairerUserId: 'user-1',
          createdAt: new Date('2026-09-03T10:00:00.000Z'),
        },
      ]);

      // Mock reports in conversationReport.findMany
      prisma.conversationReport.findMany.mockResolvedValue([
        {
          id: 'rep-1',
          conversationId: 'conv-1',
          reportedUserId: 'user-1',
          reason: 'Spam répété',
          createdAt: new Date('2026-09-04T10:00:00.000Z'),
          resolvedAt: null,
        },
      ]);

      // Mock sessions
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Chrome/120',
        },
      ]);

      const res = await service.detail('user-1');

      expect(res.userId).toBe('user-1');
      expect(prisma.commande.aggregate).toHaveBeenCalledWith({
        where: { ...GENUINE_COLLECTED_COMMANDE_WHERE, clientUserId: 'user-1', status: 'PAID' },
        _sum: { totalCents: true },
      });
      expect(prisma.commande.aggregate).toHaveBeenCalledWith({
        where: { ...GENUINE_COLLECTED_COMMANDE_WHERE, repairerUserId: 'user-1', status: 'PAID', step: 'RELEASED' },
        _sum: { repairCents: true },
      });
      expect(res.summaryKpis).toEqual({
        demandesCount: 5,
        repairsCompletedCount: 6, // 3 + 3
        totalSpentCents: 45000,
        totalRevenueCents: 30000,
        averageRating: 4.8,
        reviewCount: 8,
        disputesCount: 1,
        reportsCount: 2,
      });

      expect(res.internalNotes).toHaveLength(1);
      expect(res.internalNotes[0]).toEqual({
        id: 'note-1',
        authorName: 'Admin Sarah',
        authorEmail: 'admin@revime.fr',
        content: 'Utilisateur fiable.',
        createdAt: '2026-09-10T12:00:00.000Z',
      });

      expect(res.tabsData).toBeDefined();
      expect(res.tabsData?.orders).toHaveLength(1);
      expect(res.tabsData!.orders[0]!.role).toBe('CLIENT');
      expect(res.tabsData!.orders[0]!.title).toBe('Écran iPhone 12');

      expect(res.tabsData?.disputes).toHaveLength(2);
      expect(res.tabsData!.disputes[0]!.number).toBe(101);
      // The first commande is not refunded: the stored status stands.
      expect(res.tabsData!.disputes[0]!.status).toBe('OPEN');
      // ISS-085 / B11: the second is on a refunded order, so it reads resolved, like the list.
      expect(res.tabsData!.disputes[1]!.status).toBe('RESOLVED_REFUNDED');

      expect(res.tabsData?.reviews).toHaveLength(1);
      expect(res.tabsData!.reviews[0]!.role).toBe('RECEIVED');

      expect(res.tabsData?.reports).toHaveLength(1);
      expect(res.tabsData!.reports[0]!.role).toBe('AGAINST');

      expect(res.tabsData?.sessions).toHaveLength(1);
      expect(res.tabsData!.sessions[0]!.ipAddress).toBe('192.168.1.1');
    });

    it('deduplicates duplicate audit log notes with identical content from same author', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dup',
        name: 'Test Dup',
        email: 'dup@example.com',
        createdAt: new Date('2026-01-01'),
        profile: { deletedAt: null },
      });

      // Two identical notes within 2 seconds
      prisma.adminAuditLog.findMany.mockResolvedValue([
        {
          id: 'note-1',
          actorEmail: 'admin@revime.fr',
          createdAt: new Date('2026-09-10T12:00:00.000Z'),
          detail: { content: 'Duplicate note', authorName: 'Admin' },
        },
        {
          id: 'note-2',
          actorEmail: 'admin@revime.fr',
          createdAt: new Date('2026-09-10T12:00:01.000Z'),
          detail: { content: 'Duplicate note', authorName: 'Admin' },
        },
      ]);

      const res = await service.detail('user-dup');
      expect(res.internalNotes).toHaveLength(1);
      expect(res.internalNotes[0]!.content).toBe('Duplicate note');
    });
  });

  describe('addInternalNote()', () => {
    it('validates target user existence and succeeds', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      const result = await service.addInternalNote('user-1');

      expect(result).toEqual({ ok: true });
    });

    it('throws NOT_FOUND if target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addInternalNote('unknown-user'),
      ).rejects.toThrow();
    });
  });

  describe('sendUserEmail()', () => {
    it('sends email to user via mailSender', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'client@example.com',
        name: 'Client Test',
        profile: { deletedAt: null },
      });

      const result = await service.sendUserEmail('user-1', {
        subject: 'Mise à jour de votre compte',
        message: 'Bonjour, merci de confirmer votre adresse.',
      });

      expect(result).toEqual({ ok: true });
      expect(sentMails).toHaveLength(1);
      expect(sentMails[0]).toMatchObject({
        to: 'client@example.com',
        subject: 'Mise à jour de votre compte',
        text: 'Bonjour, merci de confirmer votre adresse.',
      });
    });

    it('throws NOT_FOUND if target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.sendUserEmail('unknown', {
          subject: 'Test',
          message: 'Hello world',
        }),
      ).rejects.toThrow();
    });

    it('throws UNPROCESSABLE_ENTITY when user is soft-deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-del',
        email: 'deleted@example.com',
        name: 'Deleted User',
        profile: { deletedAt: new Date() },
      });

      await expect(
        service.sendUserEmail('user-del', {
          subject: 'Test',
          message: 'Hello',
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce compte est supprimé.',
      });
    });
  });

  describe('resetPassword()', () => {
    it("asks Better Auth for the reset e-mail, so the link carries a single-use token", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'client@example.com',
        profile: { deletedAt: null },
      });

      const result = await service.resetPassword('user-1');

      expect(result).toEqual({ ok: true });
      // The mobile « Mot de passe oublié » makes the same request; a link the service built by hand
      // carried only the user id and opened nothing.
      expect(requestPasswordReset).toHaveBeenCalledWith({
        body: { email: 'client@example.com', redirectTo: 'revime://reset-password' },
      });
      expect(sentMails).toHaveLength(0);
    });

    it('refuses reset password for soft-deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-del',
        email: 'deleted@example.com',
        name: 'Deleted User',
        profile: { deletedAt: new Date() },
      });

      await expect(
        service.resetPassword('user-del'),
      ).rejects.toThrow();
      expect(requestPasswordReset).not.toHaveBeenCalled();
    });
  });
});
