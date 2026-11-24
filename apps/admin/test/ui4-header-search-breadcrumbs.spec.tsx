import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminHeader } from '../components/AdminHeader';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { getPageTitle, formatTabTitle, ROUTE_TITLES } from '../components/AdminNav';
import type { AdminSearchResult } from '@revime/shared';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

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

let mockMe: { role: string } | null = { role: 'super_admin' };
vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => mockMe,
}));

describe('UI4: Header, Global Search, Tab Titles & Breadcrumbs', () => {
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
    mockMe = { role: 'super_admin' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Breadcrumbs Component', () => {
    it('returns null when items array is empty', () => {
      const html = renderToString(<Breadcrumbs items={[]} />);
      expect(html).toBe('');
    });

    it('renders accessible breadcrumbs navigation with links and current leaf page', () => {
      const html = renderToString(
        <Breadcrumbs
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Utilisateurs', href: '/utilisateurs' },
            { label: 'Jean Dupont' },
          ]}
        />,
      );

      expect(html).toContain('aria-label="Fil d&#x27;Ariane"');
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/utilisateurs"');
      expect(html).toContain('<span class="breadcrumbs__current" aria-current="page">Jean Dupont</span>');
      expect(html).toContain('<span class="breadcrumbs__separator" aria-hidden="true">/</span>');
    });
  });

  describe('2. Page Tab Title Synchronization', () => {
    it('resolves correct titles across static and dynamic routes', () => {
      expect(getPageTitle('/')).toBe('Tableau de bord');
      expect(getPageTitle('/litiges')).toBe('Litiges');
      expect(getPageTitle('/paiements')).toBe('Paiements');
      expect(getPageTitle('/parametres')).toBe('Paramètres');
      expect(getPageTitle('/statistiques')).toBe('Statistiques');

      // Dynamic detail views
      expect(getPageTitle('/utilisateurs/usr-123')).toBe('Utilisateur');
      expect(getPageTitle('/demandes/dmd-456')).toBe('Demande');
      expect(getPageTitle('/signalements/rep-789')).toBe('Signalement');
      expect(getPageTitle('/commandes/cmd-1')).toBe('Commande');
    });

    it('titles a nested page by its section and an unknown page never as the dashboard', () => {
      expect(getPageTitle('/litiges/anything')).toBe('Litiges');
      expect(getPageTitle('/versements/2026-09')).toBe('Versements réparateurs');
      expect(getPageTitle('/page-inconnue')).toBe('Administration');
    });

    it('formats document.title with and without active notification badges', () => {
      // 0 badges
      expect(formatTabTitle('Litiges', 0)).toBe('Litiges · Revime Admin');
      expect(formatTabTitle('Tableau de bord', undefined)).toBe('Tableau de bord · Revime Admin');

      // With pending badges
      expect(formatTabTitle('Litiges', 4)).toBe('(4) Litiges · Revime Admin');
      expect(formatTabTitle('Paiements', 42)).toBe('(42) Paiements · Revime Admin');

      // Capped above 99
      expect(formatTabTitle('Utilisateurs', 105)).toBe('(99+) Utilisateurs · Revime Admin');
    });
  });

  describe('3. AdminHeader Component', () => {
    it('renders global search input, operator profile name, role badge, and logout button', () => {
      const html = renderToString(<AdminHeader />);

      // Search input
      expect(html).toContain('aria-label="Recherche globale"');
      expect(html).toContain('placeholder="Rechercher commande, utilisateur, demande, litige... (Ctrl+K)"');

      // Operator info
      expect(html).toContain('Malek Klimane');
      expect(html).toContain('Super administrateur');

      // Logout button
      expect(html).toContain('Déconnexion');
      expect(html).toContain('aria-label="Se déconnecter"');
    });

    it('returns null on login and invitation screens', () => {
      mockPathname = '/login';
      expect(renderToString(<AdminHeader />)).toBe('');

      mockPathname = '/invitation';
      expect(renderToString(<AdminHeader />)).toBe('');
    });

    it('renders categorized search results dropdown with items for Commandes, Utilisateurs, and Litiges', () => {
      const searchResults: AdminSearchResult = {
        commandes: [
          {
            id: 'cmd-1',
            title: 'Commande #CMD-A9DB011E',
            subtitle: 'Client : Alice Martin · Réparateur : Bob Réparateur',
            badge: 'PAID',
            href: '/demandes/dmd-1',
          },
        ],
        users: [
          {
            id: 'usr-1',
            title: 'Alice Martin',
            subtitle: 'alice@example.com',
            badge: 'Client',
            href: '/utilisateurs/usr-1',
          },
        ],
        demandes: [],
        disputes: [
          {
            id: 'disp-1',
            title: 'Litige #LIT-0014',
            subtitle: 'Commande #CMD-A9DB011E · Écran fissuré',
            badge: 'OPEN',
            href: '/litiges?disputeId=disp-1',
          },
        ],
      };

      const html = renderToString(<AdminHeader initialResults={searchResults} />);

      // Section headers
      expect(html).toContain('Commandes');
      expect(html).toContain('Utilisateurs');
      expect(html).toContain('Litiges');

      // Commande item
      expect(html).toContain('Commande #CMD-A9DB011E');
      expect(html).toContain('Client : Alice Martin · Réparateur : Bob Réparateur');
      expect(html).toContain('href="/commandes/cmd-1"');

      // User item
      expect(html).toContain('Alice Martin');
      expect(html).toContain('alice@example.com');
      expect(html).toContain('href="/utilisateurs/usr-1"');

      // Dispute item
      expect(html).toContain('Litige #LIT-0014');
      expect(html).toContain('Commande #CMD-A9DB011E · Écran fissuré');
      expect(html).toContain('href="/litiges?disputeId=disp-1"');
    });

    it('renders empty message when no items match the search query', () => {
      const emptyResults: AdminSearchResult = {
        commandes: [],
        users: [],
        demandes: [],
        disputes: [],
      };

      const html = renderToString(<AdminHeader initialResults={emptyResults} />);
      expect(html).toContain('Aucun résultat');
    });
  });
});
