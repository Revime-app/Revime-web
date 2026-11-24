import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  AdminUserSummaryKpis,
  AdminUserDetail,
  AdminUserActivityEntry,
  AdminUserInternalNote,
  AdminRepairerBlock,
} from '@revime/shared';
import { UserSummaryKpis } from '../components/UserSummaryKpis';
import { UserDetailTabs } from '../components/UserDetailTabs';
import { UserInternalNotes } from '../components/UserInternalNotes';
import { SendUserEmailModal } from '../components/SendUserEmailModal';
import { DeleteUserDoubleConfirmModal } from '../components/DeleteUserDoubleConfirmModal';
import { RepairerBlock } from '../components/RepairerBlock';

describe('P6: User Detail Tabs, Summary KPIs, Notes and Administrative Actions', () => {
  describe('UserSummaryKpis', () => {
    it('renders all 6 KPI cards with formatted values and star rating', () => {
      const kpis: AdminUserSummaryKpis = {
        demandesCount: 12,
        repairsCompletedCount: 8,
        totalSpentCents: 45000,
        totalRevenueCents: 125000,
        averageRating: 4.8,
        reviewCount: 15,
        disputesCount: 2,
        reportsCount: 1,
      };

      const html = renderToString(<UserSummaryKpis kpis={kpis} />);

      expect(html).toContain('Demandes');
      expect(html).toContain('12');
      expect(html).toContain('Réparations');
      expect(html).toContain('8');
      expect(html).toContain("Chiffre d&#x27;affaires");
      expect(html).toContain('1\u202f250,00\u00a0€');
      expect(html).toContain('Note moyenne');
      expect(html).toContain('lucide-star');
      expect(html.replace(/<!-- -->/g, '')).toContain('4.8 (15)');
      expect(html).toContain('Litiges');
      expect(html).toContain('2');
      expect(html).toContain('Signalements');
      expect(html).toContain('1');
    });

    it('renders dash placeholder when averageRating is null and safe if kpis is undefined', () => {
      const kpis: AdminUserSummaryKpis = {
        demandesCount: 0,
        repairsCompletedCount: 0,
        totalSpentCents: 0,
        totalRevenueCents: 0,
        averageRating: null,
        reviewCount: 0,
        disputesCount: 0,
        reportsCount: 0,
      };

      const html = renderToString(<UserSummaryKpis kpis={kpis} />);
      expect(html).toContain('—');

      const emptyHtml = renderToString(<UserSummaryKpis kpis={undefined} />);
      expect(emptyHtml).toBe('');
    });
  });

  describe('UserDetailTabs', () => {
    const mockHistory: AdminUserActivityEntry[] = [
      {
        id: 'act-1',
        at: '2026-10-10T12:00:00.000Z',
        kind: 'demande',
        label: 'Création de la demande d-123',
      },
      {
        id: 'act-2',
        at: '2026-10-11T14:30:00.000Z',
        kind: 'admin',
        action: 'user.note_add',
        label: 'Ajout de note interne',
        actorEmail: 'admin@revime.fr',
      },
    ];

    const mockTabsData: NonNullable<AdminUserDetail['tabsData']> = {
      orders: [
        {
          id: 'ord-1',
          role: 'CLIENT',
          title: 'Réparation écran iPhone 13',
          totalCents: 8900,
          status: 'COMPLETED',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          id: 'ord-2',
          role: 'REPAIRER',
          title: 'Changement batterie Samsung S21',
          totalCents: 5500,
          status: 'IN_PROGRESS',
          createdAt: '2026-10-05T15:00:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          commandeId: 'ord-1',
          amountCents: 8900,
          status: 'SUCCEEDED',
          createdAt: '2026-10-01T10:05:00.000Z',
        },
      ],
      disputes: [
        {
          id: 'disp-1',
          number: 104,
          commandeId: 'ord-1',
          status: 'OPEN',
          reason: 'Écran non conforme',
          createdAt: '2026-10-02T11:00:00.000Z',
        },
      ],
      reviews: [
        {
          id: 'rev-1',
          rating: 5,
          comment: 'Très bonne réparation, rapide et soignée.',
          role: 'RECEIVED',
          createdAt: '2026-10-03T09:00:00.000Z',
        },
        {
          id: 'rev-2',
          rating: 4,
          comment: 'Client sérieux et ponctuel.',
          role: 'WRITTEN',
          createdAt: '2026-10-04T18:00:00.000Z',
        },
      ],
      reports: [
        {
          id: 'rep-1',
          conversationId: 'conv-99',
          role: 'AGAINST',
          reason: 'Comportement suspect en messagerie',
          createdAt: '2026-10-06T08:00:00.000Z',
          resolvedAt: null,
        },
      ],
      sessions: [
        {
          id: 'sess-1',
          createdAt: '2026-10-12T07:15:00.000Z',
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      ],
    };

    it('renders all 7 ARIA tabs with role="tab" and badges count', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Activité');
      expect(html).toContain('Commandes');
      expect(html).toContain('Paiements');
      expect(html).toContain('Litiges');
      expect(html).toContain('Avis');
      expect(html).toContain('Signalements');
      expect(html).toContain('Connexions');
    });

    it('renders Activité tab panel with timeline and entity links', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="activite" />
      );

      expect(html).toContain('Historique d&#x27;activité');
      expect(html).toContain('Création de la demande d-123');
      expect(html).toContain('href="/demandes/act-1"');
      expect(html).toContain('admin@revime.fr');
    });

    it('renders Commandes tab panel with orders, status badges and links', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="commandes" />
      );

      expect(html).toContain('Commandes</h2>');
      expect(html).toContain('Réparation écran iPhone 13');
      expect(html).toContain('Changement batterie Samsung S21');
      expect(html).toContain('Client');
      expect(html).toContain('Réparateur');
      expect(html).toContain('COMPLETED');
      expect(html).toContain('IN_PROGRESS');
      expect(html).toContain('href="/commandes/ord-1"');
    });

    it('renders Paiements tab panel with transactions and amounts', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="paiements" />
      );

      expect(html).toContain('Paiements</h2>');
      expect(html).toContain('ord-1');
      expect(html).toContain('89,00\u00a0€');
      expect(html).toContain('SUCCEEDED');
    });

    it('renders Litiges tab panel with dispute numbers and reasons', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="litiges" />
      );

      expect(html).toContain('Litiges</h2>');
      expect(html).toContain('104');
      expect(html).toContain('href="/litiges?disputeId=disp-1"');
      expect(html).toContain('Écran non conforme');
      expect(html).toContain('Ouvert');
      expect(html).not.toContain('OPEN');
    });

    it('renders Avis tab panel with star ratings and role tags', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="avis" />
      );

      expect(html).toContain('Avis</h2>');
      expect(html).toContain('lucide-star');
      expect(html).toContain('/5');
      expect(html).toContain('Avis reçu');
      expect(html).toContain('Très bonne réparation, rapide et soignée.');
      expect(html).toContain('Avis écrit');
      expect(html).toContain('Client sérieux et ponctuel.');
    });

    it('renders Signalements tab panel with report roles and status', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="signalements" />
      );

      expect(html).toContain('Signalements</h2>');
      expect(html).toContain('Signalement reçu');
      expect(html).toContain('href="/signalements/rep-1"');
      expect(html).toContain('Comportement suspect en messagerie');
      expect(html).toContain('En attente');
    });

    it('renders Connexions tab panel with IP address and user agents', () => {
      const html = renderToString(
        <UserDetailTabs history={mockHistory} tabsData={mockTabsData} initialTab="connexions" />
      );

      expect(html).toContain('Connexions</h2>');
      expect(html).toContain('192.168.1.50');
      expect(html).toContain('Mozilla/5.0');
    });
  });

  describe('UserInternalNotes', () => {
    const mockNotes: AdminUserInternalNote[] = [
      {
        id: 'note-1',
        authorName: 'Sophie Admin',
        authorEmail: 'sophie@revime.fr',
        content: 'Compte vérifié par téléphone, utilisateur courtois.',
        createdAt: '2026-10-11T10:00:00.000Z',
      },
    ];

    it('renders timeline of existing notes and add note form', () => {
      const html = renderToString(
        <UserInternalNotes
          userId="usr-1"
          notes={mockNotes}
          busy={false}
          onAddNote={async () => {}}
        />
      );

      expect(html).toContain('Notes internes');
      expect(html).toContain('Sophie Admin');
      expect(html).toContain('sophie@revime.fr');
      expect(html).toContain('Compte vérifié par téléphone, utilisateur courtois.');
      expect(html).toContain('Ajouter une note');
      expect(html).toContain('data-testid="internal-note-input"');
      expect(html).toContain('placeholder="Renseignez une observation interne..."');
    });

    it('renders empty state when no notes exist', () => {
      const html = renderToString(
        <UserInternalNotes
          userId="usr-1"
          notes={[]}
          busy={false}
          onAddNote={async () => {}}
        />
      );

      expect(html).toContain('Aucune note interne pour cet utilisateur.');
    });
  });

  describe('SendUserEmailModal', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <SendUserEmailModal
          isOpen={false}
          onClose={() => {}}
          userEmail="user@example.com"
          userName="Alice"
          onSend={async () => {}}
        />
      );
      expect(html).toBe('');
    });

    it('renders modal dialog with recipient, subject, and message fields when open', () => {
      const html = renderToString(
        <SendUserEmailModal
          isOpen={true}
          onClose={() => {}}
          userEmail="user@example.com"
          userName="Alice"
          onSend={async () => {}}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Envoyer un e-mail à l&#x27;utilisateur');
      expect(html).toContain('user@example.com');
      expect(html).toContain('Objet de l&#x27;e-mail');
      expect(html).toContain('Message');
      expect(html).toContain('Envoyer l&#x27;e-mail');
    });
  });

  describe('DeleteUserDoubleConfirmModal', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <DeleteUserDoubleConfirmModal
          isOpen={false}
          onClose={() => {}}
          userName="Alice"
          userEmail="alice@example.com"
          onConfirm={async () => {}}
        />
      );
      expect(html).toBe('');
    });

    it('renders Step 1 with warning message and continue button', () => {
      const html = renderToString(
        <DeleteUserDoubleConfirmModal
          isOpen={true}
          onClose={() => {}}
          userName="Alice"
          userEmail="alice@example.com"
          onConfirm={async () => {}}
          initialStep={1}
        />
      );

      expect(html).toContain('Suppression de compte (Étape 1/2)');
      expect(html).toContain('irréversible');
      expect(html).toContain('Alice');
      expect(html).toContain('alice@example.com');
      expect(html).toContain('Continuer vers la confirmation');
    });

    it('renders Step 2 requiring typing SUPPRIMER with disabled button initially', () => {
      const html = renderToString(
        <DeleteUserDoubleConfirmModal
          isOpen={true}
          onClose={() => {}}
          userName="Alice"
          userEmail="alice@example.com"
          onConfirm={async () => {}}
          initialStep={2}
        />
      );

      expect(html).toContain('Confirmation finale (Étape 2/2)');
      expect(html).toContain('SUPPRIMER');
      expect(html).toContain('Confirmer la suppression définitive');
    });
  });

  describe('RepairerBlock label renaming', () => {
    it('renders "Jusqu\'au" and does not contain "Date enregistrée"', () => {
      const block: AdminRepairerBlock = {
        displayName: 'Atelier Phone',
        kind: 'PRO',
        bio: null,
        postalCode: '75001',
        serviceAreaLabel: null,
        serviceRadiusKm: null,
        repairerEnabled: true,
        publicBadge: 'BUSINESS',
        counts: {
          liveOffers: 0,
          hiddenLiveOffers: 0,
        },
        identity: null,
        business: null,
        connectStatus: 'VERIFIED',
        revocation: null,
        suspension: {
          at: '2026-10-01T10:00:00.000Z',
          until: '2026-10-31T23:59:59.000Z',
          reason: 'Vérification en cours',
        },
      };

      const html = renderToString(
        <RepairerBlock
          id="usr-rep"
          block={block}
          status={{ kind: 'active' }}
          busy={false}
          act={async () => {}}
          setError={() => {}}
        />
      );

      expect(html).toContain('Jusqu&#x27;au :');
      expect(html).not.toContain('date enregistrée');
    });
  });
});
