import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import AlertsPage, { type AlertsPageProps } from '../app/alertes/page';
import { AlertsFilterToolbar } from '../components/AlertsFilterToolbar';
import { AlertsTable } from '../components/AlertsTable';
import { AlertsKpiCards } from '../components/AlertsKpiCards';
import { AlertsPreferencesCard } from '../components/AlertsPreferencesCard';
import { AlertsSlaCard } from '../components/AlertsSlaCard';
import { LINKS, NAV_CATEGORIES, ROUTE_TITLES } from '../components/AdminNav';
import type {
  AdminAlertItem,
  AdminAlertKpis,
  AdminAlertPreferences,
} from '@revime/shared';

// Mock next/navigation
let mockPathname = '/alertes';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockAlerts: AdminAlertItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'DISPUTE_NEW',
    severity: 'CRITICAL',
    title: 'Litige #LIT-101 ouvert',
    message: 'Le client signale que l’appareil est toujours défectueux après réparation.',
    targetType: 'Dispute',
    targetId: 'disp-101',
    link: '/litiges?disputeId=disp-101',
    isRead: false,
    readAt: null,
    readByUserId: null,
    emailSent: true,
    createdAt: '2026-10-16T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'REPORT_SEVERE',
    severity: 'CRITICAL',
    title: 'Signalement sévère',
    message: 'Suspicion de tentative de fraude et coordonnées partagées en messagerie.',
    targetType: 'ConversationReport',
    targetId: 'rep-202',
    link: '/signalements?reportId=rep-202',
    isRead: false,
    readAt: null,
    readByUserId: null,
    emailSent: true,
    createdAt: '2026-10-16T09:30:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'PAYMENT_FAILED',
    severity: 'HIGH',
    title: 'Échec de paiement Stripe',
    message: 'La carte bancaire a été rejetée pour le paiement de la commande #CMD-303.',
    targetType: 'Commande',
    targetId: 'cmd-303',
    link: '/versements?id=cmd-303',
    isRead: true,
    readAt: '2026-10-16T09:00:00.000Z',
    readByUserId: 'usr-admin-1',
    readByUserName: 'Malek Klimane',
    emailSent: true,
    createdAt: '2026-10-16T08:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    type: 'PARCEL_INCIDENT',
    severity: 'MEDIUM',
    title: 'Incident colis Boxtal',
    message: 'Retard transporteur supérieur à 72 heures constaté sur l’expédition #SHP-404.',
    targetType: 'Shipment',
    targetId: 'ship-404',
    link: '/colis?id=ship-404',
    isRead: false,
    readAt: null,
    readByUserId: null,
    emailSent: false,
    createdAt: '2026-10-16T07:15:00.000Z',
  },
];

const mockKpis: AdminAlertKpis = {
  unreadTotal: 12,
  criticalCount: 4,
  disputesCount: 5,
  paymentsCount: 3,
};

const mockPreferences: AdminAlertPreferences = {
  emailDisputes: true,
  emailReports: true,
  emailPayments: true,
  emailParcels: false,
  bellDisputes: true,
  bellReports: true,
  bellPayments: true,
  bellParcels: true,
};

describe('F7: Dedicated Alerts Hub Page & Navigation Wiring (/alertes)', () => {
  beforeEach(() => {
    mockPathname = '/alertes';
    vi.restoreAllMocks();
  });

  describe('1. Layout, Breadcrumbs & 2-Column Detail Grid Structure', () => {
    it('renders page in .page.page--detail with proper breadcrumbs', () => {
      const html = renderToString(
        <AlertsPage
          initialAlerts={mockAlerts}
          initialTotal={4}
          initialKpis={mockKpis}
          initialPreferences={mockPreferences}
        />
      );

      expect(html).toContain('page--detail');
      expect(html).toContain('Accueil');
      expect(html).toContain('Opérations');
      expect(html).toContain('Alertes opérationnelles');
      expect(html).toContain('Hub de surveillance des incidents opérationnels');
    });

    it('renders the 2-column .detail-grid with left (1.6fr) and right (1.1fr) testids', () => {
      const html = renderToString(
        <AlertsPage
          initialAlerts={mockAlerts}
          initialTotal={4}
          initialKpis={mockKpis}
          initialPreferences={mockPreferences}
        />
      );

      expect(html).toContain('class="detail-grid"');
      expect(html).toContain('data-testid="detail-grid-left"');
      expect(html).toContain('data-testid="detail-grid-right"');
    });
  });

  describe('2. Left Column: AlertsFilterToolbar Component', () => {
    it('renders all 5 category filter pills with correct labels', () => {
      const html = renderToString(
        <AlertsFilterToolbar
          type="ALL"
          severity="ALL"
          isRead="false"
          q=""
          onTypeChange={vi.fn()}
          onSeverityChange={vi.fn()}
          onIsReadChange={vi.fn()}
          onSearchChange={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Toutes');
      expect(html).toContain('Litiges');
      expect(html).toContain('Signalements');
      expect(html).toContain('Paiements');
      expect(html).toContain('Colis');
    });

    it('renders severity select dropdown with all options', () => {
      const html = renderToString(
        <AlertsFilterToolbar
          type="ALL"
          severity="ALL"
          isRead="false"
          q=""
          onTypeChange={vi.fn()}
          onSeverityChange={vi.fn()}
          onIsReadChange={vi.fn()}
          onSearchChange={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Toutes les sévérités');
      expect(html).toContain('Critique');
      expect(html).toContain('Élevée');
      expect(html).toContain('Modérée');
    });

    it('renders read status tabs (Non lues, Toutes les alertes, Lues)', () => {
      const html = renderToString(
        <AlertsFilterToolbar
          type="ALL"
          severity="ALL"
          isRead="false"
          q=""
          onTypeChange={vi.fn()}
          onSeverityChange={vi.fn()}
          onIsReadChange={vi.fn()}
          onSearchChange={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Non lues');
      expect(html).toContain('Toutes les alertes');
      expect(html).toContain('Lues');
    });

    it('renders search input with clear button when q is provided', () => {
      const htmlWithQ = renderToString(
        <AlertsFilterToolbar
          type="ALL"
          severity="ALL"
          isRead="false"
          q="écran"
          onTypeChange={vi.fn()}
          onSeverityChange={vi.fn()}
          onIsReadChange={vi.fn()}
          onSearchChange={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />
      );

      expect(htmlWithQ).toContain('value="écran"');
      expect(htmlWithQ).toContain('aria-label="Effacer la recherche"');
    });

    it('renders "Tout marquer comme lu" button in Bleu Ink var(--navy, #25324f)', () => {
      const html = renderToString(
        <AlertsFilterToolbar
          type="ALL"
          severity="ALL"
          isRead="false"
          q=""
          unreadCount={5}
          onTypeChange={vi.fn()}
          onSeverityChange={vi.fn()}
          onIsReadChange={vi.fn()}
          onSearchChange={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Tout marquer comme lu');
      expect(html).toContain('var(--navy, #25324f)');
    });
  });

  describe('3. Left Column: AlertsTable Component', () => {
    it('renders alert rows with icon, severity badge, title, target, and relative date', () => {
      const html = renderToString(
        <AlertsTable
          alerts={mockAlerts}
          total={4}
          page={1}
          limit={20}
          onPageChange={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      );

      // Titles & messages
      expect(html).toContain('Litige #LIT-101 ouvert');
      expect(html).toContain('Signalement sévère');
      expect(html).toContain('Échec de paiement Stripe');
      expect(html).toContain('Incident colis Boxtal');

      // Badges
      expect(html).toContain('Critique');
      expect(html).toContain('Élevée');
      expect(html).toContain('Modérée');

      // Target references
      expect(html).toContain('disp-101');
      expect(html).toContain('rep-202');
      expect(html).toContain('cmd-303');
      expect(html).toContain('ship-404');

      // Action links
      expect(html).toContain('href="/litiges?disputeId=disp-101"');
      expect(html).toContain('href="/signalements?reportId=rep-202"');
      expect(html).toContain('href="/versements?id=cmd-303"');
      expect(html).toContain('href="/colis?id=ship-404"');

      // Mark as read buttons
      expect(html).toContain('Marquer comme lu');
    });

    it('renders empty state when no alerts match active filters', () => {
      const html = renderToString(
        <AlertsTable
          alerts={[]}
          total={0}
          page={1}
          limit={20}
          onPageChange={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Aucune alerte opérationnelle trouvée');
      expect(html).toContain('Tous les incidents sont actuellement résolus ou ne correspondent pas aux filtres.');
    });

    it('renders pagination controls when alerts exist', () => {
      const html = renderToString(
        <AlertsTable
          alerts={mockAlerts}
          total={45}
          page={1}
          limit={20}
          onPageChange={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      );

      expect(html).toContain('Page 1 sur 3');
      expect(html).toContain('45 alertes au total');
      expect(html).toContain('Précédent');
      expect(html).toContain('Suivant');
    });
  });

  describe('4. Right Column: AlertsKpiCards Component', () => {
    it('renders 4 operational summary cards with correct metric values', () => {
      const html = renderToString(
        <AlertsKpiCards kpis={mockKpis} />
      );

      expect(html).toContain('Alertes non lues');
      expect(html).toContain('12');

      expect(html).toContain('Alertes critiques');
      expect(html).toContain('4');

      expect(html).toContain('Litiges ouverts');
      expect(html).toContain('5');

      expect(html).toContain('Échecs de paiement');
      expect(html).toContain('3');
    });
  });

  describe('5. Right Column: AlertsPreferencesCard Component', () => {
    it('renders category toggles for email and bell notifications', () => {
      const html = renderToString(
        <AlertsPreferencesCard
          preferences={mockPreferences}
          onUpdate={vi.fn()}
        />
      );

      expect(html).toContain('Préférences de notification');
      expect(html).toContain('Litiges');
      expect(html).toContain('Signalements');
      expect(html).toContain('Paiements');
      expect(html).toContain('Colis');

      expect(html).toContain('E-mail');
      expect(html).toContain('Cloche');
    });
  });

  describe('6. Right Column: AlertsSlaCard Component', () => {
    it('renders operational SLA guidance with 3 severity tiers', () => {
      const html = renderToString(<AlertsSlaCard />);

      expect(html).toContain('Guide des SLA opérationnels');
      expect(html).toContain('Critique');
      expect(html).toContain('SLA &lt; 1h');
      expect(html).toContain('Élevée');
      expect(html).toContain('SLA &lt; 4h');
      expect(html).toContain('Modérée');
      expect(html).toContain('SLA &lt; 24h');
    });
  });

  describe('7. Navigation Wiring & Route Titles', () => {
    it('wires /alertes under operations in NAV_CATEGORIES, with no sidebar badge (the header bell carries its unread count)', () => {
      const operationsCategory = NAV_CATEGORIES.find((c) => c.id === 'operations');
      expect(operationsCategory).toBeDefined();

      const alertesItem = operationsCategory?.items.find((i) => i.href === '/alertes');
      expect(alertesItem).toBeDefined();
      expect(alertesItem?.label).toBe('Alertes opérationnelles');
      expect(alertesItem?.badgeKey).toBeUndefined();
    });

    it('registers /alertes in ROUTE_TITLES dictionary', () => {
      expect(ROUTE_TITLES['/alertes']).toBe('Alertes opérationnelles');
    });

    it('contains /alertes in flat LINKS array (28 links)', () => {
      const alertesLink = LINKS.find((l) => l.href === '/alertes');
      expect(alertesLink).toBeDefined();
      expect(LINKS.length).toBe(28);
    });
  });

  describe('8. Automated ZERO BLACK BUTTONS Scanner', () => {
    it('verifies that no button or badge uses black styling across all hub states', () => {
      const hubStates = [
        // 1. Default loaded state
        renderToString(
          <AlertsPage
            initialAlerts={mockAlerts}
            initialTotal={4}
            initialKpis={mockKpis}
            initialPreferences={mockPreferences}
          />
        ),
        // 2. Filtered empty state
        renderToString(
          <AlertsPage
            initialAlerts={[]}
            initialTotal={0}
            initialKpis={mockKpis}
            initialPreferences={mockPreferences}
            initialType="PARCEL_INCIDENT"
          />
        ),
        // 3. Toolbar standalone
        renderToString(
          <AlertsFilterToolbar
            type="DISPUTE_NEW"
            severity="CRITICAL"
            isRead="false"
            q="test"
            unreadCount={3}
            onTypeChange={vi.fn()}
            onSeverityChange={vi.fn()}
            onIsReadChange={vi.fn()}
            onSearchChange={vi.fn()}
            onMarkAllAsRead={vi.fn()}
          />
        ),
        // 4. Table standalone
        renderToString(
          <AlertsTable
            alerts={mockAlerts}
            total={4}
            page={1}
            limit={20}
            onPageChange={vi.fn()}
            onMarkAsRead={vi.fn()}
          />
        ),
        // 5. Preferences standalone
        renderToString(
          <AlertsPreferencesCard
            preferences={mockPreferences}
            onUpdate={vi.fn()}
          />
        ),
        // 6. SLA Card standalone
        renderToString(<AlertsSlaCard />),
      ];

      for (const html of hubStates) {
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
              /background(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
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
              /background(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }
        }
      }
    });
  });
});
