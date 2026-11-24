import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminHeader, handleSearchKeyDown } from '../components/AdminHeader';
import type { AdminSearchResult } from '@revime/shared';

let mockPathname = '/';
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const mockSession = {
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

vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({ role: 'super_admin' }),
}));

const mock4CategoryResults: AdminSearchResult = {
  commandes: [
    {
      id: 'cmd-101',
      title: 'Commande #CMD-A9DB011E',
      subtitle: 'Client : Alice Martin · Réparateur : Bob Atelier',
      badge: 'PAID',
      href: '/commandes/cmd-101',
    },
  ],
  users: [
    {
      id: 'usr-202',
      title: 'Alice Martin',
      subtitle: 'alice@example.com',
      badge: 'Client',
      href: '/utilisateurs/usr-202',
    },
  ],
  demandes: [
    {
      id: 'dmd-303',
      title: 'Réparation iPhone 13 Pro',
      subtitle: 'Écran cassé · Paris 11e',
      badge: 'EN_ATTENTE',
      href: '/demandes/dmd-303',
    },
  ],
  disputes: [
    {
      id: 'disp-404',
      title: 'Litige #LIT-0014',
      subtitle: 'Commande #CMD-A9DB011E · Écran fissuré',
      badge: 'OPEN',
      href: '/litiges?disputeId=disp-404',
    },
  ],
};

describe('Feature F8 Task 3: AdminHeader 4-Category Instant Dropdown & Hub Navigation', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Search Input & Accessibility', () => {
    it('renders input with updated 4-category placeholder and accessible labels', () => {
      const html = renderToString(<AdminHeader />);
      expect(html).toContain('placeholder="Rechercher commande, utilisateur, demande, litige... (Ctrl+K)"');
      expect(html).toContain('aria-label="Recherche globale"');
      expect(html).toContain('type="search"');
    });
  });

  describe('2. 4-Category Instant Dropdown Rendering', () => {
    it('renders all 4 category groups when results are provided', () => {
      const html = renderToString(
        <AdminHeader initialResults={mock4CategoryResults} initialQuery="iphone" />,
      );

      // 4 group section titles
      expect(html).toContain('<div class="header__search-group-title">Commandes</div>');
      expect(html).toContain('<div class="header__search-group-title">Utilisateurs</div>');
      expect(html).toContain('<div class="header__search-group-title">Demandes</div>');
      expect(html).toContain('<div class="header__search-group-title">Litiges</div>');

      // Commandes item
      expect(html).toContain('Commande #CMD-A9DB011E');
      expect(html).toContain('Client : Alice Martin · Réparateur : Bob Atelier');
      expect(html).toContain('href="/commandes/cmd-101"');
      expect(html).toContain('PAID');

      // Users item
      expect(html).toContain('Alice Martin');
      expect(html).toContain('alice@example.com');
      expect(html).toContain('href="/utilisateurs/usr-202"');
      expect(html).toContain('Client');

      // Demandes item
      expect(html).toContain('Réparation iPhone 13 Pro');
      expect(html).toContain('Écran cassé · Paris 11e');
      expect(html).toContain('href="/demandes/dmd-303"');
      expect(html).toContain('EN_ATTENTE');

      // Disputes item
      expect(html).toContain('Litige #LIT-0014');
      expect(html).toContain('Commande #CMD-A9DB011E · Écran fissuré');
      expect(html).toContain('href="/litiges?disputeId=disp-404"');
      expect(html).toContain('OPEN');
    });

    it('renders only Demandes when other groups are empty', () => {
      const demandesOnly: AdminSearchResult = {
        commandes: [],
        users: [],
        demandes: [
          {
            id: 'dmd-999',
            title: 'Changement batterie MacBook Air',
            subtitle: 'Batterie gonflée',
            badge: 'DEVIS_ENVOYE',
            href: '/demandes/dmd-999',
          },
        ],
        disputes: [],
      };

      const html = renderToString(
        <AdminHeader initialResults={demandesOnly} initialQuery="macbook" />,
      );

      expect(html).toContain('Demandes');
      expect(html).toContain('Changement batterie MacBook Air');
      expect(html).toContain('href="/demandes/dmd-999"');
      expect(html).not.toContain('<div class="header__search-group-title">Commandes</div>');
      expect(html).not.toContain('<div class="header__search-group-title">Utilisateurs</div>');
      expect(html).not.toContain('<div class="header__search-group-title">Litiges</div>');
    });

    it('renders empty state when no items exist across all 4 categories', () => {
      const emptyResults: AdminSearchResult = {
        commandes: [],
        users: [],
        demandes: [],
        disputes: [],
      };

      const html = renderToString(
        <AdminHeader initialResults={emptyResults} initialQuery="introuvable" />,
      );

      expect(html).toContain('Aucun résultat pour « introuvable »');
      expect(html).not.toContain('header__search-footer');
    });
  });

  describe('3. Footer Hub Link', () => {
    it('renders footer link pointing to /recherche?q=... when hasAnyResults is true', () => {
      const html = renderToString(
        <AdminHeader initialResults={mock4CategoryResults} initialQuery="vélo électrique" />,
      );

      expect(html).toContain('header__search-footer');
      expect(html).toContain('header__search-all-link');
      expect(html).toContain('href="/recherche?q=v%C3%A9lo%20%C3%A9lectrique"');
      expect(html).toContain('Voir tous les résultats pour « vélo électrique » →');
    });
  });

  describe('4. Enter Key Hub Navigation Handler', () => {
    it('navigates to /recherche?q=... on Enter key when query is non-empty', () => {
      const preventDefault = vi.fn();
      const setIsOpen = vi.fn();
      const mockRouter = { push: vi.fn() };

      const handled = handleSearchKeyDown(
        { key: 'Enter', preventDefault },
        '  écran iphone  ',
        mockRouter,
        setIsOpen,
      );

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(setIsOpen).toHaveBeenCalledWith(false);
      expect(mockRouter.push).toHaveBeenCalledWith('/recherche?q=%C3%A9cran%20iphone');
    });

    it('does not navigate on Enter key when query is whitespace only', () => {
      const preventDefault = vi.fn();
      const setIsOpen = vi.fn();
      const mockRouter = { push: vi.fn() };

      const handled = handleSearchKeyDown(
        { key: 'Enter', preventDefault },
        '    ',
        mockRouter,
        setIsOpen,
      );

      expect(handled).toBe(false);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).not.toHaveBeenCalled();
      expect(setIsOpen).not.toHaveBeenCalled();
    });

    it('ignores non-Enter key events', () => {
      const preventDefault = vi.fn();
      const setIsOpen = vi.fn();
      const mockRouter = { push: vi.fn() };

      const handled = handleSearchKeyDown(
        { key: 'ArrowDown', preventDefault },
        'macbook',
        mockRouter,
        setIsOpen,
      );

      expect(handled).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('5. ZERO Black Buttons & Badges Brand Compliance', () => {
    it('verifies that no buttons, badges, or links use black colors (#000000, rgb(0,0,0), black)', () => {
      const renderedHtmls = [
        renderToString(<AdminHeader />),
        renderToString(<AdminHeader initialResults={mock4CategoryResults} initialQuery="test" />),
        renderToString(
          <AdminHeader
            initialResults={{ commandes: [], users: [], demandes: [], disputes: [] }}
            initialQuery="vide"
          />,
        ),
      ];

      for (const html of renderedHtmls) {
        // Buttons
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

        // Links
        const linkMatches = html.match(/<a[^>]*>/gi) ?? [];
        for (const link of linkMatches) {
          const lower = link.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('background-color:rgb(0,0,0)');
          expect(lower).not.toContain('color:#000000');
          expect(lower).not.toContain('color:black');
          expect(lower).not.toContain('class="*black*"');
        }

        // Badges / spans
        const spanMatches = html.match(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>/gi) ?? [];
        for (const span of spanMatches) {
          const lower = span.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('color:#000000');
          expect(lower).not.toContain('color:black');
        }
      }
    });
  });
});
