'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { STEP_LABEL, isRepairerTurn, type CommandeListItem } from '@revime/shared';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { CountUp } from '../../../../components/app/CountUp';
import { IconChevronRight } from '../../../../components/app/icons';
import { Loader, PageTitle, euroFmt } from '../../../../components/app/ui';

/** The réparateur's « Mes réparations » (apps/mobile/app/commandes.tsx), with the revenus on top. */
const TABS = [
  { key: 'cours', label: 'En cours' },
  { key: 'terminees', label: 'Terminées' },
] as const;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function Missions() {
  const me = useRequireSession();
  const params = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('cours');
  const res = useApi<CommandeListItem[]>(me ? '/commandes?role=repairer' : null);
  if (!me) return <Loader />;
  const all = res.data ?? [];
  const done = (c: CommandeListItem) => c.step === 'RELEASED' || c.status === 'REFUNDED' || c.status === 'ABANDONED';
  const live = all.filter((c) => c.status === 'PAID' && !done(c));
  const finished = all.filter(done);
  const earned = all.filter((c) => c.step === 'RELEASED' && c.status === 'PAID').reduce((s, c) => s + c.payoutCents, 0);
  const coming = live.reduce((s, c) => s + c.payoutCents, 0);
  const shown = tab === 'cours' ? live : finished;

  return (
    <div className="ap-page">
      <PageTitle title="Mes réparations" sub="Les réparations que des clients vous ont confiées" />
      <div className={`ap-kpis ap-kpis--2${params.get('vue') === 'revenus' ? ' is-focus' : ''}`}>
        <div className="ap-kpi ap-kpi--money ap-spot">
          <span>Gagné sur REVIME</span>
          <strong><CountUp value={earned} money /></strong>
          <small>Réparations validées par les clients</small>
        </div>
        <div className="ap-kpi ap-spot">
          <span>À venir</span>
          <strong><CountUp value={coming} money /></strong>
          <small>Versé à la validation du client</small>
        </div>
      </div>
      <div className="ap-seg" role="tablist" aria-label="Filtrer">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} <span className="ap-seg__n">{t.key === 'cours' ? live.length : finished.length}</span>
          </button>
        ))}
      </div>
      {res.loading && <Loader />}
      {!res.loading && shown.length === 0 && (
        <div className="ap-empty">
          <strong>{tab === 'cours' ? 'Aucune réparation en cours' : 'Pas encore de réparation terminée'}</strong>
          <span>Quand un client choisit votre offre et paie, la réparation apparaît ici.</span>
          <Link href="/demandes" className="ap-btn ap-btn--pro">Voir les demandes près de chez moi</Link>
        </div>
      )}
      <ul className="ap-list">
        {shown.map((c, i) => {
          const mine = c.status === 'PAID' && !done(c) && isRepairerTurn(c.step, c.delivery);
          return (
            <li key={c.id} style={{ '--i': i } as React.CSSProperties}>
              <Link href={`/commandes/${c.id}`} className="ap-row">
                <span className="ap-row__main">
                  <strong>{c.demandeTitle}</strong>
                  <span>
                    {c.counterpartyName} · {dateFmt.format(new Date(c.createdAt))}
                  </span>
                  <span className={mine ? 'ap-next ap-next--you' : 'ap-next ap-next--them'}>
                    {c.disputeOpen
                      ? 'Litige en cours'
                      : c.status === 'REFUNDED'
                        ? 'Remboursée'
                        : mine
                          ? 'À vous : passez à l’étape suivante'
                          : STEP_LABEL[c.step]}
                  </span>
                </span>
                <span className="ap-row__money">{euroFmt(c.payoutCents)}</span>
                <IconChevronRight size={18} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MissionsPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Missions />
    </Suspense>
  );
}
