'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { DirectoryCardDto } from '@revime/shared';
import { useApi } from '../../../lib/client/use-api';
import { FilterBar, SearchTabs, useBrowseFilters } from '../../../components/app/Browse';
import { RepairerCard } from '../../../components/app/cards';
import { Loader } from '../../../components/app/ui';

const SORTS = [
  { value: 'note', label: 'Mieux notés' },
  { value: 'distance', label: 'Plus proches' },
  { value: 'az', label: 'De A à Z' },
] as const;

export function RepairerDirectory() {
  const f = useBrowseFilters();
  const params = useSearchParams();
  const near = /^\d{5}$/.exec(params.get('cp') ?? '')?.[0];
  const sort = params.get('tri') ?? 'note';
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.categoryId) qs.set('categoryId', f.categoryId);
  if (near) qs.set('near', near);
  qs.set('sort', sort === 'distance' && !near ? 'note' : sort);
  const waitingCategory = Boolean(f.categorySlug) && !f.categoryId && f.roots.length === 0;
  const list = useApi<DirectoryCardDto[]>(waitingCategory ? null : `/repairers?${qs}`);

  return (
    <div className="ap-page">
      <div className="ap-browse-head">
        <h1>Trouver un réparateur</h1>
        <SearchTabs />
      </div>
      <FilterBar f={f} placeholder="Objet, panne ou nom du réparateur">
        <div className="ap-filters__row">
          <label className="ap-inline">
            <span>Près de</span>
            <input
              inputMode="numeric"
              maxLength={5}
              placeholder="Code postal"
              defaultValue={near ?? ''}
              onBlur={(e) => f.set({ cp: /^\d{5}$/.test(e.target.value) ? e.target.value : null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <label className="ap-inline">
            <span>Trier</span>
            <select value={sort} onChange={(e) => f.set({ tri: e.target.value === 'note' ? null : e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value} disabled={s.value === 'distance' && !near}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </FilterBar>

      {list.loading && <Loader />}
      {list.error && <p className="ap-error">{list.error}</p>}
      {!list.loading && !list.error && (
        <>
          <p className="ap-count">
            {list.data?.length ?? 0} réparateur{(list.data?.length ?? 0) > 1 ? 's' : ''}
            {f.selectedLabel ? ` · ${f.selectedLabel}` : ''}
            {f.q ? ` · « ${f.q} »` : ''}
          </p>
          {list.data?.length === 0 ? (
            <div className="ap-empty">
              <strong>Aucun réparateur ne correspond pour l’instant.</strong>
              <span>
                Publiez votre demande : les réparateurs de votre zone la reçoivent et vous font une offre.
              </span>
              <Link href="/publier" className="ap-btn ap-btn--primary">
                Publier une demande
              </Link>
            </div>
          ) : (
            <div className="ap-grid ap-grid--rep">
              {list.data?.map((r) => <RepairerCard key={r.userId} r={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
