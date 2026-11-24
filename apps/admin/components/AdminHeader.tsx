'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_ROLE_LABEL, type AdminSearchResult } from '@revime/shared';
import { signOut, useSession } from '../lib/auth-client';
import { useAdminMe } from './AdminGate';
import { AdminAlertBell } from './AdminAlertBell';
import { ThemeToggle } from './ThemeToggle';
import { Hourglass, Search } from 'lucide-react';
import { Icon } from './Icon';

export type AdminHeaderProps = {
  initialResults?: AdminSearchResult | null;
  initialQuery?: string;
};

/**
 * Handles Enter key navigation to the dedicated /recherche?q=... hub.
 */
export function handleSearchKeyDown(
  e: { key: string; preventDefault: () => void },
  query: string,
  router: { push: (url: string) => void },
  setIsOpen: (open: boolean) => void,
): boolean {
  if (e.key === 'Enter') {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setIsOpen(false);
      router.push(`/recherche?q=${encodeURIComponent(trimmed)}`);
      return true;
    }
  }
  return false;
}

/**
 * UI4: Admin top header bar featuring:
 * 1. Global search (commandes, utilisateurs, demandes, litiges; Ctrl+K) with instant categorized dropdown.
 * 2. Authenticated operator name and role badge.
 * 3. Logout action.
 */
export function AdminHeader({ initialResults, initialQuery = '' }: AdminHeaderProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const me = useAdminMe();

  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(Boolean(initialResults));
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AdminSearchResult | null>(initialResults ?? null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K / Cmd+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLoading(false);
      if (!initialResults) {
        setResults(null);
        setIsOpen(false);
      }
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/admin/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as AdminSearchResult;
          setResults(data);
          setIsOpen(true);
        }
      } catch {
        // network failure, abort, or background cancellation
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, initialResults]);

  if (pathname === '/login' || pathname === '/invitation') {
    return null;
  }

  const user = session?.user;
  const userName = user?.name || user?.email || 'Administrateur';
  const roleName = me?.role ? ADMIN_ROLE_LABEL[me.role] || me.role : 'Équipe Revime';

  const hasCommandes = (results?.commandes?.length ?? 0) > 0;
  const hasUsers = (results?.users?.length ?? 0) > 0;
  const hasDemandes = (results?.demandes?.length ?? 0) > 0;
  const hasDisputes = (results?.disputes?.length ?? 0) > 0;
  const hasAnyResults = hasCommandes || hasUsers || hasDemandes || hasDisputes;

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <header className="header" role="banner">
      <div className="header__search" ref={containerRef}>
        <div className="header__search-input-wrapper">
          <span className="header__search-icon" aria-hidden="true">
            <Icon as={Search} />
          </span>
          <input
            ref={inputRef}
            type="search"
            className="header__search-input"
            placeholder="Rechercher commande, utilisateur, demande, litige... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => handleSearchKeyDown(e, query, router, setIsOpen)}
            onFocus={() => {
              if (results && (hasAnyResults || query.trim().length >= 2)) {
                setIsOpen(true);
              }
            }}
            aria-label="Recherche globale"
            aria-expanded={isOpen}
            aria-controls="header-search-results"
          />
          {loading && <span className="header__search-spinner" aria-label="Chargement..."><Icon as={Hourglass} /></span>}
        </div>

        {isOpen && (
          <div id="header-search-results" className="header__search-dropdown" role="region" aria-label="Résultats de recherche">
            {hasAnyResults ? (
              <div className="header__search-results">
                {hasCommandes && (
                  <div className="header__search-group">
                    <div className="header__search-group-title">Commandes</div>
                    <ul className="header__search-list">
                      {results?.commandes.map((item) => (
                        <li key={item.id} className="header__search-item">
                          <Link
                            href={`/commandes/${encodeURIComponent(item.id)}`}
                            className="header__search-link"
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="header__search-item-info">
                              <span className="header__search-item-title">{item.title}</span>
                              {item.subtitle && (
                                <span className="header__search-item-subtitle">{item.subtitle}</span>
                              )}
                            </div>
                            {item.badge && <span className="header__search-item-badge">{item.badge}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {hasUsers && (
                  <div className="header__search-group">
                    <div className="header__search-group-title">Utilisateurs</div>
                    <ul className="header__search-list">
                      {results?.users.map((item) => (
                        <li key={item.id} className="header__search-item">
                          <Link
                            href={item.href}
                            className="header__search-link"
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="header__search-item-info">
                              <span className="header__search-item-title">{item.title}</span>
                              {item.subtitle && (
                                <span className="header__search-item-subtitle">{item.subtitle}</span>
                              )}
                            </div>
                            {item.badge && <span className="header__search-item-badge">{item.badge}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {hasDemandes && (
                  <div className="header__search-group">
                    <div className="header__search-group-title">Demandes</div>
                    <ul className="header__search-list">
                      {results?.demandes.map((item) => (
                        <li key={item.id} className="header__search-item">
                          <Link
                            href={item.href}
                            className="header__search-link"
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="header__search-item-info">
                              <span className="header__search-item-title">{item.title}</span>
                              {item.subtitle && (
                                <span className="header__search-item-subtitle">{item.subtitle}</span>
                              )}
                            </div>
                            {item.badge && <span className="header__search-item-badge">{item.badge}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {hasDisputes && (
                  <div className="header__search-group">
                    <div className="header__search-group-title">Litiges</div>
                    <ul className="header__search-list">
                      {results?.disputes.map((item) => (
                        <li key={item.id} className="header__search-item">
                          <Link
                            href={item.href}
                            className="header__search-link"
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="header__search-item-info">
                              <span className="header__search-item-title">{item.title}</span>
                              {item.subtitle && (
                                <span className="header__search-item-subtitle">{item.subtitle}</span>
                              )}
                            </div>
                            {item.badge && <span className="header__search-item-badge">{item.badge}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="header__search-footer">
                  <Link
                    href={`/recherche?q=${encodeURIComponent(query.trim())}`}
                    className="header__search-all-link"
                    onClick={() => setIsOpen(false)}
                  >
                    {`Voir tous les résultats pour « ${query.trim()} » →`}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="header__search-empty">
                {`Aucun résultat pour « ${query.trim()} »`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="header__actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
        <ThemeToggle />
        <AdminAlertBell />
      </div>

      <div className="header__profile">
        <div className="header__user-info">
          <span className="header__user-name" title={userName}>
            {userName}
          </span>
          <span className="header__user-role">{roleName}</span>
        </div>

        <button
          type="button"
          className="header__logout-btn"
          onClick={handleLogout}
          aria-label="Se déconnecter"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
