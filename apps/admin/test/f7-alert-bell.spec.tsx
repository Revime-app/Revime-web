import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  AdminAlertBell,
  ALERT_BELL_POLL_INTERVAL_MS,
  fetchUnreadAlertsCount,
  fetchLatestUnreadAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  getSeverityStyle,
} from '../components/AdminAlertBell';
import { AdminHeader } from '../components/AdminHeader';
import type { AdminAlertItem } from '@revime/shared';

// Mock next/navigation for AdminHeader
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Mock auth-client for AdminHeader
let mockSession = {
  data: {
    user: {
      name: 'Malek Klimane',
      email: 'malek@revime.fr',
    },
  },
};
vi.mock('../lib/auth-client', () => ({
  useSession: () => mockSession,
  signOut: vi.fn(),
}));

// Mock AdminGate for AdminHeader
vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({ role: 'super_admin' }),
}));

const sampleAlerts: AdminAlertItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'DISPUTE_NEW',
    severity: 'CRITICAL',
    title: 'Litige #LIT-001 ouvert',
    message: 'Le client signale un écran cassé',
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
    title: 'Signalement urgent',
    message: 'Propos injurieux dans conversation',
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
    title: 'Échec de paiement',
    message: 'Carte bancaire expirée pour commande #CMD-123',
    targetType: 'Commande',
    targetId: 'cmd-303',
    link: '/paiements?id=cmd-303',
    isRead: false,
    readAt: null,
    readByUserId: null,
    emailSent: true,
    createdAt: '2026-10-16T08:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    type: 'PARCEL_INCIDENT',
    severity: 'MEDIUM',
    title: 'Incident colis',
    message: 'Colis égaré par le transporteur',
    targetType: 'Shipment',
    targetId: 'ship-404',
    link: '/colis?id=ship-404',
    isRead: false,
    readAt: null,
    readByUserId: null,
    emailSent: false,
    createdAt: '2026-10-15T14:00:00.000Z',
  },
];

describe('Feature F7: Task 4 — AdminAlertBell Component & Header Integration', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockSession = {
      data: {
        user: {
          name: 'Malek Klimane',
          email: 'malek@revime.fr',
        },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Bell Trigger Button & Badge Rendering', () => {
    it('renders bell trigger button with accessible attributes', () => {
      const html = renderToString(<AdminAlertBell initialUnreadCount={0} />);
      expect(html).toContain('aria-label="Alertes opérationnelles"');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('admin-alert-bell__badge');
    });

    it('renders red accent pill badge when unreadCount > 0', () => {
      const html = renderToString(<AdminAlertBell initialUnreadCount={3} />);
      expect(html).toContain('admin-alert-bell__badge');
      expect(html).toContain('3');
      // Rouge Punch, not `--accent` (navy in the admin): the charte makes the counters red
      expect(html).toContain('var(--red, #f61b39)');
      expect(html).not.toContain('var(--accent');
    });

    it('renders "99+" when unread count exceeds 99', () => {
      const html = renderToString(<AdminAlertBell initialUnreadCount={150} />);
      expect(html).toContain('admin-alert-bell__badge');
      expect(html).toContain('99+');
    });
  });

  describe('2. Popover Dropdown & Alerts List', () => {
    it('renders empty state when initialOpen is true and alerts list is empty', () => {
      const html = renderToString(
        <AdminAlertBell initialOpen={true} initialUnreadCount={0} initialAlerts={[]} />
      );
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('Alertes opérationnelles');
      expect(html).toContain('Tout marquer comme lu');
      expect(html).toContain('Aucune alerte non lue');
      expect(html).toContain('href="/alertes"');
      expect(html).toContain('Voir toutes les alertes');
    });

    it('renders preview of unread alerts with category icons, severity badges, and quick mark-as-read buttons', () => {
      const html = renderToString(
        <AdminAlertBell
          initialOpen={true}
          initialUnreadCount={4}
          initialAlerts={sampleAlerts}
        />
      );

      // Category icons
      expect(html).toContain('lucide-scale'); // Dispute
      expect(html).toContain('lucide-siren'); // Report
      expect(html).toContain('lucide-credit-card'); // Payment
      expect(html).toContain('lucide-package'); // Parcel

      // Titles & snippets
      expect(html).toContain('Litige #LIT-001 ouvert');
      expect(html).toContain('Le client signale un écran cassé');
      expect(html).toContain('Signalement urgent');
      expect(html).toContain('Échec de paiement');
      expect(html).toContain('Incident colis');

      // Severity badges
      expect(html).toContain('CRITICAL');
      expect(html).toContain('HIGH');
      expect(html).toContain('MEDIUM');

      // Quick mark as read buttons
      expect(html).toContain('aria-label="Marquer comme lu"');

      // Target links
      expect(html).toContain('href="/litiges?disputeId=disp-101"');
      expect(html).toContain('href="/signalements?reportId=rep-202"');
      expect(html).toContain('href="/paiements?id=cmd-303"');
      expect(html).toContain('href="/colis?id=ship-404"');

      // Footer link
      expect(html).toContain('href="/alertes"');
      expect(html).toContain('Voir toutes les alertes');
    });

    it('limits dropdown preview to at most 5 alerts', () => {
      const sixAlerts = [
        ...sampleAlerts,
        {
          id: '55555555-5555-4555-8555-555555555555',
          type: 'DISPUTE_NEW' as const,
          severity: 'CRITICAL' as const,
          title: 'Litige #5',
          message: 'Détail 5',
          targetType: 'Dispute' as const,
          targetId: 'disp-5',
          link: '/litiges/5',
          isRead: false,
          readAt: null,
          readByUserId: null,
          emailSent: false,
          createdAt: '2026-10-14T10:00:00.000Z',
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          type: 'DISPUTE_NEW' as const,
          severity: 'CRITICAL' as const,
          title: 'Litige #6 (Should Not Appear)',
          message: 'Détail 6',
          targetType: 'Dispute' as const,
          targetId: 'disp-6',
          link: '/litiges/6',
          isRead: false,
          readAt: null,
          readByUserId: null,
          emailSent: false,
          createdAt: '2026-10-14T09:00:00.000Z',
        },
      ];

      const html = renderToString(
        <AdminAlertBell
          initialOpen={true}
          initialUnreadCount={6}
          initialAlerts={sixAlerts}
        />
      );

      expect(html).toContain('Litige #5');
      expect(html).not.toContain('Litige #6 (Should Not Appear)');
    });

    it('ensures accessible and valid W3C DOM nesting (no button nested inside anchor)', () => {
      const html = renderToString(
        <AdminAlertBell
          initialOpen={true}
          initialUnreadCount={4}
          initialAlerts={sampleAlerts}
        />
      );

      // Verify no <button> is nested inside <a>
      const anchorMatches = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
      for (const anchor of anchorMatches) {
        expect(anchor).not.toContain('<button');
      }
    });
  });

  describe('3. Severity Badge Styling Token Validation', () => {
    it('applies brand-compliant styles without black colors for all severities', () => {
      const crit = getSeverityStyle('CRITICAL');
      expect(crit.color).toBe('var(--badge-danger-text)');
      expect(crit.backgroundColor).toBe('var(--badge-danger-bg)');

      const high = getSeverityStyle('HIGH');
      expect(high.color).toBe('var(--badge-warning-text)');
      expect(high.backgroundColor).toBe('var(--badge-warning-bg)');

      const med = getSeverityStyle('MEDIUM');
      expect(med.color).toBe('var(--navy-text, #25324f)');
      expect(med.backgroundColor).toBe('var(--navy-soft)');
    });
  });

  describe('4. Polling Configuration & API Route Operations', () => {
    it('specifies 30 second background polling interval', () => {
      expect(ALERT_BELL_POLL_INTERVAL_MS).toBe(30_000);
    });

    it('fetches unread count from /api/proxy/admin/alerts/unread-count', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unreadCount: 7 }),
      });

      const count = await fetchUnreadAlertsCount(mockFetch as unknown as typeof fetch);
      expect(count).toBe(7);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/alerts/unread-count');
    });

    it('throws error when unread count request fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        fetchUnreadAlertsCount(mockFetch as unknown as typeof fetch)
      ).rejects.toThrow('Failed to fetch unread count: 500');
    });

    it('fetches latest unread alerts with isRead=false and limit query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: sampleAlerts,
          total: 4,
          unreadCount: 4,
          page: 1,
          limit: 5,
        }),
      });

      const res = await fetchLatestUnreadAlerts(5, mockFetch as unknown as typeof fetch);
      expect(res.items).toHaveLength(4);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/alerts?isRead=false&limit=5');
    });

    it('calls PATCH /api/proxy/admin/alerts/:id/read when marking single alert as read', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...sampleAlerts[0], isRead: true }),
      });

      const updated = await markAlertAsRead(
        sampleAlerts[0].id,
        mockFetch as unknown as typeof fetch
      );
      expect(updated.isRead).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/proxy/admin/alerts/${sampleAlerts[0].id}/read`,
        { method: 'PATCH' }
      );
    });

    it('calls POST /api/proxy/admin/alerts/mark-all-read when marking all alerts as read', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ count: 4 }),
      });

      const result = await markAllAlertsAsRead(mockFetch as unknown as typeof fetch);
      expect(result.count).toBe(4);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/alerts/mark-all-read', {
        method: 'POST',
      });
    });
  });

  describe('5. Header Integration', () => {
    it('mounts AdminAlertBell into AdminHeader right before header__profile', () => {
      const html = renderToString(<AdminHeader />);
      expect(html).toContain('admin-alert-bell');
      expect(html).toContain('aria-label="Alertes opérationnelles"');

      // Check ordering: bell appears before header__profile
      const bellIndex = html.indexOf('admin-alert-bell');
      const profileIndex = html.indexOf('header__profile');
      expect(bellIndex).toBeGreaterThan(-1);
      expect(profileIndex).toBeGreaterThan(-1);
      expect(bellIndex).toBeLessThan(profileIndex);
    });
  });

  describe('6. ZERO Black Buttons Invariant', () => {
    it('verifies that no buttons, badges, or links use black colors (#000000, rgb(0,0,0), black)', () => {
      const renderedVariants = [
        renderToString(<AdminAlertBell initialUnreadCount={0} initialOpen={false} />),
        renderToString(<AdminAlertBell initialUnreadCount={3} initialOpen={false} />),
        renderToString(<AdminAlertBell initialUnreadCount={0} initialOpen={true} initialAlerts={[]} />),
        renderToString(<AdminAlertBell initialUnreadCount={4} initialOpen={true} initialAlerts={sampleAlerts} />),
        renderToString(<AdminHeader />),
      ];

      for (const html of renderedVariants) {
        // Extract all buttons
        const buttonMatches = html.match(/<button[^>]*>/gi) ?? [];
        for (const btn of buttonMatches) {
          const lower = btn.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color: #000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('background-color: black');
          expect(lower).not.toContain('background-color:rgb(0,0,0)');
          expect(lower).not.toContain('background-color: rgb(0, 0, 0)');
          expect(lower).not.toContain('background:#000000');
          expect(lower).not.toContain('background:black');
          expect(lower).not.toContain('color:#000000');
          expect(lower).not.toContain('color:black');
          expect(lower).not.toContain('class="*black*"');
        }

        // Extract all anchors/links
        const anchorMatches = html.match(/<a[^>]*>/gi) ?? [];
        for (const a of anchorMatches) {
          const lower = a.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('background-color:rgb(0,0,0)');
        }
      }
    });
  });
});
