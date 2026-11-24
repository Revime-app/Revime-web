import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  AdminNav,
  AdminNavCategories,
  NAV_CATEGORIES,
  LINKS,
  formatBadgeCount,
  actionBadgeTotal,
} from '../components/AdminNav';

// Mock next/navigation
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

let mockBadges = {
  litiges: 0,
  annulations: 0,
  attention: 0,
  signalements: 0,
  verifications: 0,
  equipe: 0,
};

describe('UI3: Sidebar Navigation 6 Categories & Notification Badges', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockBadges = {
      litiges: 0,
      annulations: 0,
      attention: 0,
      signalements: 0,
      verifications: 0,
      equipe: 0,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Category Structure & Destination Integrity', () => {
    it('defines exactly the 6 required categories in correct order', () => {
      const categoryIds = NAV_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toEqual([
        'pilotage',
        'operations',
        'finance',
        'utilisateurs',
        'contenu',
        'reglages',
      ]);

      const labels = NAV_CATEGORIES.map((c) => c.label);
      expect(labels).toEqual([
        'Pilotage',
        'Opérations',
        'Finance',
        'Utilisateurs',
        'Contenu',
        'Réglages',
      ]);
    });

    it('assigns operational queues with required action badge keys', () => {
      const operations = NAV_CATEGORIES.find((c) => c.id === 'operations');
      expect(operations).toBeDefined();

      const litiges = operations?.items.find((i) => i.href === '/litiges');
      const annulations = operations?.items.find((i) => i.href === '/annulations');
      const signalements = operations?.items.find((i) => i.href === '/signalements');
      const attention = operations?.items.find((i) => i.href === '/attention');

      expect(litiges?.badgeKey).toBe('litiges');
      expect(annulations?.badgeKey).toBe('annulations');
      expect(signalements?.badgeKey).toBe('signalements');
      expect(attention?.badgeKey).toBe('attention');

      const utilisateurs = NAV_CATEGORIES.find((c) => c.id === 'utilisateurs');
      const verifications = utilisateurs?.items.find((i) => i.href === '/verifications');
      expect(verifications?.badgeKey).toBe('verifications');
    });

    it('preserves all destinations in flat LINKS array (28 links)', () => {
      const allHrefs = LINKS.map((l) => l.href);
      expect(allHrefs).toEqual([
        '/',
        '/statistiques',
        '/alertes',
        '/litiges',
        '/annulations',
        '/signalements',
        '/attention',
        '/demandes',
        '/offres',
        '/colis',
        '/notifications',
        '/conversations',
        '/paiements',
        '/remboursements',
        '/remboursement',
        '/codes-promo',
        '/versements',
        '/exports',
        '/utilisateurs',
        '/equipe',
        '/verifications',
        '/avis',
        '/categories',
        '/conseils',
        '/reglages',
        '/parametres',
        '/conformite',
        '/audit',
      ]);
      expect(LINKS.length).toBe(28);
    });
  });

  describe('2. Badge Count Formatting & Cap', () => {
    it('hides badge when count is zero, undefined, or negative', () => {
      expect(formatBadgeCount(0)).toBeNull();
      expect(formatBadgeCount(undefined)).toBeNull();
      expect(formatBadgeCount(null)).toBeNull();
      expect(formatBadgeCount(-1)).toBeNull();
    });

    it('formats counts from 1 to 99 as plain numbers', () => {
      expect(formatBadgeCount(1)).toBe('1');
      expect(formatBadgeCount(42)).toBe('42');
      expect(formatBadgeCount(99)).toBe('99');
    });

    it('caps counts over 99 at 99+', () => {
      expect(formatBadgeCount(100)).toBe('99+');
      expect(formatBadgeCount(150)).toBe('99+');
      expect(formatBadgeCount(999)).toBe('99+');
    });
  });

  describe('3. Rendering & Markup Verification', () => {
    it('renders all 6 categories and destination links in SSR output', () => {
      const html = renderToString(<AdminNav />);

      // Brand logo
      expect(html).toContain('alt="Revime"');

      // 6 Category headers
      expect(html).toContain('Pilotage');
      expect(html).toContain('Opérations');
      expect(html).toContain('Finance');
      expect(html).toContain('Utilisateurs');
      expect(html).toContain('Contenu');
      expect(html).toContain('Réglages');

      // Key destinations
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/litiges"');
      expect(html).toContain('href="/annulations"');
      expect(html).toContain('href="/signalements"');
      expect(html).toContain('href="/attention"');
      expect(html).toContain('href="/verifications"');
      expect(html).toContain('href="/reglages"');
      expect(html).toContain('href="/parametres"');
      expect(html).toContain('href="/audit"');
    });

    it('renders aria-current on the active route link', () => {
      mockPathname = '/litiges';
      const html = renderToString(<AdminNavCategories />);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('href="/litiges"');
    });

    it('renders red badge pills with formatted counts on items requiring action', () => {
      const html = renderToString(
        <AdminNavCategories
          initialBadges={{
            litiges: 4,
            annulations: 2,
            signalements: 12,
            attention: 0,
            verifications: 105,
            equipe: 0,
          }}
        />,
      );

      // Badges with count > 0 should be rendered with class nav__badge
      expect(html).toContain('<span class="nav__badge" aria-label="4 en attente">4</span>');
      expect(html).toContain('<span class="nav__badge" aria-label="2 en attente">2</span>');
      expect(html).toContain('<span class="nav__badge" aria-label="12 en attente">12</span>');
      expect(html).toContain('<span class="nav__badge" aria-label="105 en attente">99+</span>');

      // Attention has 0, so no badge for attention
      expect(html).not.toContain('aria-label="0 en attente"');
    });

    it('draws the pending-invitations badge grey and out of every action total', () => {
      const html = renderToString(
        <AdminNavCategories
          initialBadges={{
            litiges: 0,
            annulations: 0,
            signalements: 0,
            attention: 0,
            verifications: 0,
            equipe: 3,
          }}
        />,
      );
      expect(html).toContain(
        '<span class="nav__badge nav__badge--info" aria-label="3 en attente">3</span>',
      );
      // « Rouge = une action est attendue. Gris = simple information. »: grey adds to no total.
      const utilisateurs = NAV_CATEGORIES.find((c) => c.id === 'utilisateurs')!;
      expect(actionBadgeTotal(utilisateurs.items, { equipe: 3, verifications: 2 })).toBe(2);
      expect(actionBadgeTotal(LINKS, { litiges: 4, equipe: 3 })).toBe(4);
    });

    it('ensures each category header aria-controls points to an existing ul id in the DOM', () => {
      const html = renderToString(<AdminNavCategories />);
      for (const category of NAV_CATEGORIES) {
        expect(html).toContain(`aria-controls="nav-category-${category.id}"`);
        expect(html).toContain(`id="nav-category-${category.id}"`);
      }
    });
  });
});
