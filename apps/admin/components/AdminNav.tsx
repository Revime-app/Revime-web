'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminBadgeCounts } from '@revime/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon } from './Icon';

export type NavItem = {
  href: string;
  label: string;
  badgeKey?: keyof AdminBadgeCounts;
  /** `info` badges are grey and never count towards the category total or the tab title. */
  badgeKind?: 'action' | 'info';
};

export type NavCategory = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * UI3: Reorganized navigation hierarchy into 6 functional categories.
 * Badge indicators highlight operational queues with action items requiring attention.
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    items: [
      { href: '/', label: 'Tableau de bord' },
      { href: '/statistiques', label: 'Statistiques' },
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    items: [
      { href: '/alertes', label: 'Alertes opérationnelles' },
      { href: '/litiges', label: 'Litiges', badgeKey: 'litiges' },
      { href: '/annulations', label: 'Annulations', badgeKey: 'annulations' },
      { href: '/signalements', label: 'Signalements', badgeKey: 'signalements' },
      { href: '/attention', label: 'Commandes à surveiller', badgeKey: 'attention' },
      { href: '/demandes', label: 'Demandes' },
      { href: '/offres', label: 'Offres' },
      { href: '/colis', label: 'Étiquettes colis' },
      { href: '/notifications', label: 'Notifications & e-mails' },
      { href: '/conversations', label: 'Conversations' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { href: '/paiements', label: 'Paiements' },
      { href: '/remboursements', label: 'Remboursements' },
      { href: '/remboursement', label: 'Remboursement manuel' },
      { href: '/codes-promo', label: 'Codes promo & parrainage' },
      { href: '/versements', label: 'Versements réparateurs' },
      { href: '/exports', label: 'Exports comptables' },
    ],
  },
  {
    id: 'utilisateurs',
    label: 'Utilisateurs',
    items: [
      { href: '/utilisateurs', label: 'Utilisateurs' },
      { href: '/equipe', label: 'Équipe', badgeKey: 'equipe', badgeKind: 'info' },
      { href: '/verifications', label: 'Vérifications', badgeKey: 'verifications' },
      { href: '/avis', label: 'Avis' },
    ],
  },
  {
    id: 'contenu',
    label: 'Contenu',
    items: [
      { href: '/categories', label: 'Catégories' },
      { href: '/conseils', label: 'Conseils du jour' },
    ],
  },
  {
    id: 'reglages',
    label: 'Réglages',
    items: [
      { href: '/reglages', label: 'Réglages plateforme' },
      { href: '/parametres', label: 'Paramètres' },
      { href: '/conformite', label: 'Conformité' },
      { href: '/audit', label: "Journal d'audit" },
    ],
  },
];

/**
 * Backward compatibility: flat list of all destinations preserves existing routes and tests.
 */
export const LINKS = NAV_CATEGORIES.flatMap((c) => c.items);

/** The badges that mean « an action is expected »: the only ones a category total or the tab title adds up. */
export function actionBadgeTotal(items: NavItem[], badges: Partial<AdminBadgeCounts>): number {
  return items.reduce((sum, item) => {
    if (!item.badgeKey || item.badgeKind === 'info') return sum;
    return sum + (badges[item.badgeKey] ?? 0);
  }, 0);
}

export function formatBadgeCount(count: number | undefined | null): string | null {
  if (!count || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export const ROUTE_TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/statistiques': 'Statistiques',
  '/alertes': 'Alertes opérationnelles',
  '/litiges': 'Litiges',
  '/annulations': 'Annulations',
  '/signalements': 'Signalements',
  '/attention': 'Commandes à surveiller',
  '/demandes': 'Demandes',
  '/offres': 'Offres',
  '/colis': 'Étiquettes colis',
  '/notifications': 'Notifications & e-mails',
  '/conversations': 'Conversations',
  '/paiements': 'Paiements',
  '/remboursements': 'Remboursements',
  '/remboursement': 'Remboursement manuel',
  '/codes-promo': 'Codes promo & parrainage',
  '/versements': 'Versements réparateurs',
  '/exports': 'Exports comptables',
  '/utilisateurs': 'Utilisateurs',
  '/equipe': 'Équipe',
  '/verifications': 'Vérifications',
  '/avis': 'Avis',
  '/categories': 'Catégories',
  '/conseils': 'Conseils du jour',
  '/reglages': 'Réglages plateforme',
  '/parametres': 'Paramètres',
  '/conformite': 'Conformité',
  '/audit': "Journal d'audit",
  '/securite': 'Sécurité',
  '/login': 'Connexion',
  '/invitation': 'Invitation',
  '/recherche': 'Recherche globale',
};

export function getPageTitle(pathname: string | null | undefined): string {
  if (!pathname) return 'Tableau de bord';
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/utilisateurs/')) return 'Utilisateur';
  if (pathname.startsWith('/demandes/')) return 'Demande';
  if (pathname.startsWith('/signalements/')) return 'Signalement';
  if (pathname.startsWith('/commandes/')) return 'Commande';
  // A nested page of a listed section is titled by its section, never by the dashboard.
  const section = `/${pathname.split('/')[1] ?? ''}`;
  return ROUTE_TITLES[section] ?? 'Administration';
}

export function formatTabTitle(pageTitle: string, badgeTotal?: number): string {
  const prefix = badgeTotal && badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) ` : '';
  return `${prefix}${pageTitle} · Revime Admin`;
}

export function useAdminBadges({ enabled = true }: { enabled?: boolean } = {}) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<AdminBadgeCounts>({
    litiges: 0,
    annulations: 0,
    attention: 0,
    signalements: 0,
    verifications: 0,
    equipe: 0,
  });

  // UI4: Page-specific tab titles synchronized with badge totals
  useEffect(() => {
    document.title = formatTabTitle(
      getPageTitle(pathname),
      actionBadgeTotal(NAV_CATEGORIES.flatMap((c) => c.items), badges),
    );
  }, [pathname, badges]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const fetchBadges = async () => {
      // A hidden tab does not need its sidebar fresh; the focus listener refreshes it on return.
      if (document.hidden) return;
      try {
        const res = await fetch('/api/proxy/admin/badge-counts', {
          credentials: 'same-origin',
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as AdminBadgeCounts;
          setBadges(data);
        }
      } catch {
        // network error / signed out / background failure: ignore silently
      }
    };

    void fetchBadges();
    const interval = setInterval(() => { void fetchBadges(); }, 60_000);
    const onFocus = () => { void fetchBadges(); };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      if (typeof document !== 'undefined') {
        document.title = 'Revime Admin';
      }
    };
  }, [enabled]);

  return badges;
}

/** ISS-128: chevron-up while a sidebar category is open, chevron-down while it is closed. */
export function NavCategoryChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <span className="nav__category-chevron">
      <Icon as={collapsed ? ChevronDown : ChevronUp} size={14} />
    </span>
  );
}

export function AdminNavCategories({
  initialBadges,
  initialCollapsed = {},
}: { initialBadges?: AdminBadgeCounts; initialCollapsed?: Record<string, boolean> } = {}) {
  const pathname = usePathname();
  const fetchedBadges = useAdminBadges({ enabled: !initialBadges });
  const badges = initialBadges ?? fetchedBadges;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);

  const toggleCategory = (catId: string) => {
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="nav__categories">
      {NAV_CATEGORIES.map((category) => {
        const isCollapsed = Boolean(collapsed[category.id]);
        const hasActivePage = category.items.some((item) => item.href === pathname);
        const categoryBadgeSum = actionBadgeTotal(category.items, badges);
        const categoryBadgeFormatted = formatBadgeCount(categoryBadgeSum);

        return (
          <div key={category.id} className="nav__category" data-category={category.id}>
            <button
              type="button"
              className={`nav__category-header ${hasActivePage && isCollapsed ? 'nav__category-header--has-active' : ''}`}
              onClick={() => toggleCategory(category.id)}
              aria-expanded={!isCollapsed}
              aria-controls={`nav-category-${category.id}`}
            >
              <span className="nav__category-title">
                <NavCategoryChevron collapsed={isCollapsed} />
                <span>{category.label}</span>
              </span>
              {isCollapsed && categoryBadgeFormatted && (
                <span
                  className="nav__badge nav__badge--category"
                  aria-label={`${categoryBadgeSum} action(s) requise(s)`}
                >
                  {categoryBadgeFormatted}
                </span>
              )}
            </button>

            <ul
              id={`nav-category-${category.id}`}
              className="nav__category-list"
              hidden={isCollapsed}
            >
              {category.items.map((item) => {
                const badgeValue = item.badgeKey ? badges[item.badgeKey] : undefined;
                const formattedBadge = formatBadgeCount(badgeValue);
                const isActive = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      className="nav__link"
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="nav__link-label">{item.label}</span>
                      {formattedBadge && (
                        <span
                          className={`nav__badge${item.badgeKind === 'info' ? ' nav__badge--info' : ''}`}
                          aria-label={`${badgeValue} en attente`}
                        >
                          {formattedBadge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  // The login and invitation screens have no navigation: they are reachable by a signed-out visitor, and a
  // sidebar of admin destinations would be an affordance they cannot use.
  if (pathname === '/login' || pathname === '/invitation') return null;

  return (
    <nav className="nav" aria-label="Navigation de l'administration">
      <div className="nav__brand">
        <Link href="/" aria-label="Revime - Tableau de bord">
          <img
            src="/brand/revime-logo-white.png"
            alt="Revime"
            width={146}
            height={26}
            className="nav__logo"
          />
        </Link>
      </div>
      <AdminNavCategories />
    </nav>
  );
}
