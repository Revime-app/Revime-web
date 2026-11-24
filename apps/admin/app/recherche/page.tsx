'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminSearchCategory,
  AdminSearchDetailedItem,
  AdminSearchDetailedResponse,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Package, Scale, Search, User, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../../components/Icon';

const CATEGORIES: AdminSearchCategory[] = [
  'all',
  'commandes',
  'users',
  'demandes',
  'disputes',
];

const CATEGORY_META: Record<AdminSearchCategory, { label: string; icon: LucideIcon }> = {
  all: { label: 'Tous', icon: Search },
  commandes: { label: 'Commandes', icon: Package },
  users: { label: 'Utilisateurs', icon: User },
  demandes: { label: 'Demandes', icon: Wrench },
  disputes: { label: 'Litiges', icon: Scale },
};

const ITEM_CATEGORY_META: Record<
  'commande' | 'user' | 'demande' | 'dispute',
  { label: string; icon: LucideIcon }
> = {
  commande: { label: 'Commande', icon: Package },
  user: { label: 'Utilisateur', icon: User },
  demande: { label: 'Demande', icon: Wrench },
  dispute: { label: 'Litige', icon: Scale },
};

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}

export interface RechercheViewProps {
  initialData?: AdminSearchDetailedResponse | null;
  initialQuery?: string;
  initialCategory?: AdminSearchCategory;
  initialPage?: number;
  initialLoading?: boolean;
}

export function RechercheView({
  initialData = null,
  initialQuery = '',
  initialCategory = 'all',
  initialPage = 1,
  initialLoading = false,
}: RechercheViewProps) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [category, setCategory] = useState<AdminSearchCategory>(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<AdminSearchDetailedResponse | null>(initialData);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);

  // Sync internal state when props change
  useEffect(() => {
    setQuery(initialQuery);
    setSearchInput(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  useEffect(() => {
    if (initialData !== undefined) {
      setData(initialData);
    }
  }, [initialData]);

  // Execute search against /api/proxy/admin/search/detailed
  const executeSearch = useCallback(
    async (q: string, cat: AdminSearchCategory, p: number) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = `/api/proxy/admin/search/detailed?q=${encodeURIComponent(
          trimmed,
        )}&category=${encodeURIComponent(cat)}&page=${p}&limit=20`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Erreur lors de la récupération des résultats');
        }
        const json = (await res.json()) as AdminSearchDetailedResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur réseau');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Trigger search if no initialData provided and query exists
  useEffect(() => {
    if (initialData === undefined && query.trim()) {
      void executeSearch(query, category, page);
    }
  }, [query, category, page, initialData, executeSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setQuery(trimmed);
    setPage(1);
    router.push(
      `/recherche?q=${encodeURIComponent(trimmed)}&category=${encodeURIComponent(
        category,
      )}&page=1`,
    );
    if (trimmed) {
      void executeSearch(trimmed, category, 1);
    } else {
      setData(null);
    }
  };

  const handleClear = () => {
    setSearchInput('');
    setQuery('');
    setData(null);
    setPage(1);
    router.push(`/recherche?category=${encodeURIComponent(category)}&page=1`);
  };

  const handleCategoryChange = (newCat: AdminSearchCategory) => {
    setCategory(newCat);
    setPage(1);
    if (query.trim()) {
      router.push(
        `/recherche?q=${encodeURIComponent(query.trim())}&category=${encodeURIComponent(
          newCat,
        )}&page=1`,
      );
      void executeSearch(query, newCat, 1);
    } else {
      router.push(`/recherche?category=${encodeURIComponent(newCat)}&page=1`);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    router.push(
      `/recherche?q=${encodeURIComponent(query.trim())}&category=${encodeURIComponent(
        category,
      )}&page=${newPage}`,
    );
    void executeSearch(query, category, newPage);
  };

  const total = data?.total ?? 0;
  const counts = data?.counts ?? {
    all: 0,
    commandes: 0,
    users: 0,
    demandes: 0,
    disputes: 0,
  };
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasQuery = Boolean(query.trim());
  const items = data?.items ?? [];

  return (
    <main className="page page--detail">
      <div className="search-hub">
        <Breadcrumbs
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Recherche globale' },
          ]}
        />

        <div className="search-hub__header">
          <h1 className="search-hub__title">Recherche globale</h1>

          <form onSubmit={handleSearchSubmit} className="search-hub__form" role="search">
            <div className="search-hub__input-wrapper">
              <span className="search-hub__input-icon" aria-hidden="true">
                <Icon as={Search} />
              </span>
              <input
                type="search"
                className="search-hub__input"
                placeholder="Rechercher commande, utilisateur, demande, litige..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Terme de recherche"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="search-hub__clear-btn"
                  aria-label="Effacer la recherche"
                >
                  ✕
                </button>
              )}
            </div>

            <button type="submit" className="search-hub__submit-btn">
              Rechercher
            </button>
          </form>
        </div>

        {/* Segmented Category Tabs */}
        <div className="search-hub__tabs" role="tablist" aria-label="Catégories de recherche">
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const isActive = category === cat;
            const count = counts[cat] ?? 0;

            return (
              <button
                key={cat}
                data-category={cat}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`search-hub__tab ${isActive ? 'search-hub__tab--active' : ''}`}
                onClick={() => handleCategoryChange(cat)}
              >
                <span aria-hidden="true"><Icon as={meta.icon} /></span>
                <span>{meta.label}</span>
                <span className="search-hub__tab-chip">{`(${count})`}</span>
              </button>
            );
          })}
        </div>

        {/* Content Section */}
        {loading && (
          <div className="state" aria-live="polite">
            <p>Chargement des résultats…</p>
          </div>
        )}

        {error && !loading && (
          <div className="state state--error" role="alert">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !hasQuery && (
          <div className="search-hub__zero">
            <div className="search-hub__zero-icon" aria-hidden="true">
              <Icon as={Search} />
            </div>
            <p className="search-hub__zero-prompt">
              Saisissez un terme de recherche pour explorer les commandes, utilisateurs, demandes et litiges.
            </p>
          </div>
        )}

        {!loading && !error && hasQuery && total === 0 && (
          <div className="search-hub__empty">
            <div className="search-hub__empty-icon" aria-hidden="true">
              <Icon as={Search} />
            </div>
            <h2 className="search-hub__empty-title">
              {`Aucun résultat trouvé pour « ${query} »`}
            </h2>
            <div className="search-hub__empty-advice-card">
              <div className="search-hub__empty-advice-title">Conseils de recherche</div>
              <ul className="search-hub__empty-advice-list">
                <li>Vérifiez l&apos;orthographe des termes saisis.</li>
                <li>Essayez des mots-clés plus généraux.</li>
                <li>Recherchez directement par identifiant (#CMD-..., #LIT-...) ou adresse e-mail.</li>
              </ul>
            </div>
          </div>
        )}

        {!loading && !error && hasQuery && total > 0 && (
          <div className="search-hub__results">
            <div className="search-hub__results-header">
              <div className="search-hub__results-count">
                {`${total} résultat${total > 1 ? 's' : ''} trouvé${total > 1 ? 's' : ''} pour « ${query} »`}
              </div>
            </div>

            <div className="search-hub__cards">
              {items.map((item: AdminSearchDetailedItem) => {
                const itemMeta = ITEM_CATEGORY_META[item.category];

                return (
                  <div key={`${item.category}-${item.id}`} className="search-hub__card">
                    <div className="search-hub__card-main">
                      <div className="search-hub__card-badges">
                        <span className="search-hub__category-badge">
                          <span aria-hidden="true"><Icon as={itemMeta.icon} /></span>
                          <span>{itemMeta.label}</span>
                        </span>
                        {item.badge && (
                          <span className="search-hub__status-badge">{item.badge}</span>
                        )}
                        {item.createdAt && (
                          <span className="search-hub__card-date">
                            {formatDate(item.createdAt)}
                          </span>
                        )}
                      </div>

                      <h3 className="search-hub__card-title">{item.title}</h3>

                      {item.subtitle && (
                        <p className="search-hub__card-subtitle">{item.subtitle}</p>
                      )}

                      {item.snippet && (
                        <p className="search-hub__card-snippet">{item.snippet}</p>
                      )}
                    </div>

                    <div className="search-hub__card-action">
                      <Link href={item.href} className="search-hub__cta-btn">
                        Voir les détails →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {total > 20 && (
              <nav className="search-hub__pagination" aria-label="Pagination des résultats">
                <button
                  type="button"
                  className="search-hub__pagination-btn"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  aria-label="Page précédente"
                >
                  Précédent
                </button>
                <span className="search-hub__pagination-info">
                  {`Page ${page} sur ${totalPages}`}
                </span>
                <button
                  type="button"
                  className="search-hub__pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  aria-label="Page suivante"
                >
                  Suivant
                </button>
              </nav>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function RechercheContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = (searchParams.get('category') as AdminSearchCategory) || 'all';
  const page = Number(searchParams.get('page')) || 1;

  return (
    <RechercheView
      initialQuery={q}
      initialCategory={category}
      initialPage={page}
    />
  );
}

export default function RecherchePage() {
  return (
    <Suspense
      fallback={
        <main className="page page--detail">
          <div className="state">
            <p>Chargement de la recherche…</p>
          </div>
        </main>
      }
    >
      <RechercheContent />
    </Suspense>
  );
}
