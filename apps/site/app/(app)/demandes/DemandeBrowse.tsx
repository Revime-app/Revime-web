'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BROWSE_PAGE_SIZE, type PublicDemandeView } from '@revime/shared';
import { useApi } from '../../../lib/client/use-api';
import { FilterBar, SearchTabs, useBrowseFilters } from '../../../components/app/Browse';
import { DemandeTile } from '../../../components/app/cards';
import { CategoryIcon, iconForLabel } from '../../../components/app/categories';
import { IconClose, IconPin } from '../../../components/app/icons';
import { Loader, ago, euroFmt } from '../../../components/app/ui';

function DemandeSheet({ d, onClose }: { d: PublicDemandeView; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="dm-title" onClick={onClose}>
      <div className="ap-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <button className="ap-sheet__close" aria-label="Fermer" onClick={onClose}>
          <IconClose size={18} />
        </button>
        <div className="ap-sheet__media">
          {d.photos.length > 0 ? (
            d.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={p} alt="" />
            ))
          ) : (
            <span className="ap-tile__icon">
              <CategoryIcon path={iconForLabel(d.category.labelFr)} size={40} />
            </span>
          )}
        </div>
        <p className="ap-tile__cat">{d.category.labelFr}</p>
        <h2 id="dm-title">{d.title}</h2>
        <p className="ap-tile__meta">
          <IconPin size={14} /> {d.locationLabel} · publiée {ago(d.createdAt)}
        </p>
        <p className="ap-sheet__desc">{d.description}</p>
        <p className="ap-sheet__budget">
          {d.budgetCents !== null ? `Budget du client : ${euroFmt(d.budgetCents)}` : 'Le client attend vos offres.'}
        </p>
        <div className="ap-note">
          <strong>Vous êtes réparateur ?</strong>
          <span>Les offres se font dans l’appli REVIME pour l’instant. L’espace réparateur arrive sur le site.</span>
        </div>
        <Link href="/publier" className="ap-btn ap-btn--secondary ap-btn--block">
          J’ai la même panne : publier ma demande
        </Link>
      </div>
    </div>
  );
}

export function DemandeBrowse() {
  const f = useBrowseFilters();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicDemandeView[]>([]);
  const [open, setOpen] = useState<PublicDemandeView | null>(null);
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.categoryId) qs.set('categoryId', f.categoryId);
  if (page > 1) qs.set('page', String(page));
  const waitingCategory = Boolean(f.categorySlug) && !f.categoryId && f.roots.length === 0;
  const res = useApi<PublicDemandeView[]>(waitingCategory ? null : `/demandes/browse${qs.toString() ? `?${qs}` : ''}`);

  useEffect(() => setPage(1), [f.q, f.categoryId]);
  useEffect(() => {
    if (!res.data) return;
    setItems((prev) => (page === 1 ? res.data! : [...prev, ...res.data!.filter((d) => !prev.some((p) => p.id === d.id))]));
  }, [res.data, page]);

  return (
    <div className="ap-page">
      <div className="ap-browse-head">
        <h1>Demandes en cours</h1>
        <SearchTabs />
      </div>
      <FilterBar f={f} placeholder="Objet ou panne" />
      {res.loading && page === 1 && <Loader />}
      {res.error && <p className="ap-error">{res.error}</p>}
      {!(res.loading && page === 1) && !res.error && items.length === 0 && (
        <div className="ap-empty">
          <strong>Aucune demande ne correspond.</strong>
          <span>Essayez une autre catégorie, ou publiez la vôtre.</span>
          <Link href="/publier" className="ap-btn ap-btn--primary">
            Publier une demande
          </Link>
        </div>
      )}
      <div className="ap-grid ap-grid--tiles">
        {items.map((d) => (
          <DemandeTile key={d.id} d={d} onOpen={() => setOpen(d)} />
        ))}
      </div>
      {res.data && res.data.length >= BROWSE_PAGE_SIZE && (
        <button className="ap-btn ap-btn--secondary ap-loadmore" onClick={() => setPage((p) => p + 1)} disabled={res.loading}>
          {res.loading ? 'Chargement…' : 'Voir plus de demandes'}
        </button>
      )}
      {open && <DemandeSheet d={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
