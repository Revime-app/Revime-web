'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DemandeListItem, DirectoryCardDto, PublicDemandeView } from '@revime/shared';
import { nextStep } from '../../lib/client/next-step';
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

/** Most urgent first: the client's turn, then money, then what others are doing. */
function urgency(d: DemandeListItem): number {
  const n = nextStep(d);
  if (!n) return 9;
  if (n.who === 'you') return d.commande?.step === 'AWAITING_VALIDATION' ? 0 : d.commande?.status === 'PENDING_PAYMENT' ? 1 : 2;
  return n.who === 'them' ? 5 : 8;
}

function todoTitle(d: DemandeListItem): string {
  if (d.commande?.step === 'AWAITING_VALIDATION') return `La réparation de « ${d.title} » est terminée`;
  if (d.commande?.status === 'PENDING_PAYMENT') return `Il reste à payer « ${d.title} »`;
  if (d.offerCount > 1) return `${d.offerCount} réparateurs ont répondu pour « ${d.title} »`;
  return `Un réparateur a répondu pour « ${d.title} »`;
}

function todoCta(d: DemandeListItem): string {
  if (d.commande?.step === 'AWAITING_VALIDATION') return 'Vérifier et valider';
  if (d.commande?.status === 'PENDING_PAYMENT') return 'Payer';
  return d.offerCount > 1 ? `Comparer les ${d.offerCount} offres` : 'Voir l’offre';
}

/**
 * The signed-in home starts with « the one thing to do today » (people come to their account for a
 * task), then the other repairs, each saying who must act.
 */
function ActiveDemande() {
  const demandes = useApi<DemandeListItem[]>('/demandes/mine');
  const list = demandes.data ?? [];
  if (demandes.loading) return null;
  if (list.length === 0) {
    return (
      <section className="ap-todo ap-todo--first">
        <div>
          <strong>Votre compte est prêt. Qu’est-ce qu’on répare ?</strong>
          <span>Décrivez votre premier objet : 3 questions, environ 2 minutes, gratuit et sans engagement.</span>
        </div>
        <Link href="/publier">Publier ma première demande</Link>
      </section>
    );
  }
  const live = list.filter((d) => nextStep(d)).sort((a, b) => urgency(a) - urgency(b));
  const top = live[0] && nextStep(live[0])?.who === 'you' ? live[0] : null;
  const others = live.filter((d) => d !== top).slice(0, 2);
  return (
    <>
      {top && (
        <section className="ap-todo" aria-labelledby="h-todo">
          <div>
            <p className="ap-todo__eb" id="h-todo">
              À faire aujourd’hui
            </p>
            <strong>{todoTitle(top)}</strong>
            <span>{nextStep(top)?.text.replace(/^./, (c) => c.toUpperCase())}</span>
          </div>
          <Link href={`/mes-demandes/${top.id}`}>{todoCta(top)}</Link>
        </section>
      )}
      {others.length > 0 && (
        <section className="ap-section" aria-labelledby="h-mine">
          <div className="ap-section__head">
            <h2 id="h-mine">{top ? 'Vos autres réparations' : 'Vos réparations en cours'}</h2>
            <Link href="/mes-demandes" className="ap-more">
              Toutes mes réparations ({list.length})
            </Link>
          </div>
          <div className="ap-stack ap-stack--2">
            {others.map((d) => (
              <MyDemandeRow key={d.id} d={d} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** What changes once signed in: the greeting, and the demande being followed. */
export function HomePersonal({ slot }: { slot: 'greeting' | 'active' }) {
  const { me } = useSession();
  if (!me) return slot === 'greeting' ? <p className="ap-eyebrow">Bienvenue sur REVIME</p> : null;
  if (slot === 'greeting') {
    const first = me.firstName?.trim();
    return <p className="ap-eyebrow">{first ? `Bonjour ${first}` : 'Bonjour'}</p>;
  }
  if (me.profile.activeMode === 'REPAIRER') return <ProHome />;
  return <ActiveDemande />;
}

/**
 * Réparateur mode: the home points to the tableau de bord, in Bleu Ink.
 */
function ProHome() {
  return (
    <section className="ap-todo ap-todo--pro" aria-labelledby="h-pro-home">
      <div>
        <p className="ap-todo__eb" id="h-pro-home">
          Mode réparateur
        </p>
        <strong>Votre tableau de bord vous attend</strong>
        <span>Ce qui est à faire aujourd’hui, vos réparations en cours et les demandes de votre quartier.</span>
      </div>
      <Link href="/tableau-de-bord">Ouvrir mon tableau de bord</Link>
    </section>
  );
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
