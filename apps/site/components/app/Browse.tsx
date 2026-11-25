'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { CategoryDto } from '@revime/shared';
import { useApi } from '../../lib/client/use-api';
import { IconSearch } from './icons';

/** Réparateurs and Demandes are the two halves of the app's « Recherche » tab. */
export function SearchTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ['q', 'categorie']) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : '';
  return (
    <div className="ap-seg ap-seg--wide" role="tablist" aria-label="Rechercher">
      <Link role="tab" aria-selected={pathname.startsWith('/reparateurs')} href={`/reparateurs${qs}`}>
        Réparateurs
      </Link>
      <Link role="tab" aria-selected={pathname.startsWith('/demandes')} href={`/demandes${qs}`}>
        Demandes
      </Link>
    </div>
  );
}

export type BrowseFilters = {
  q: string;
  categorySlug: string;
  /** The API id of the chosen category, once the catalogue is read. */
  categoryId: string | null;
  selectedLabel: string | null;
  roots: CategoryDto[];
  set: (patch: Record<string, string | null>) => void;
};

/**
 * Filters live in the address (`?q=…&categorie=…`), so a filtered list can be shared, survives a
 * reload, and the back button returns to it.
 */
export function useBrowseFilters(): BrowseFilters {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const categories = useApi<CategoryDto[]>('/categories');
  const q = params.get('q') ?? '';
  const categorySlug = params.get('categorie') ?? '';
  const all = categories.data ?? [];
  const selected = all.find((c) => c.slug === categorySlug);
  const categoryId = selected?.id ?? null;
  const selectedLabel = selected?.labelFr ?? null;
  const roots = all.filter((c) => c.parentId === null);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  return { q, categorySlug, categoryId, selectedLabel, roots, set };
}

/** The search field and the category row, with what is applied always visible. */
export function FilterBar({ f, placeholder, children }: { f: BrowseFilters; placeholder: string; children?: React.ReactNode }) {
  const [q, setQ] = useState(f.q);
  useEffect(() => setQ(f.q), [f.q]);
  const activeRoot = useMemo(() => f.roots.find((r) => r.slug === f.categorySlug), [f.roots, f.categorySlug]);
  return (
    <div className="ap-filters">
      <form
        role="search"
        className="ap-filters__search"
        onSubmit={(e) => {
          e.preventDefault();
          f.set({ q: q.trim() || null });
        }}
      >
        <IconSearch size={18} />
        <input aria-label={placeholder} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ap-btn ap-btn--dark ap-btn--sm">Rechercher</button>
      </form>
      <div className="ap-chips" aria-label="Catégorie">
        <button type="button" className="ap-chip" aria-pressed={!f.categorySlug} onClick={() => f.set({ categorie: null })}>
          Tout
        </button>
        {f.roots.map((r) => (
          <button
            type="button"
            key={r.id}
            className="ap-chip"
            aria-pressed={r.slug === f.categorySlug}
            onClick={() => f.set({ categorie: r.slug === f.categorySlug ? null : r.slug })}
          >
            {r.labelFr}
          </button>
        ))}
        {f.categorySlug && !activeRoot && (
          <button type="button" className="ap-chip" aria-pressed onClick={() => f.set({ categorie: null })}>
            {f.selectedLabel ?? f.categorySlug} ✕
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
