'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DemandeListItem } from '@revime/shared';
import { useApi } from '../../../lib/client/use-api';
import { DemandeCard } from '../../../components/espace/DemandeCard';
import { Loader, ScreenTitle } from '../../../components/espace/ui';

const FILTERS = [
  { key: 'actives', label: 'En cours', test: (d: DemandeListItem) => d.status === 'OPEN' || d.status === 'IN_PROGRESS' },
  { key: 'terminees', label: 'Terminées', test: (d: DemandeListItem) => d.status === 'DONE' || d.status === 'CANCELLED' },
  { key: 'toutes', label: 'Toutes', test: () => true },
] as const;

export default function MesDemandesPage() {
  const demandes = useApi<DemandeListItem[]>('/demandes/mine');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('actives');
  const active = FILTERS.find((f) => f.key === filter)!;
  const list = (demandes.data ?? []).filter(active.test);

  return (
    <div className="esp-page">
      <ScreenTitle title="Mes demandes" />
      <div className="esp-chips" role="tablist" aria-label="Filtrer">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={f.key === filter}
            className={f.key === filter ? 'esp-chip is-on' : 'esp-chip'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {demandes.data && <span className="esp-chip__n">{demandes.data.filter(f.test).length}</span>}
          </button>
        ))}
      </div>
      {demandes.loading && <Loader />}
      {demandes.error && <p className="esp-error">{demandes.error}</p>}
      {!demandes.loading && !demandes.error && list.length === 0 && (
        <div className="esp-card">
          <p className="esp-card__title">Rien ici pour l’instant</p>
          <p className="esp-muted">
            <Link href="/publier" className="esp-link">
              Publier une demande
            </Link>{' '}
            pour recevoir des offres de réparateurs.
          </p>
        </div>
      )}
      <div className="esp-stack">
        {list.map((d) => (
          <DemandeCard key={d.id} demande={d} />
        ))}
      </div>
    </div>
  );
}
