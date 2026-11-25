'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DemandeListItem, DirectoryCardDto, PublicDemandeView } from '@revime/shared';
import { useApi } from '../../lib/client/use-api';
import { useSession } from '../../lib/client/session';
import { DemandeTile, MyDemandeRow, RepairerCard } from '../../components/app/cards';
import { IconSearch } from '../../components/app/icons';

/** The hero's search: what is broken goes to the réparateurs who fix it. */
export function HomeHeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="ap-bigsearch"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/reparateurs?q=${encodeURIComponent(q.trim())}` : '/reparateurs');
      }}
    >
      <IconSearch size={20} />
      <input
        aria-label="Que faut-il réparer ?"
        placeholder="Écran d’iPhone, vélo, cafetière…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button className="ap-btn ap-btn--dark">
        <span className="ap-bigsearch__long">Trouver un réparateur</span>
        <span className="ap-bigsearch__short">Trouver</span>
      </button>
    </form>
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
  const list = (repairers.data ?? []).slice(0, 3);
  if (list.length === 0) return null;
  return (
    <section className="ap-section" aria-labelledby="h-rep">
      <div className="ap-section__head">
        <h2 id="h-rep">Réparateurs bien notés</h2>
        <Link href="/reparateurs" className="ap-more">
          Voir tout
        </Link>
      </div>
      <div className="ap-grid ap-grid--rep">
        {list.map((r) => (
          <RepairerCard key={r.userId} r={r} />
        ))}
      </div>
    </section>
  );
}

export function RecentDemandes() {
  const demandes = useApi<PublicDemandeView[]>('/demandes/browse');
  const list = (demandes.data ?? []).slice(0, 4);
  if (list.length === 0) return null;
  return (
    <section className="ap-section" aria-labelledby="h-dem">
      <div className="ap-section__head">
        <h2 id="h-dem">Demandes récentes</h2>
        <Link href="/demandes" className="ap-more">
          Voir tout
        </Link>
      </div>
      <div className="ap-grid ap-grid--tiles">
        {list.map((d) => (
          <DemandeTile key={d.id} d={d} />
        ))}
      </div>
    </section>
  );
}
