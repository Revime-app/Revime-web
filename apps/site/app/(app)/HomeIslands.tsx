'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DemandeListItem, DirectoryCardDto, PublicDemandeView } from '@revime/shared';
import { useApi } from '../../lib/client/use-api';
import { useSession } from '../../lib/client/session';
import { DemandeTile, MyDemandeRow, RepairerCard } from '../../components/app/cards';
import { IconPin, IconSearch } from '../../components/app/icons';

const POPULAR = ['Écran cassé', 'Batterie', 'Trottinette', 'Lave-linge', 'Retouche', 'Ressemelage'];

/**
 * The hero's search, as on the big listing sites: what, then where, then go. Popular searches
 * under it give a first-time visitor something to tap.
 */
export function HomeHeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cp, setCp] = useState('');
  const go = (what: string) => {
    const qs = new URLSearchParams();
    if (what.trim()) qs.set('q', what.trim());
    if (/^\d{5}$/.test(cp)) qs.set('cp', cp);
    router.push(qs.toString() ? `/reparateurs?${qs}` : '/reparateurs');
  };
  return (
    <div className="ap-bigsearch-wrap">
      <form
        role="search"
        className="ap-bigsearch"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <label className="ap-bigsearch__what">
          <IconSearch size={20} />
          <input
            aria-label="Que faut-il réparer ?"
            placeholder="Que faut-il réparer ?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="ap-bigsearch__where">
          <IconPin size={18} />
          <input
            aria-label="Code postal"
            placeholder="Code postal"
            inputMode="numeric"
            maxLength={5}
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button className="ap-btn ap-btn--primary">Rechercher</button>
      </form>
      <div className="ap-popular" aria-label="Recherches fréquentes">
        {POPULAR.map((p) => (
          <button key={p} type="button" className="ap-chip ap-chip--sm" onClick={() => go(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveDemande() {
  const demandes = useApi<DemandeListItem[]>('/demandes/mine');
  const list = demandes.data ?? [];
  const current = list.find((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS') ?? null;
  if (demandes.loading || list.length === 0) return null;
  return (
    <section className="ap-section" aria-labelledby="h-mine">
      <div className="ap-section__head">
        <h2 id="h-mine">Ma demande en cours</h2>
        <Link href="/mes-demandes" className="ap-more">
          Toutes mes demandes ({list.length})
        </Link>
      </div>
      {current ? (
        <MyDemandeRow d={current} highlight />
      ) : (
        <p className="ap-muted">Aucune demande en cours. Publiez-en une nouvelle avec le bouton « + ».</p>
      )}
    </section>
  );
}

/** What changes once signed in: the greeting, and the demande being followed. */
export function HomePersonal({ slot }: { slot: 'greeting' | 'active' }) {
  const { me } = useSession();
  if (!me) return slot === 'greeting' ? <p className="ap-eyebrow">Réparation près de chez vous</p> : null;
  if (slot === 'greeting') {
    const first = me.firstName?.trim();
    return <p className="ap-eyebrow">{first ? `Bonjour ${first}` : 'Bonjour'}</p>;
  }
  return <ActiveDemande />;
}

export function TopRepairers() {
  const repairers = useApi<DirectoryCardDto[]>('/repairers?sort=note');
  const list = (repairers.data ?? []).slice(0, 10);
  if (list.length === 0) return null;
  return (
    <section className="ap-section" aria-labelledby="h-rep">
      <div className="ap-section__head">
        <h2 id="h-rep">Réparateurs près de chez vous</h2>
        <Link href="/reparateurs" className="ap-more">
          Voir tout
        </Link>
      </div>
      <div className="ap-rail ap-rail--rep">
        {list.map((r) => (
          <RepairerCard key={r.userId} r={r} />
        ))}
      </div>
    </section>
  );
}

export function RecentDemandes() {
  const demandes = useApi<PublicDemandeView[]>('/demandes/browse');
  const list = (demandes.data ?? []).slice(0, 12);
  if (list.length === 0) return null;
  return (
    <section className="ap-section" aria-labelledby="h-dem">
      <div className="ap-section__head">
        <h2 id="h-dem">Demandes près de chez vous</h2>
        <Link href="/demandes" className="ap-more">
          Voir tout
        </Link>
      </div>
      <div className="ap-rail">
        {list.map((d) => (
          <DemandeTile key={d.id} d={d} />
        ))}
      </div>
    </section>
  );
}
