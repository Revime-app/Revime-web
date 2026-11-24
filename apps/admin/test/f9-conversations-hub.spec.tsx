import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ConversationsPage, {
  type ConversationsPageProps,
} from '../app/conversations/page';
import { ConversationsKpiCards } from '../components/ConversationsKpiCards';
import { ConversationsFilterToolbar } from '../components/ConversationsFilterToolbar';
import { ConversationsThreadList } from '../components/ConversationsThreadList';
import { ConversationMessageHistory } from '../components/ConversationMessageHistory';
import { NAV_CATEGORIES, ROUTE_TITLES, LINKS } from '../components/AdminNav';
import type {
  AdminConversationSummaryItem,
  AdminConversationKpis,
  AdminConversationDetailResponse,
} from '@revime/shared';

// Mock next/navigation
let mockPathname = '/conversations';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockConversations: AdminConversationSummaryItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    demande: {
      id: 'dem-101',
      title: 'Écran iPhone 13 fissuré',
      status: 'IN_PROGRESS',
    },
    client: {
      id: 'usr-client-1',
      name: 'Alice Martin',
      email: 'alice@example.com',
      phone: '+33612345678',
    },
    repairer: {
      id: 'usr-rep-1',
      name: 'Bob Atelier',
      email: 'bob@atelier.com',
      companyName: 'Atelier Express',
    },
    messagesCount: 3,
    lastMessage: {
      id: 'msg-3',
      body: 'Pièce reçue ce matin, montage en cours.',
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
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    demande: {
      id: 'dem-202',
      title: 'Batterie Samsung S21 gonflée',
      status: 'DISPUTED',
    },
    client: {
      id: 'usr-client-2',
      name: 'Charlie Dupuis',
      email: 'charlie@example.com',
      phone: null,
    },
    repairer: {
      id: 'usr-rep-2',
      name: 'Diane Réparation',
      email: 'diane@reparation.fr',
      companyName: 'Diane Tech',
    },
    messagesCount: 5,
    lastMessage: {
      id: 'msg-5',
      body: 'Je conteste ce devis supplémentaire.',
      senderName: 'Charlie Dupuis',
      createdAt: '2026-10-16T11:00:00.000Z',
      isSystem: false,
    },
    lastMessageAt: '2026-10-16T11:00:00.000Z',
    closed: true,
    hasDispute: true,
    hasReport: true,
    disputeId: 'disp-202',
    createdAt: '2026-10-14T08:00:00.000Z',
  },
];

const mockKpis: AdminConversationKpis = {
  total: 42,
  activeCount: 30,
  closedCount: 12,
  withDisputeCount: 5,
  withReportCount: 3,
};

const mockDetailOpen: AdminConversationDetailResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  demande: {
    id: 'dem-101',
    title: 'Écran iPhone 13 fissuré',
    status: 'IN_PROGRESS',
    categoryLabel: 'Smartphones',
    budgetCents: 15000,
  },
  client: {
    id: 'usr-client-1',
    name: 'Alice Martin',
    email: 'alice@example.com',
    phone: '+33612345678',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  repairer: {
    id: 'usr-rep-1',
    name: 'Bob Atelier',
    email: 'bob@atelier.com',
    phone: '+33687654321',
    companyName: 'Atelier Express',
    avatarUrl: null,
    verified: true,
  },
  commande: {
    id: 'cmd-101',
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
      senderId: 'usr-client-1',
      senderName: 'Alice Martin',
      senderRole: 'CLIENT',
      body: 'Bonjour, avez-vous la pièce en stock pour un iPhone 13 ?',
      kind: 'USER',
      photoUrl: null,
      documentUrl: null,
      documentName: null,
      createdAt: '2026-10-15T10:05:00.000Z',
      deleted: false,
      deletedAt: null,
    },
    {
      id: 'msg-2',
      senderId: 'usr-rep-1',
      senderName: 'Bob Atelier',
      senderRole: 'REPAIRER',
      body: 'Oui tout à fait, voici la photo du bloc écran officiel disponible.',
      kind: 'USER',
      photoUrl: 'https://cdn.revime.fr/photos/screen.jpg',
      documentUrl: null,
      documentName: null,
      createdAt: '2026-10-15T10:15:00.000Z',
      deleted: false,
      deletedAt: null,
    },
    {
      id: 'msg-3',
      senderId: 'usr-rep-1',
      senderName: 'Bob Atelier',
      senderRole: 'REPAIRER',
      body: 'Voici le devis détaillé en pièce jointe au format PDF.',
      kind: 'USER',
      photoUrl: null,
      documentUrl: 'https://cdn.revime.fr/docs/devis.pdf',
      documentName: 'devis-reparation-101.pdf',
      createdAt: '2026-10-15T10:20:00.000Z',
      deleted: false,
      deletedAt: null,
    },
    {
      id: 'msg-4',
      senderId: null,
      senderName: 'Système',
      senderRole: 'SYSTEM',
      body: 'La commande #CMD-101 a été validée et sécurisée par Stripe.',
      kind: 'SYSTEM',
      photoUrl: null,
      documentUrl: null,
      documentName: null,
      createdAt: '2026-10-15T11:00:00.000Z',
      deleted: false,
      deletedAt: null,
    },
    {
      id: 'msg-5',
      senderId: 'usr-client-1',
      senderName: 'Alice Martin',
      senderRole: 'CLIENT',
      body: 'Mon numéro direct est le 0612345678 contactez-moi en direct.',
      kind: 'USER',
      photoUrl: null,
      documentUrl: null,
      documentName: null,
      createdAt: '2026-10-15T12:00:00.000Z',
      deleted: true,
      deletedAt: '2026-10-15T12:05:00.000Z',
    },
  ],
};

const mockDetailClosed: AdminConversationDetailResponse = {
  ...mockDetailOpen,
  id: '22222222-2222-4222-8222-222222222222',
  closed: true,
  closedAt: '2026-10-16T11:30:00.000Z',
  commande: {
    id: 'cmd-202',
    status: 'DISPUTED',
    totalCents: 8500,
    disputeId: 'disp-202',
  },
};

describe('F9: Administrative Conversations Hub (/conversations)', () => {
  beforeEach(() => {
    mockPathname = '/conversations';
    vi.restoreAllMocks();
  });

  describe('1. Navigation Wiring & Route Titles', () => {
    it('registers /conversations under operations category in NAV_CATEGORIES', () => {
      const operations = NAV_CATEGORIES.find((cat) => cat.id === 'operations');
      expect(operations).toBeDefined();
      const conversationItem = operations?.items.find((item) => item.href === '/conversations');
      expect(conversationItem).toBeDefined();
      expect(conversationItem?.label).toBe('Conversations');
    });

    it('registers /conversations in ROUTE_TITLES with French label Conversations', () => {
      expect(ROUTE_TITLES['/conversations']).toBe('Conversations');
    });

    it('includes /conversations in flat LINKS array', () => {
      const conversationLink = LINKS.find((link) => link.href === '/conversations');
      expect(conversationLink).toBeDefined();
      expect(conversationLink?.label).toBe('Conversations');
    });
  });

  describe('2. Master-Detail 2-Pane Layout & Breadcrumbs', () => {
    it('renders page inside .page.page--detail with Breadcrumbs and 2-column detail grid', () => {
      const html = renderToString(
        <ConversationsPage
          initialConversations={mockConversations}
          initialTotal={2}
          initialKpis={mockKpis}
          initialSelectedConversation={mockDetailOpen}
        />
      );

      // Page wrapper
      expect(html).toContain('page--detail');

      // Breadcrumbs
      expect(html).toContain('Accueil');
      expect(html).toContain('Opérations');
      expect(html).toContain('Conversations');

      // 2-pane detail grid with left and right testids
      expect(html).toContain('data-testid="detail-grid-left"');
      expect(html).toContain('data-testid="detail-grid-right"');
    });

    it('renders empty placeholder in right pane when no conversation is selected', () => {
      const html = renderToString(
        <ConversationsPage
          initialConversations={mockConversations}
          initialTotal={2}
          initialKpis={mockKpis}
          initialSelectedConversation={null}
        />
      );

      expect(html).toContain('data-testid="detail-grid-right"');
      expect(html).toContain('Sélectionnez une conversation');
    });
  });

  describe('3. KPI Summary Cards (ConversationsKpiCards)', () => {
    it('renders 4 KPI metrics: Total, Actives, Litiges, Signalées', () => {
      const html = renderToString(<ConversationsKpiCards kpis={mockKpis} />);

      expect(html).toContain('42');
      expect(html).toContain('Total');
      expect(html).toContain('30');
      expect(html).toContain('Actives');
      expect(html).toContain('5');
      expect(html).toContain('Litiges');
      expect(html).toContain('3');
      expect(html).toContain('Signalées');
    });
  });

  describe('4. Filter Toolbar (ConversationsFilterToolbar)', () => {
    it('renders query search input, status pills, and checkbox filters', () => {
      const html = renderToString(
        <ConversationsFilterToolbar
          q="iPhone"
          status="open"
          hasDispute={false}
          hasReport={true}
          onSearchChange={vi.fn()}
          onStatusChange={vi.fn()}
          onHasDisputeChange={vi.fn()}
          onHasReportChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Search input with value
      expect(html).toContain('value="iPhone"');
      // Status pills
      expect(html).toContain('Toutes');
      expect(html).toContain('Actives');
      expect(html).toContain('Fermées');
      // Checkbox toggles
      expect(html).toContain('Litiges uniquement');
      expect(html).toContain('Signalées uniquement');
      // Reset button
      expect(html).toContain('Réinitialiser');
    });
  });

  describe('5. Scrollable Thread List (ConversationsThreadList)', () => {
    it('renders thread items with client-repairer names, demande title, snippet, and badges', () => {
      const html = renderToString(
        <ConversationsThreadList
          threads={mockConversations}
          selectedId="11111111-1111-4111-8111-111111111111"
          onSelectThread={vi.fn()}
          page={1}
          total={2}
          limit={20}
          onPageChange={vi.fn()}
        />
      );

      // Thread 1
      expect(html).toContain('Alice Martin');
      expect(html).toContain('Bob Atelier');
      expect(html).toContain('Écran iPhone 13 fissuré');
      expect(html).toContain('Pièce reçue ce matin');

      // Thread 2 (closed, with dispute and report)
      expect(html).toContain('Charlie Dupuis');
      expect(html).toContain('Diane Réparation');
      expect(html).toContain('Batterie Samsung S21 gonflée');
      expect(html).toContain('Fermée');
      expect(html).toContain('Litige');
      expect(html).toContain('Signalée');

      // Pagination
      expect(html).toContain('Page 1 sur 1');
    });

    it('renders empty notice when thread list is empty', () => {
      const html = renderToString(
        <ConversationsThreadList
          threads={[]}
          selectedId={null}
          onSelectThread={vi.fn()}
          page={1}
          total={0}
          limit={20}
          onPageChange={vi.fn()}
        />
      );

      expect(html).toContain('Aucune conversation trouvée');
    });
  });

  describe('6. Message History & Moderation Actions (ConversationMessageHistory)', () => {
    it('renders header with demande, commande, dispute, and participant profile links', () => {
      const html = renderToString(
        <ConversationMessageHistory
          conversation={mockDetailClosed}
          onCloseConversation={vi.fn()}
          onReopenConversation={vi.fn()}
        />
      );

      // Links to entities
      expect(html).toContain('href="/demandes/dem-101"');
      expect(html).toContain('href="/commandes/cmd-202"');
      expect(html).toContain('href="/litiges?disputeId=disp-202"');
      expect(html).toContain('href="/utilisateurs/usr-client-1"');
      expect(html).toContain('href="/utilisateurs/usr-rep-1"');

      // Moderation button for closed conversation
      expect(html).toContain('Rouvrir la conversation');
    });

    it('renders close moderation button when conversation is open', () => {
      const html = renderToString(
        <ConversationMessageHistory
          conversation={mockDetailOpen}
          onCloseConversation={vi.fn()}
          onReopenConversation={vi.fn()}
        />
      );

      expect(html).toContain('Fermer la conversation');
    });

    it('renders distinct message bubbles for client, repairer, and system', () => {
      const html = renderToString(
        <ConversationMessageHistory
          conversation={mockDetailOpen}
          onCloseConversation={vi.fn()}
          onReopenConversation={vi.fn()}
        />
      );

      // Client bubble
      expect(html).toContain('Alice Martin');
      expect(html).toContain('Bonjour, avez-vous la pièce en stock');
      expect(html).toContain('Client');

      // Repairer bubble
      expect(html).toContain('Bob Atelier');
      expect(html).toContain('Oui tout à fait, voici la photo');
      expect(html).toContain('Réparateur');

      // System message
      expect(html).toContain('Système');
      expect(html).toContain('La commande #CMD-101 a été validée');
    });

    it('renders photo and document attachments', () => {
      const html = renderToString(
        <ConversationMessageHistory
          conversation={mockDetailOpen}
          onCloseConversation={vi.fn()}
          onReopenConversation={vi.fn()}
        />
      );

      // Photo thumbnail preview
      expect(html).toContain('src="https://cdn.revime.fr/photos/screen.jpg"');

      // Document download card
      expect(html).toContain('href="https://cdn.revime.fr/docs/devis.pdf"');
      expect(html).toContain('devis-reparation-101.pdf');
    });

    it('renders moderation notice on soft-deleted messages while retaining body', () => {
      const html = renderToString(
        <ConversationMessageHistory
          conversation={mockDetailOpen}
          onCloseConversation={vi.fn()}
          onReopenConversation={vi.fn()}
        />
      );

      // Deleted banner
      expect(html).toContain('Message masqué par la modération');
      // Body retained for admin inspection
      expect(html).toContain('Mon numéro direct est le 0612345678');
    });
  });

  describe('7. Automated ZERO BLACK BUTTONS Scanner', () => {
    it('verifies that no button, badge, or pill uses black styling across all hub views', () => {
      const views = [
        // 1. Full page with active thread
        renderToString(
          <ConversationsPage
            initialConversations={mockConversations}
            initialTotal={2}
            initialKpis={mockKpis}
            initialSelectedConversation={mockDetailOpen}
          />
        ),
        // 2. Full page with closed thread
        renderToString(
          <ConversationsPage
            initialConversations={mockConversations}
            initialTotal={2}
            initialKpis={mockKpis}
            initialSelectedConversation={mockDetailClosed}
          />
        ),
        // 3. Full page empty state
        renderToString(
          <ConversationsPage
            initialConversations={[]}
            initialTotal={0}
            initialKpis={mockKpis}
            initialSelectedConversation={null}
          />
        ),
        // 4. Standalone KPI cards
        renderToString(<ConversationsKpiCards kpis={mockKpis} />),
        // 5. Standalone Filter toolbar
        renderToString(
          <ConversationsFilterToolbar
            q="test"
            status="all"
            hasDispute={true}
            hasReport={false}
            onSearchChange={vi.fn()}
            onStatusChange={vi.fn()}
            onHasDisputeChange={vi.fn()}
            onHasReportChange={vi.fn()}
            onReset={vi.fn()}
          />
        ),
        // 6. Standalone Thread list
        renderToString(
          <ConversationsThreadList
            threads={mockConversations}
            selectedId={mockConversations[0].id}
            onSelectThread={vi.fn()}
            page={1}
            total={2}
            limit={20}
            onPageChange={vi.fn()}
          />
        ),
        // 7. Standalone Message history
        renderToString(
          <ConversationMessageHistory
            conversation={mockDetailOpen}
            onCloseConversation={vi.fn()}
            onReopenConversation={vi.fn()}
          />
        ),
      ];

      for (const html of views) {
        // Scan buttons
        const buttonRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
        let match: RegExpExecArray | null;
        while ((match = buttonRegex.exec(html)) !== null) {
          const buttonAttrs = match[1];

          // Check inline style
          const styleMatch = buttonAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }

          // Check class
          const classMatch = buttonAttrs.match(/class="([^"]*)"/i);
          if (classMatch) {
            const className = classMatch[1].toLowerCase();
            expect(className).not.toContain('black');
          }
        }

        // Scan badges / pills / spans
        const spanRegex = /<span\s+([^>]*?)>([\s\S]*?)<\/span>/gi;
        while ((match = spanRegex.exec(html)) !== null) {
          const spanAttrs = match[1];
          const styleMatch = spanAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }
        }
      }
    });
  });
});
