'use client';

import { useState } from 'react';
import type { DirectoryCardDto, FavoriteDemandeItem } from '@revime/shared';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { RepairerCard } from '../../../../components/app/cards';
import { IconHeart, IconPin } from '../../../../components/app/icons';
import { Loader, PageTitle, ago, euroFmt } from '../../../../components/app/ui';
import Link from 'next/link';

/** The app's « Mes favoris »: saved réparateurs and saved annonces, one tab each. */
export default function FavorisPage() {
  const me = useRequireSession();
  const [tab, setTab] = useState<'reparateurs' | 'demandes'>('reparateurs');
  const reps = useApi<DirectoryCardDto[]>(me && tab === 'reparateurs' ? '/favorites/repairers' : null);
  const dems = useApi<FavoriteDemandeItem[]>(me && tab === 'demandes' ? '/favorites/demandes' : null);
  if (!me) return <Loader />;
  const cur = tab === 'reparateurs' ? reps : dems;
  const empty = cur.data && cur.data.length === 0;
  return (
    <div className="ap-page">
      <PageTitle title="Mes favoris" sub="Réparateurs et annonces sauvegardés" />
      <div className="ap-seg" role="tablist" aria-label="Favoris">
        <button role="tab" aria-selected={tab === 'reparateurs'} onClick={() => setTab('reparateurs')}>
          Réparateurs
        </button>
        <button role="tab" aria-selected={tab === 'demandes'} onClick={() => setTab('demandes')}>
          Annonces
        </button>
      </div>
      {cur.loading && <Loader />}
      {cur.error && <p className="ap-error">{cur.error}</p>}
      {empty && (
        <div className="ap-empty">
          <IconHeart size={28} />
          <strong>{tab === 'reparateurs' ? 'Aucun réparateur sauvegardé' : 'Aucune annonce sauvegardée'}</strong>
          <span>Touchez le cœur sur une fiche pour la retrouver ici.</span>
        </div>
      )}
      {tab === 'reparateurs' && reps.data && reps.data.length > 0 && (
        <div className="ap-grid ap-grid--rep">
          {reps.data.map((r) => (
            <RepairerCard key={r.userId} r={r} />
          ))}
        </div>
      )}
      {tab === 'demandes' && dems.data && dems.data.length > 0 && (
        <div className="ap-stack">
          {dems.data.map((d) => (
            <Link key={d.id} href="/demandes" className="ap-offrow">
              <span className="ap-offrow__thumb" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.photoUrl && <img src={d.photoUrl} alt="" />}
              </span>
              <span className="ap-offrow__body">
                <strong>{d.title}</strong>
                <span>
                  {d.categoryLabelFr} · <IconPin size={12} /> {d.locationLabel} · {ago(d.createdAt)}
                </span>
              </span>
              {d.budgetCents !== null && <span className="ap-offrow__price">{euroFmt(d.budgetCents)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
