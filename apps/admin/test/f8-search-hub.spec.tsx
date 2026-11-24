import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ROUTE_TITLES, getPageTitle } from '../components/AdminNav';
import { RechercheView } from '../app/recherche/page';
import type { AdminSearchDetailedResponse, AdminSearchCategory } from '@revime/shared';

let mockPathname = '/recherche';
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockDetailedResponse: AdminSearchDetailedResponse = {
  query: 'iphone',
  category: 'all',
  total: 4,
  counts: {
    all: 4,
    commandes: 1,
    users: 1,
    demandes: 1,
    disputes: 1,
  },
  items: [
    {
      id: 'cmd-001',
      title: 'Commande #CMD-A9DB011E',
      subtitle: 'Client : Alice Martin · Réparateur : Bob Atelier',
      badge: 'PAID',
      href: '/commandes/cmd-001',
      category: 'commande',
      snippet: 'Réparation connecteur de charge iPhone 13',
      createdAt: '2026-10-10T14:30:00.000Z',
    },
    {
      id: 'usr-002',
      title: 'Alice Martin',
      subtitle: 'alice.martin@example.com',
      badge: 'Client',
      href: '/utilisateurs/usr-002',
      category: 'user',
      snippet: 'Compte actif · 3 commandes',
      createdAt: '2026-09-15T09:00:00.000Z',
    },
    {
      id: 'dmd-003',
      title: 'Écran cassé iPhone 13',
      subtitle: 'Demandeur : Alice Martin · Paris 11e',
      badge: 'EN_ATTENTE',
      href: '/demandes/dmd-003',
      category: 'demande',
      snippet: 'Vitre tactile fissurée suite à une chute',
      createdAt: '2026-10-12T11:20:00.000Z',
    },
    {
      id: 'disp-004',
      title: 'Litige #LIT-0014',
      subtitle: 'Commande #CMD-A9DB011E · Écran mal fixé',
      badge: 'OPEN',
      href: '/litiges?disputeId=disp-004',
      category: 'dispute',
      snippet: 'Le client signale que le nouvel écran se décolle',
      createdAt: '2026-10-14T16:45:00.000Z',
    },
  ],
  page: 1,
  limit: 20,
};

const mockEmptyResponse: AdminSearchDetailedResponse = {
  query: 'termeinexistant123',
  category: 'all',
  total: 0,
  counts: {
    all: 0,
    commandes: 0,
    users: 0,
    demandes: 0,
    disputes: 0,
  },
  items: [],
  page: 1,
  limit: 20,
};

const mockPaginatedResponse: AdminSearchDetailedResponse = {
  query: 'batterie',
  category: 'commandes',
  total: 45,
  counts: {
    all: 60,
    commandes: 45,
    users: 5,
    demandes: 8,
    disputes: 2,
  },
  items: Array.from({ length: 20 }, (_, i) => ({
    id: `cmd-${i + 1}`,
    title: `Commande #CMD-BAT-${String(i + 1).padStart(3, '0')}`,
    subtitle: `Remplacement batterie ${i + 1}`,
    badge: 'CONFIRMED',
    href: `/commandes/cmd-${i + 1}`,
    category: 'commande',
    snippet: `Batterie lithium remplacement standard #${i + 1}`,
    createdAt: '2026-10-15T10:00:00.000Z',
  })),
  page: 1,
  limit: 20,
};

describe('Feature F8 Task 4: Dedicated Search Hub Page (/recherche)', () => {
  beforeEach(() => {
    mockPathname = '/recherche';
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Route Navigation Title Registration', () => {
    it('registers /recherche in ROUTE_TITLES with title "Recherche globale"', () => {
      expect(ROUTE_TITLES['/recherche']).toBe('Recherche globale');
      expect(getPageTitle('/recherche')).toBe('Recherche globale');
    });
  });

  describe('2. Page Structure & Breadcrumbs', () => {
    it('renders detail page shell, breadcrumbs trail, and main heading', () => {
      const html = renderToString(
        <RechercheView initialData={mockDetailedResponse} initialQuery="iphone" />,
      );

      // Wrapper
      expect(html).toContain('page page--detail');

      // Breadcrumbs
      expect(html).toContain('breadcrumbs');
      expect(html).toContain('Accueil');
      expect(html).toContain('href="/"');
      expect(html).toContain('Recherche globale');

      // Title
      expect(html).toContain('<h1 class="search-hub__title">Recherche globale</h1>');
    });
  });

  describe('3. Search Input Form & Query Sync', () => {
    it('renders search input with value, submit button, and clear action', () => {
      const html = renderToString(
        <RechercheView initialData={mockDetailedResponse} initialQuery="iphone" />,
      );

      expect(html).toContain('value="iphone"');
      expect(html).toContain('Rechercher');
      expect(html).toContain('aria-label="Effacer la recherche"');
    });

    it('does not render clear button when query is empty', () => {
      const html = renderToString(
        <RechercheView initialData={null} initialQuery="" />,
      );

      expect(html).not.toContain('aria-label="Effacer la recherche"');
    });
  });

  describe('4. Segmented Category Tabs with Count Chips', () => {
    it('renders 5 tabs (Tous, Commandes, Utilisateurs, Demandes, Litiges) with counts and active highlighting', () => {
      const html = renderToString(
        <RechercheView
          initialData={mockDetailedResponse}
          initialQuery="iphone"
          initialCategory="all"
        />,
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Tous');
      expect(html).toContain('Commandes');
      expect(html).toContain('Utilisateurs');
      expect(html).toContain('Demandes');
      expect(html).toContain('Litiges');

      // Category icons
      expect(html).toContain('lucide-search');
      expect(html).toContain('lucide-package');
      expect(html).toContain('lucide-user');
      expect(html).toContain('lucide-wrench');
      expect(html).toContain('lucide-scale');

      // Count chips
      expect(html).toContain('(4)');
      expect(html).toContain('(1)');

      // Active tab
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('search-hub__tab--active');
    });

    it('sets aria-selected="true" on selected category tab', () => {
      const html = renderToString(
        <RechercheView
          initialData={{ ...mockDetailedResponse, category: 'demandes' }}
          initialQuery="iphone"
          initialCategory="demandes"
        />,
      );

      // Demandes should be active
      expect(html).toContain('data-category="demandes"');
      expect(html).toMatch(/data-category="demandes"[^>]*aria-selected="true"/);
    });
  });

  describe('5. Result Cards & Deep Link Actions', () => {
    it('renders summary indicator with total count and query', () => {
      const html = renderToString(
        <RechercheView initialData={mockDetailedResponse} initialQuery="iphone" />,
      );

      expect(html).toContain('4');
      expect(html).toContain('résultats trouvés pour');
      expect(html).toContain('iphone');
    });

    it('renders cards for each entity with category icon, status badge, title, snippet, and CTA link', () => {
      const html = renderToString(
        <RechercheView initialData={mockDetailedResponse} initialQuery="iphone" />,
      );

      // Commande card
      expect(html).toContain('Commande #CMD-A9DB011E');
      expect(html).toContain('PAID');
      expect(html).toContain('href="/commandes/cmd-001"');
      expect(html).toContain('Réparation connecteur de charge iPhone 13');

      // User card
      expect(html).toContain('Alice Martin');
      expect(html).toContain('Client');
      expect(html).toContain('href="/utilisateurs/usr-002"');

      // Demande card
      expect(html).toContain('Écran cassé iPhone 13');
      expect(html).toContain('EN_ATTENTE');
      expect(html).toContain('href="/demandes/dmd-003"');

      // Dispute card
      expect(html).toContain('Litige #LIT-0014');
      expect(html).toContain('OPEN');
      expect(html).toContain('href="/litiges?disputeId=disp-004"');

      // CTA buttons / links
      expect(html).toContain('Voir les détails →');
    });
  });

  describe('6. Pagination Controls', () => {
    it('renders pagination bar when total exceeds page limit', () => {
      const html = renderToString(
        <RechercheView
          initialData={mockPaginatedResponse}
          initialQuery="batterie"
          initialCategory="commandes"
          initialPage={1}
        />,
      );

      expect(html).toContain('Précédent');
      expect(html).toContain('Page 1 sur 3');
      expect(html).toContain('Suivant');
    });

    it('disables Précédent button on page 1', () => {
      const html = renderToString(
        <RechercheView
          initialData={mockPaginatedResponse}
          initialQuery="batterie"
          initialCategory="commandes"
          initialPage={1}
        />,
      );

      expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Précédent/);
    });

    it('disables Suivant button on the last page', () => {
      const html = renderToString(
        <RechercheView
          initialData={{ ...mockPaginatedResponse, page: 3 }}
          initialQuery="batterie"
          initialCategory="commandes"
          initialPage={3}
        />,
      );

      expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Suivant/);
    });

    it('does not render pagination when total is less than or equal to limit', () => {
      const html = renderToString(
        <RechercheView initialData={mockDetailedResponse} initialQuery="iphone" />,
      );

      expect(html).not.toContain('Page 1 sur');
    });
  });

  describe('7. Empty State with French Search Guidance', () => {
    it('renders helpful empty state and advice tips when query matches 0 results', () => {
      const html = renderToString(
        <RechercheView initialData={mockEmptyResponse} initialQuery="termeinexistant123" />,
      );

      expect(html).toContain('Aucun résultat trouvé pour « termeinexistant123 »');
      expect(html).toContain('Vérifiez l&#x27;orthographe des termes saisis.');
      expect(html).toContain('Essayez des mots-clés plus généraux.');
      expect(html).toContain(
        'Recherchez directement par identifiant (#CMD-..., #LIT-...) ou adresse e-mail.',
      );
    });
  });

  describe('8. Zero Search State (Initial / Empty Query)', () => {
    it('renders welcoming prompt when no query is entered yet', () => {
      const html = renderToString(
        <RechercheView initialData={null} initialQuery="" />,
      );

      expect(html).toContain(
        'Saisissez un terme de recherche pour explorer les commandes, utilisateurs, demandes et litiges.',
      );
    });
  });

  describe('9. Automated ZERO Black Buttons & Brand Compliance Scanner', () => {
    it('verifies ZERO buttons, badges, or links contain black (#000000, black, rgb(0,0,0))', () => {
      const states = [
        <RechercheView
          key="results"
          initialData={mockDetailedResponse}
          initialQuery="iphone"
          initialCategory="all"
        />,
        <RechercheView
          key="empty"
          initialData={mockEmptyResponse}
          initialQuery="vide"
          initialCategory="commandes"
        />,
        <RechercheView
          key="pagination"
          initialData={mockPaginatedResponse}
          initialQuery="batterie"
          initialCategory="commandes"
          initialPage={1}
        />,
        <RechercheView
          key="zero"
          initialData={null}
          initialQuery=""
        />,
      ];

      for (const view of states) {
        const html = renderToString(view);

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
          expect(lower).not.toContain('color: rgb(0, 0, 0)');
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

        // Badges
        const badgeMatches = html.match(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>/gi) ?? [];
        for (const badge of badgeMatches) {
          const lower = badge.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('color:#000000');
          expect(lower).not.toContain('color:black');
        }
      }
    });
  });
});
