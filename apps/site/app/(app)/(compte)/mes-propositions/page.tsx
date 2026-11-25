'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { OfferListItem, RepairerQuoteRequestItem } from '@revime/shared';
import { api, errorMessage } from '../../../../lib/client/api';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { Loader, PageTitle, ago, euroFmt } from '../../../../components/app/ui';

/** « Mes propositions »: the offers sent, and the private quote requests a client sent to me. */
const STATUS: Record<OfferListItem['status'], { label: string; tone: string }> = {
  SENT: { label: 'En attente du client', tone: 'wait' },
  ACCEPTED: { label: 'Acceptée', tone: 'ok' },
  REJECTED: { label: 'Non retenue', tone: 'off' },
  WITHDRAWN: { label: 'Retirée', tone: 'off' },
};
const delay = (h: number) => (h < 72 ? `${h} h` : `${Math.round(h / 24)} jours`);

function Offers() {
  const offers = useApi<OfferListItem[]>('/offers/mine');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function withdraw(id: string) {
    if (!window.confirm('Retirer cette offre ? Le client ne la verra plus.')) return;
    setBusy(id);
    setError(null);
    try {
      await api.del(`/offers/${id}`);
      offers.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  if (offers.loading) return <Loader />;
  const list = offers.data ?? [];
  if (list.length === 0) {
    return (
      <div className="ap-empty">
        <strong>Aucune offre envoyée</strong>
        <span>Choisissez une demande près de chez vous et proposez votre prix, votre délai et votre garantie.</span>
        <Link href="/demandes" className="ap-btn ap-btn--pro">Voir les demandes</Link>
      </div>
    );
  }
  return (
    <>
      {error && <p className="ap-error" role="alert">{error}</p>}
      <ul className="ap-list">
        {list.map((o, i) => (
          <li key={o.id} className="ap-row" style={{ '--i': i } as React.CSSProperties}>
            <span className="ap-row__main">
              <strong>{o.demandeTitle}</strong>
              <span>
                {euroFmt(o.priceCents)} · {delay(o.delayHours)} · envoyée {ago(o.createdAt)}
              </span>
              <span className={`ap-pill ap-pill--${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
            </span>
            {o.status === 'SENT' && (
              <button className="ap-btn ap-btn--secondary ap-btn--sm" disabled={busy === o.id} onClick={() => void withdraw(o.id)}>
                {busy === o.id ? 'Retrait…' : 'Retirer'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Quotes() {
  const quotes = useApi<RepairerQuoteRequestItem[]>('/repairers/me/quote-requests');
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function decline(id: string) {
    setError(null);
    try {
      await api.post(`/demandes/${id}/quote/decline`, { note: note.trim() });
      setDeclining(null);
      setNote('');
      quotes.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (quotes.loading) return <Loader />;
  const list = quotes.data ?? [];
  if (list.length === 0) {
    return (
      <div className="ap-empty">
        <strong>Aucune demande de devis</strong>
        <span>Quand un client vous demande un devis depuis votre page, sa demande arrive ici, rien que pour vous.</span>
        <Link href="/profil-pro" className="ap-btn ap-btn--secondary">Soigner mon profil public</Link>
      </div>
    );
  }
  return (
    <ul className="ap-list">
      {list.map((q, i) => {
        const open = q.status === 'OPEN' && !q.closedReason;
        return (
          <li key={q.demandeId} className="ap-row ap-row--wrap" style={{ '--i': i } as React.CSSProperties}>
            <span className="ap-row__main">
              <strong>{q.title}</strong>
              <span>
                {q.clientName} · demandé {ago(q.createdAt)}
              </span>
              <span className={`ap-pill ap-pill--${q.liveQuote ? 'ok' : open ? 'wait' : 'off'}`}>
                {q.liveQuote ? `Devis envoyé : ${euroFmt(q.liveQuote.priceCents)}` : open ? 'En attente de votre devis' : 'Fermée'}
              </span>
            </span>
            {open && !q.liveQuote && declining !== q.demandeId && (
              <span className="ap-row-actions">
                <Link href={`/demandes/${q.demandeId}/offre`} className="ap-btn ap-btn--pro ap-btn--sm">Faire mon devis</Link>
                <button className="ap-btn ap-btn--secondary ap-btn--sm" onClick={() => setDeclining(q.demandeId)}>Refuser</button>
              </span>
            )}
            {declining === q.demandeId && (
              <form className="ap-form ap-decline" onSubmit={(e) => { e.preventDefault(); void decline(q.demandeId); }}>
                <label className="ap-field">
                  <span>Pourquoi ? (le client le lira)</span>
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : je ne répare pas cette marque" />
                </label>
                {error && <p className="ap-error" role="alert">{error}</p>}
                <span className="ap-row-actions">
                  <button className="ap-btn ap-btn--primary ap-btn--sm" disabled={!note.trim()}>Envoyer le refus</button>
                  <button type="button" className="ap-link ap-link--muted" onClick={() => setDeclining(null)}>Annuler</button>
                </span>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Propositions() {
  const me = useRequireSession();
  const initial = useSearchParams().get('onglet') === 'devis' ? 'devis' : 'offres';
  const [tab, setTab] = useState<'offres' | 'devis'>(initial);
  if (!me) return <Loader />;
  return (
    <div className="ap-page">
      <PageTitle title="Mes propositions" sub="Vos offres et les devis que des clients vous demandent" />
      <div className="ap-seg" role="tablist" aria-label="Type">
        <button role="tab" aria-selected={tab === 'offres'} onClick={() => setTab('offres')}>Offres envoyées</button>
        <button role="tab" aria-selected={tab === 'devis'} onClick={() => setTab('devis')}>Devis demandés</button>
      </div>
      {tab === 'offres' ? <Offers /> : <Quotes />}
    </div>
  );
}

export default function PropositionsPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Propositions />
    </Suspense>
  );
}
