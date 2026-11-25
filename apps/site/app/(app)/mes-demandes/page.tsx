'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DemandeListItem } from '@revime/shared';
import { useRequireSession } from '../../../lib/client/session';
import { useApi } from '../../../lib/client/use-api';
import { MyDemandeRow } from '../../../components/app/cards';
import { Loader, PageTitle } from '../../../components/app/ui';

const FILTERS = [
  { key: 'actives', label: 'En cours', test: (d: DemandeListItem) => d.status === 'OPEN' || d.status === 'IN_PROGRESS' },
  { key: 'terminees', label: 'Terminées', test: (d: DemandeListItem) => d.status === 'DONE' || d.status === 'CANCELLED' },
  { key: 'toutes', label: 'Toutes', test: () => true },
] as const;

export default function MesDemandesPage() {
  const me = useRequireSession();
  const demandes = useApi<DemandeListItem[]>(me ? '/demandes/mine' : null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('actives');
  if (!me) return <Loader />;
  const active = FILTERS.find((f) => f.key === filter)!;
  const list = (demandes.data ?? []).filter(active.test);

  return (
    <div className="ap-page ap-narrow">
      <PageTitle title="Mes demandes">
        <Link href="/publier" className="ap-btn ap-btn--secondary ap-btn--sm ap-title__action">
          Nouvelle demande
        </Link>
      </PageTitle>
      <div className="ap-seg" role="tablist" aria-label="Filtrer">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={f.key === filter} onClick={() => setFilter(f.key)}>
            {f.label}
            {demandes.data && <span className="ap-seg__n">{demandes.data.filter(f.test).length}</span>}
          </button>
        ))}
      </div>
      {demandes.loading && <Loader />}
      {demandes.error && <p className="ap-error">{demandes.error}</p>}
      {!demandes.loading && !demandes.error && list.length === 0 && (
        <div className="ap-empty">
          <strong>{filter === 'actives' ? 'Aucune demande en cours' : 'Rien ici pour l’instant'}</strong>
          <span>Publiez une demande pour recevoir les offres des réparateurs de votre zone.</span>
          <Link href="/publier" className="ap-btn ap-btn--primary">
            Publier une demande
          </Link>
        </div>
      )}
      <div className="ap-stack">
        {list.map((d) => (
          <MyDemandeRow key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}
