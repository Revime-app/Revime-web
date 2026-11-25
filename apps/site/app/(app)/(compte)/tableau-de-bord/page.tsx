'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  activityCopy,
  isRepairerTurn,
  mergeActivity,
  todoCopy,
  type CommandeListItem,
  type ConnectOnboardingResponse,
  type ConnectStatusResponse,
  type DashboardTodoItem,
  type OfferListItem,
  type RepairerDashboardDto,
} from '@revime/shared';
import { api, errorMessage } from '../../../../lib/client/api';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { ProChecklist } from '../../../../components/app/ProChecklist';
import { CountUp } from '../../../../components/app/CountUp';
import { IconArrowRight, IconBriefcase, IconCompare, IconSearch, IconShieldCheck, IconUser } from '../../../../components/app/icons';
import { Loader, ago, euroFmt } from '../../../../components/app/ui';

/**
 * The app's « Tableau de bord » (apps/mobile/app/tableau-de-bord.tsx): what is to do today, then
 * the figures, the payouts set-up and the latest activity. Texts come from @revime/shared
 * (`todoCopy`, `activityCopy`), the same words as in the app.
 */
function todoHref(t: DashboardTodoItem): string {
  switch (t.kind) {
    case 'DISPUTE':
    case 'ATTENTION':
      return t.commandeId ? `/commandes/${t.commandeId}` : '/mes-missions';
    case 'MATCHING':
      return '/demandes';
    case 'CATEGORIES_MISSING':
      return '/profil-pro#categories';
    case 'QUOTE_REQUESTS':
      return '/mes-propositions?onglet=devis';
    default:
      return '/mes-missions';
  }
}

function Payouts() {
  const status = useApi<ConnectStatusResponse>('/connect/status');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status.loading || !status.data) return null;
  if (status.data.transfersActive) {
    return (
      <section className="ap-box ap-payout ap-payout--ok">
        <IconShieldCheck size={22} />
        <div>
          <strong>Versements activés</strong>
          <span>Vos gains arrivent sur votre compte bancaire quand le client valide la réparation.</span>
        </div>
      </section>
    );
  }
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ConnectOnboardingResponse>('/connect/onboarding?surface=web', {});
      window.location.assign(r.url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <section className="ap-box ap-payout">
      <div>
        <strong>Activez vos versements</strong>
        <span>
          Indispensable pour être payé. Stripe, notre prestataire de paiement, vous demande votre identité et votre IBAN
          (environ 5 minutes).
        </span>
        {error && <p className="ap-error" role="alert">{error}</p>}
      </div>
      <button className="ap-btn ap-btn--pro" onClick={() => void start()} disabled={busy}>
        {busy ? 'Ouverture…' : 'Activer mes versements'}
      </button>
    </section>
  );
}

export default function DashboardPage() {
  const me = useRequireSession();
  const pro = me?.profile.activeMode === 'REPAIRER';
  const dash = useApi<RepairerDashboardDto>(pro ? '/repairers/me/dashboard' : null);
  const missions = useApi<CommandeListItem[]>(pro ? '/commandes?role=repairer' : null);
  const offers = useApi<OfferListItem[]>(pro ? '/offers/mine' : null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (dash.data && !seen) {
      setSeen(true);
      api.post('/repairers/me/dashboard-seen', {}).catch(() => {});
    }
  }, [dash.data, seen]);

  if (!me) return <Loader />;
  if (!pro) {
    return (
      <div className="ap-page">
        <div className="ap-empty">
          <strong>Le tableau de bord est celui du mode réparateur</strong>
          <span>Passez en mode Réparateur avec le sélecteur Client / Réparateur.</span>
          <Link href="/parametres" className="ap-btn ap-btn--pro">Changer de mode</Link>
        </div>
      </div>
    );
  }

  const list = missions.data ?? [];
  const live = list.filter((c) => c.status === 'PAID' && c.step !== 'RELEASED');
  const myTurn = live.filter((c) => isRepairerTurn(c.step, c.delivery));
  const earned = list.filter((c) => c.step === 'RELEASED' && c.status === 'PAID').reduce((s, c) => s + c.payoutCents, 0);
  const coming = live.reduce((s, c) => s + c.payoutCents, 0);
  const pending = (offers.data ?? []).filter((o) => o.status === 'SENT').length;
  const todo = dash.data?.todo ?? [];
  const name = me.firstName || me.repairer?.displayName || me.username;

  return (
    <div className="ap-page ap-dash">
      <header className="ap-dash__head">
        <p className="ap-dash__hello">Bonjour {name}</p>
        <h1>Votre tableau de bord</h1>
      </header>

      <ProChecklist me={me} />

      <div className="ap-kpis">
        <Link href="/mes-missions" className="ap-kpi ap-spot">
          <span>En cours</span>
          <strong><CountUp value={live.length} /></strong>
          <small>{myTurn.length > 0 ? `${myTurn.length} attendent votre action` : 'Rien à faire de votre côté'}</small>
        </Link>
        <Link href="/mes-propositions" className="ap-kpi ap-spot">
          <span>Offres en attente</span>
          <strong><CountUp value={pending} /></strong>
          <small>Le client n’a pas encore choisi</small>
        </Link>
        <Link href="/mes-missions?vue=revenus" className="ap-kpi ap-kpi--money ap-spot">
          <span>Gagné sur REVIME</span>
          <strong><CountUp value={earned} money /></strong>
          <small>{coming > 0 ? `+ ${euroFmt(coming)} à venir` : 'Versé à la validation du client'}</small>
        </Link>
      </div>

      <div className="ap-dash__grid">
        <section aria-labelledby="h-todo">
          <h2 id="h-todo" className="ap-dash__h">À faire</h2>
          {dash.loading && <Loader />}
          {!dash.loading && todo.length === 0 && (
            <div className="ap-todo ap-todo--done">
              <div>
                <strong>Tout est à jour</strong>
                <span>Profitez-en pour regarder les nouvelles demandes de votre quartier.</span>
              </div>
              <Link href="/demandes">Voir les demandes</Link>
            </div>
          )}
          <ul className="ap-todolist">
            {todo.map((t, i) => {
              const c = todoCopy(t);
              return (
                <li key={`${t.kind}-${i}`} style={{ '--i': i } as React.CSSProperties}>
                  <Link href={todoHref(t)} className={`ap-todoitem ap-spot ap-todoitem--${t.kind.toLowerCase()}`}>
                    <span>
                      <strong>{c.title}</strong>
                      <small>{c.body}</small>
                    </span>
                    <span className="ap-todoitem__cta">
                      {c.cta.replace(/\s*→\s*$/, '')} <IconArrowRight size={14} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <h2 className="ap-dash__h">Activité récente</h2>
          {dash.data && dash.data.activity.length === 0 && <p className="ap-muted">Votre activité apparaîtra ici après votre première mission.</p>}
          <ol className="ap-activity">
            {mergeActivity(dash.data?.activity ?? []).map((a) => (
              <li key={`${a.kind}-${a.commandeId}-${a.at}`}>
                <Link href={`/commandes/${a.commandeId}`}>
                  <strong>{activityCopy(a)}</strong>
                  <span>{a.subject}</span>
                  <time>{ago(a.at)}</time>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside className="ap-stack">
          <Payouts />
          <nav className="ap-box ap-proshort" aria-label="Raccourcis">
            <Link href="/demandes"><IconSearch size={18} /> Demandes près de chez moi</Link>
            <Link href="/mes-propositions"><IconCompare size={18} /> Mes propositions</Link>
            <Link href="/mes-missions"><IconBriefcase size={18} /> Mes réparations</Link>
            <Link href="/profil-pro"><IconUser size={18} /> Mon profil public</Link>
          </nav>
        </aside>
      </div>
    </div>
  );
}
