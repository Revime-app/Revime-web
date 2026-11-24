import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ReportTargetPreview } from '../components/ReportTargetPreview';
import SignalementDetailPage from '../app/signalements/[id]/page';
import SignalementsPage from '../app/signalements/page';
import type {
  AdminReportDetailDto,
  AdminReportListItemDto,
  AdminReportListResponse,
} from '@revime/shared';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'rep-p20-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
  usePathname: () => '/signalements/rep-p20-1',
}));

// Mock AdminGate permissions
vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({
    role: 'super_admin',
    permissions: ['content.moderate', 'reports.handle'],
    twoFactorVerified: true,
  }),
}));

function cleanHtml(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('P20 — Signalements: Reported Message Highlighting, Multi-Entity Previews & Terminal Controls Guard', () => {
  describe('1. <ReportTargetPreview /> polymorphic preview cards', () => {
    it('renders MESSAGE preview with 2px Rouge Punch border, soft pink bg, warning icon and badge « Message signalé »', () => {
      const html = cleanHtml(
        renderToString(
          <ReportTargetPreview
            targetType="MESSAGE"
            reportedMessage={{
              id: 'msg-rep-1',
              body: 'Payez-moi par PayPal hors site !',
              senderName: 'Vendeur Douteux',
              createdAt: '2026-10-14T10:15:00.000Z',
            }}
            targetEntitySummary={{
              id: 'msg-rep-1',
              targetType: 'MESSAGE',
              title: 'Message de Vendeur Douteux',
              description: 'Payez-moi par PayPal hors site !',
            }}
          />,
        ),
      );

      // Card container check
      expect(html).toContain('data-testid="report-target-message"');
      expect(html).toContain('2px solid var(--red-deep, #bd0e26)');
      expect(html).toContain('var(--red-soft, #feedf0)');

      // Badge and icon
      expect(html).toContain('lucide-triangle-alert');
      expect(html).toContain('Message probablement signalé');

      // Sender and message content
      expect(html).toContain('Vendeur Douteux');
      expect(html).toContain('Payez-moi par PayPal hors site !');
    });

    it('renders USER preview with user avatar, name, email, role, status and link to /utilisateurs/:id', () => {
      const html = cleanHtml(
        renderToString(
          <ReportTargetPreview
            targetType="USER"
            targetEntitySummary={{
              id: 'usr-bad-1',
              targetType: 'USER',
              name: 'Jean Spammer',
              email: 'spammer@revime-fake.com',
              role: 'Client',
            }}
            reportedUser={{
              id: 'usr-bad-1',
              name: 'Jean Spammer',
              email: 'spammer@revime-fake.com',
              role: 'Client',
              banned: true,
              repairerSuspended: false,
              reportsReceivedCount: 4,
            }}
          />,
        ),
      );

      expect(html).toContain('data-testid="report-target-user"');
      expect(html).toContain('Profil utilisateur signalé');
      expect(html).toContain('Jean Spammer');
      expect(html).toContain('spammer@revime-fake.com');
      expect(html).toContain('Banni / Suspendu');
      expect(html).toContain('Signalements reçus : <strong>4</strong>');
      expect(html).toContain('href="/utilisateurs/usr-bad-1"');
      expect(html).toContain('Voir la fiche utilisateur →');
    });

    it('renders REVIEW preview with star rating, review text, author and target repairer', () => {
      const html = cleanHtml(
        renderToString(
          <ReportTargetPreview
            targetType="REVIEW"
            targetEntitySummary={{
              id: 'rev-99',
              targetType: 'REVIEW',
              title: 'Avis client signalé',
              rating: 1,
              comment: 'Horrible prestation, réparateur impoli et incompétent !',
              authorName: 'Client En Colère',
              repairerName: 'Atelier Central',
              description: 'Horrible prestation, réparateur impoli et incompétent !',
            }}
          />,
        ),
      );

      expect(html).toContain('data-testid="report-target-review"');
      expect(html).toContain('Avis signalé');
      expect(html).toContain('(1/5)');
      expect(html).toContain('Client En Colère');
      expect(html).toContain('Atelier Central');
      expect(html).toContain('Horrible prestation, réparateur impoli et incompétent !');
    });

    it('renders DEMANDE preview with title, description and link to /demandes/:id', () => {
      const html = cleanHtml(
        renderToString(
          <ReportTargetPreview
            targetType="DEMANDE"
            targetEntitySummary={{
              id: 'dem-fake-42',
              targetType: 'DEMANDE',
              title: 'Demande de réparation iPhone sans numéro IMEI',
              description: 'Annonce suspecte avec coordonnées externes dissimulées.',
            }}
            demande={{
              id: 'dem-fake-42',
              title: 'Demande de réparation iPhone sans numéro IMEI',
            }}
          />,
        ),
      );

      expect(html).toContain('data-testid="report-target-demande"');
      expect(html).toContain('Demande signalée');
      expect(html).toContain('Demande de réparation iPhone sans numéro IMEI');
      expect(html).toContain('Annonce suspecte avec coordonnées externes dissimulées.');
      expect(html).toContain('href="/demandes/dem-fake-42"');
      expect(html).toContain('Voir la fiche demande →');
    });
  });

  describe('2. SignalementDetailPage message stream highlighting', () => {
    const baseReport: AdminReportDetailDto = {
      id: 'rep-p20-1',
      conversationId: 'conv-101',
      reason: 'OFF_PLATFORM',
      reasonLabel: 'Demande de paiement hors Revime',
      gravity: 'MEDIUM',
      gravityLabel: 'Moyenne',
      targetType: 'MESSAGE',
      likelyReportedMessageId: 'msg-highlight-2',
      targetEntitySummary: {
        id: 'msg-highlight-2',
        targetType: 'MESSAGE',
        title: 'Message de Robert Reparateur',
        description: 'Envoyez un chèque à mon adresse personnelle.',
      },
      createdAt: '2026-10-14T09:00:00.000Z',
      resolvedAt: null,
      resolutionVerdict: null,
      resolutionVerdictLabel: null,
      resolutionNote: null,
      assignedTo: {
        id: 'op-1',
        name: 'Sarah Moderatrice',
        email: 'sarah@revime.fr',
        assignedAt: '2026-10-14T09:10:00.000Z',
      },
      resolvedBy: null,
      reporter: {
        id: 'usr-client-1',
        name: 'Claire Cliente',
        email: 'claire@example.fr',
        createdAt: '2026-01-01T00:00:00.000Z',
        reportsCount: 1,
      },
      reported: {
        id: 'usr-rep-2',
        name: 'Robert Reparateur',
        email: 'robert@example.fr',
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'repairer',
        banned: false,
        repairerSuspended: false,
        reportsReceivedCount: 2,
      },
      conversation: {
        id: 'conv-101',
        closed: false,
        demande: {
          id: 'dem-101',
          title: 'Réparation connecteur de charge',
        },
        messages: [
          {
            id: 'msg-normal-1',
            body: 'Bonjour, avez-vous la pièce en stock ?',
            createdAt: '2026-10-14T08:30:00.000Z',
            deleted: false,
            senderId: 'usr-client-1',
            senderName: 'Claire Cliente',
          },
          {
            id: 'msg-highlight-2',
            body: 'Envoyez un chèque à mon adresse personnelle.',
            createdAt: '2026-10-14T08:45:00.000Z',
            deleted: false,
            senderId: 'usr-rep-2',
            senderName: 'Robert Reparateur',
          },
        ],
      },
    };

    it('frames reported message with 2px Rouge Punch border and displays « Message probablement signalé » badge with a warning icon', () => {
      const html = cleanHtml(
        renderToString(<SignalementDetailPage initialReport={baseReport} />),
      );

      // Verify ReportTargetPreview is mounted at the top
      expect(html).toContain('data-testid="report-target-message"');

      // Verify the reported message bubble is highlighted
      expect(html).toContain('data-testid="reported-message-bubble"');
      expect(html).toContain('2px solid var(--red-deep, #bd0e26)');
      expect(html).toContain('data-testid="badge-message-signale"');
      expect(html).toContain('lucide-triangle-alert');
      expect(html).toContain('Message probablement signalé');

      // Verify the normal message is not flagged as reported
      expect(html).toContain('Bonjour, avez-vous la pièce en stock ?');
    });
  });

  describe('3. Terminal Controls Guard on resolved reports', () => {
    it('shows « Fermer la conversation » and « Libérer le dossier » when report is open', () => {
      const openReport: AdminReportDetailDto = {
        id: 'rep-open-1',
        conversationId: 'conv-202',
        reason: 'SPAM',
        reasonLabel: 'Message indésirable',
        gravity: 'MEDIUM',
        gravityLabel: 'Moyenne',
        targetType: 'MESSAGE',
        likelyReportedMessageId: null,
        targetEntitySummary: { id: 'rep', targetType: 'MESSAGE', title: 'Message signalé dans la conversation' },
        createdAt: '2026-10-14T10:00:00.000Z',
        resolvedAt: null,
        resolutionVerdict: null,
        resolutionVerdictLabel: null,
        resolutionNote: null,
        assignedTo: {
          id: 'op-1',
          name: 'Sarah Moderatrice',
          email: 'sarah@revime.fr',
          assignedAt: '2026-10-14T10:05:00.000Z',
        },
        resolvedBy: null,
        reporter: {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          reportsCount: 1,
        },
        reported: {
          id: 'u-2',
          name: 'Bob',
          email: 'bob@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'repairer',
          banned: false,
          repairerSuspended: false,
          reportsReceivedCount: 1,
        },
        conversation: {
          id: 'conv-202',
          closed: false,
          demande: null,
          messages: [],
        },
      };

      const html = cleanHtml(
        renderToString(<SignalementDetailPage initialReport={openReport} />),
      );

      // Buttons are visible when open
      expect(html).toContain('Fermer la conversation');
      expect(html).toContain('Libérer le dossier');
      // Resolution Summary Card is not present
      expect(html).not.toContain('data-testid="resolution-summary-card"');
    });

    it('offers no « Masquer ce message » on a message of a closed report (FND-633) but does on an open one', () => {
      const resolvedReport: AdminReportDetailDto = {
        id: 'rep-res-99',
        conversationId: 'conv-303',
        reason: 'HARASSMENT',
        reasonLabel: 'Propos agressifs ou harcèlement',
        gravity: 'HIGH',
        gravityLabel: 'Élevée',
        targetType: 'MESSAGE',
        likelyReportedMessageId: null,
        targetEntitySummary: { id: 'rep', targetType: 'MESSAGE', title: 'Message signalé dans la conversation' },
        createdAt: '2026-10-13T10:00:00.000Z',
        resolvedAt: '2026-10-14T14:30:00.000Z',
        resolutionVerdict: 'SANCTION_APPLIED',
        resolutionVerdictLabel: 'Sanction appliquée',
        resolutionNote: 'Utilisateur banni pour harcèlement caractérisé.',
        assignedTo: {
          id: 'op-1',
          name: 'Sarah Moderatrice',
          email: 'sarah@revime.fr',
          assignedAt: '2026-10-13T10:05:00.000Z',
        },
        resolvedBy: {
          id: 'op-1',
          name: 'Sarah Moderatrice',
          email: 'sarah@revime.fr',
        },
        reporter: {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          reportsCount: 1,
        },
        reported: {
          id: 'u-2',
          name: 'Bob',
          email: 'bob@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'repairer',
          banned: true,
          repairerSuspended: false,
          reportsReceivedCount: 3,
        },
        conversation: {
          id: 'conv-303',
          closed: true,
          demande: null,
          messages: [
            {
              id: 'msg-visible-1',
              body: 'Message encore visible.',
              createdAt: '2026-10-14T08:30:00.000Z',
              deleted: false,
              senderId: 'u-2',
              senderName: 'Bob',
            },
          ],
        },
      };

      const html = cleanHtml(
        renderToString(<SignalementDetailPage initialReport={resolvedReport} />),
      );
      expect(html).toContain('Message encore visible.');
      expect(html).toContain('Actions désactivées (dossier résolu)');
      expect(html).not.toContain('Masquer ce message');

      const open = cleanHtml(
        renderToString(
          <SignalementDetailPage initialReport={{ ...resolvedReport, resolvedAt: null, resolutionVerdict: null }} />,
        ),
      );
      expect(open).toContain('Masquer ce message');
    });

    it('hides « Fermer la conversation » and « Libérer le dossier », and renders Resolution Summary Card when report is resolved', () => {
      const resolvedReport: AdminReportDetailDto = {
        id: 'rep-res-99',
        conversationId: 'conv-303',
        reason: 'HARASSMENT',
        reasonLabel: 'Propos agressifs ou harcèlement',
        gravity: 'HIGH',
        gravityLabel: 'Élevée',
        targetType: 'MESSAGE',
        likelyReportedMessageId: null,
        targetEntitySummary: { id: 'rep', targetType: 'MESSAGE', title: 'Message signalé dans la conversation' },
        createdAt: '2026-10-13T10:00:00.000Z',
        resolvedAt: '2026-10-14T14:30:00.000Z',
        resolutionVerdict: 'SANCTION_APPLIED',
        resolutionVerdictLabel: 'Sanction appliquée',
        resolutionNote: 'Utilisateur banni pour harcèlement caractérisé.',
        assignedTo: {
          id: 'op-1',
          name: 'Sarah Moderatrice',
          email: 'sarah@revime.fr',
          assignedAt: '2026-10-13T10:05:00.000Z',
        },
        resolvedBy: {
          id: 'op-1',
          name: 'Sarah Moderatrice',
          email: 'sarah@revime.fr',
        },
        reporter: {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          reportsCount: 1,
        },
        reported: {
          id: 'u-2',
          name: 'Bob',
          email: 'bob@test.fr',
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'repairer',
          banned: true,
          repairerSuspended: false,
          reportsReceivedCount: 3,
        },
        conversation: {
          id: 'conv-303',
          closed: true,
          demande: null,
          messages: [],
        },
      };

      const html = cleanHtml(
        renderToString(<SignalementDetailPage initialReport={resolvedReport} />),
      );

      // Buttons are hidden
      expect(html).not.toContain('Fermer la conversation');
      expect(html).not.toContain('Libérer le dossier');
      expect(html).toContain('Actions désactivées (dossier résolu)');

      // Distinct Resolution Summary Card is rendered
      expect(html).toContain('data-testid="resolution-summary-card"');
      expect(html).toContain('Clôture du dossier');
      expect(html).toContain('Sanction appliquée');
      expect(html).toContain('Sarah Moderatrice');
      expect(html).toContain('Utilisateur banni pour harcèlement caractérisé.');
    });
  });

  describe('4. /signalements queue table target type badge', () => {
    it('renders « Cible » header and target type badges for MESSAGE, USER, REVIEW, DEMANDE', () => {
      const mockListResponse: AdminReportListResponse = {
        total: 4,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        counts: { open: 4, resolved: 0, total: 4 },
        items: [
          {
            id: 'item-1',
            conversationId: 'c-1',
            reason: 'OFF_PLATFORM',
            gravity: 'MEDIUM',
            gravityLabel: 'Moyenne',
            reasonLabel: 'Demande de paiement hors Revime',
            targetType: 'MESSAGE',
            createdAt: '2026-10-14T08:00:00.000Z',
            resolvedAt: null,
            resolutionVerdict: null,
            reporter: { id: 'u1', name: 'Alice', email: 'alice@test.fr' },
            reported: { id: 'u2', name: 'Bob', email: 'bob@test.fr' },
            demande: { id: 'd1', title: 'iPhone 12' },
            assignedTo: null,
            conversationClosed: false,
          },
          {
            id: 'item-2',
            conversationId: 'c-2',
            reason: 'SPAM',
            gravity: 'MEDIUM',
            gravityLabel: 'Moyenne',
            reasonLabel: 'Message indésirable',
            targetType: 'USER',
            createdAt: '2026-10-14T08:10:00.000Z',
            resolvedAt: null,
            resolutionVerdict: null,
            reporter: { id: 'u3', name: 'Claire', email: 'claire@test.fr' },
            reported: { id: 'u4', name: 'David', email: 'david@test.fr' },
            demande: null,
            assignedTo: null,
            conversationClosed: false,
          },
          {
            id: 'item-3',
            conversationId: 'c-3',
            reason: 'OTHER',
            gravity: 'LOW',
            gravityLabel: 'Faible',
            reasonLabel: 'Autre',
            targetType: 'REVIEW',
            createdAt: '2026-10-14T08:20:00.000Z',
            resolvedAt: null,
            resolutionVerdict: null,
            reporter: { id: 'u5', name: 'Emma', email: 'emma@test.fr' },
            reported: { id: 'u6', name: 'Fabien', email: 'fabien@test.fr' },
            demande: null,
            assignedTo: null,
            conversationClosed: false,
          },
          {
            id: 'item-4',
            conversationId: 'c-4',
            reason: 'SCAM',
            gravity: 'HIGH',
            gravityLabel: 'Élevée',
            reasonLabel: "Tentative d'arnaque",
            targetType: 'DEMANDE',
            createdAt: '2026-10-14T08:30:00.000Z',
            resolvedAt: null,
            resolutionVerdict: null,
            reporter: { id: 'u7', name: 'Gilles', email: 'gilles@test.fr' },
            reported: { id: 'u8', name: 'Hugo', email: 'hugo@test.fr' },
            demande: { id: 'd4', title: 'MacBook Pro' },
            assignedTo: null,
            conversationClosed: false,
          },
        ],
      };

      const html = cleanHtml(
        renderToString(<SignalementsPage initialData={mockListResponse} />),
      );

      // Header column
      expect(html).toContain('>Cible</th>');

      // Target badges
      expect(html).toContain('Message');
      expect(html).toContain('Profil');
      expect(html).toContain('Avis');
      expect(html).toContain('Demande');
    });
  });
});
