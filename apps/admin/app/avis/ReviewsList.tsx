'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REVIEW_MODERATION_MOTIF_LABEL, type AdminReviewsPage } from '@revime/shared';
import { buildListQuery, createLatestGuard } from '../../lib/list-query';
import { demoPill, excerpt } from '../../lib/review-format';
import { ReviewsRatingSummary } from '../../components/ReviewsRatingSummary';
import { formatShortReference } from '../../components/CopyableReference';

/**
 * CF4-37 (spec §4.4). Filter bar + search + paginated table, same pattern as RefundsList.
 * Selects and dates reload immediately; the search box is submit-only.
 */

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminReviewsPage };

const field: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 'var(--r-field, 4px)',
  border: '1px solid var(--line, #dfe2e2)',
  backgroundColor: 'var(--paper, #fff)',
  color: 'var(--ink, #141414)',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, marginBottom: 4 };
const cell: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top' };

export const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  backgroundColor: 'var(--badge-neutral-bg)',
  color: 'var(--ink2)',
  whiteSpace: 'nowrap',
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface ReviewsListProps {
  onOpen: (reviewId: string) => void;
  /** Changes when a review was hidden or restored, to reload the current page. */
  version: number;
}

export function ReviewsList({ onOpen, version }: ReviewsListProps) {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [state, setState] = useState('');
  const [rating, setRating] = useState('');
  const [demo, setDemo] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const guard = useRef(createLatestGuard());

  const load = useCallback(async () => {
    const n = guard.current.next();
    setView({ state: 'loading' });
    const qs = buildListQuery({ state, rating, demo, from, to, q, page });
    try {
      const res = await fetch(`/api/proxy/admin/reviews${qs}`);
      const data = await res.json();
      if (!guard.current.isLatest(n)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger les avis.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminReviewsPage });
    } catch {
      if (!guard.current.isLatest(n)) return;
      setView({ state: 'error', message: 'Impossible de charger les avis.' });
    }
    // `version` is a reload trigger (a hide/restore in the drawer), not a query parameter.
  }, [state, rating, demo, from, to, q, page, version]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const lastPage = view.state === 'loaded' ? Math.max(1, Math.ceil(view.data.total / view.data.pageSize)) : 1;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      {view.state === 'loaded' && <ReviewsRatingSummary summary={view.data.summary} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
          marginBottom: '1rem',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: 16,
          borderRadius: 'var(--r-card, 10px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div>
          <label htmlFor="avis-state" style={label}>
            État
          </label>
          <select id="avis-state" value={state} onChange={(e) => set(setState)(e.target.value)} style={field}>
            <option value="">Tous</option>
            <option value="visible">Visibles</option>
            <option value="hidden">Masqués</option>
          </select>
        </div>
        <div>
          <label htmlFor="avis-rating" style={label}>
            Note
          </label>
          <select id="avis-rating" value={rating} onChange={(e) => set(setRating)(e.target.value)} style={field}>
            <option value="">Toutes</option>
            <option value="negative">Avis négatifs (≤ 2★)</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={String(n)}>
                {n} / 5
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="avis-demo" style={label}>
            Démo
          </label>
          <select id="avis-demo" value={demo} onChange={(e) => set(setDemo)(e.target.value)} style={field}>
            <option value="">Tous</option>
            <option value="yes">Avis fictifs (démo)</option>
            <option value="no">Avis réels</option>
          </select>
        </div>
        <div>
          <label htmlFor="avis-from" style={label}>
            Du
          </label>
          <input id="avis-from" type="date" value={from} onChange={(e) => set(setFrom)(e.target.value)} style={field} />
        </div>
        <div>
          <label htmlFor="avis-to" style={label}>
            Au
          </label>
          <input id="avis-to" type="date" value={to} onChange={(e) => set(setTo)(e.target.value)} style={field} />
        </div>
        <div>
          <label htmlFor="avis-q" style={label}>
            Recherche
          </label>
          <input
            id="avis-q"
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Auteur, réparateur, e-mail, n° de commande ou texte"
            style={{ ...field, minWidth: 300 }}
          />
        </div>
        <button
          type="submit"
          style={{ ...field, backgroundColor: 'var(--navy, #25324f)', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
        >
          Rechercher
        </button>
      </form>

      {/* Quick Filter Chips */}
      <div
        data-testid="avis-quick-filters"
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          data-testid="filter-chip-all"
          onClick={() => {
            setState('');
            setRating('');
            setPage(1);
          }}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: state === '' && rating === '' ? 'var(--navy, #25324f)' : 'var(--line, #dfe2e2)',
            backgroundColor: state === '' && rating === '' ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
            color: state === '' && rating === '' ? '#ffffff' : 'var(--ink, #141414)',
            transition: 'all 0.15s ease',
          }}
        >
          Tous les avis
        </button>
        <button
          type="button"
          data-testid="filter-chip-negative"
          onClick={() => {
            setRating('negative');
            setState('');
            setPage(1);
          }}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: rating === 'negative' ? 'var(--navy, #25324f)' : 'var(--line, #dfe2e2)',
            backgroundColor: rating === 'negative' ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
            color: rating === 'negative' ? '#ffffff' : 'var(--ink, #141414)',
            transition: 'all 0.15s ease',
          }}
        >
          Avis négatifs (≤ 2★)
        </button>
        <button
          type="button"
          data-testid="filter-chip-hidden"
          onClick={() => {
            setState('hidden');
            setRating('');
            setPage(1);
          }}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: state === 'hidden' && rating !== 'negative' ? 'var(--navy, #25324f)' : 'var(--line, #dfe2e2)',
            backgroundColor: state === 'hidden' && rating !== 'negative' ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
            color: state === 'hidden' && rating !== 'negative' ? '#ffffff' : 'var(--ink, #141414)',
            transition: 'all 0.15s ease',
          }}
        >
          Avis masqués
        </button>
      </div>

      {view.state === 'loading' && <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des avis…</p>}

      {view.state === 'error' && (
        <p
          role="alert"
          style={{
            color: 'var(--red-text, #bd0e26)',
            backgroundColor: 'var(--red-soft, #feedf0)',
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
          }}
        >
          {view.message}
        </p>
      )}

      {view.state === 'loaded' &&
        (view.data.items.length === 0 ? (
          <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
            Aucun avis ne correspond à ces critères.
          </p>
        ) : (
          <>
            <div
              style={{
                overflowX: 'auto',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 8px)',
              }}
            >
              <table className="table" style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={cell}>Date</th>
                    <th style={cell}>Note</th>
                    <th style={cell}>Commentaire</th>
                    <th style={cell}>Auteur</th>
                    <th style={cell}>Réparateur</th>
                    <th style={cell}>Demande</th>
                    <th style={cell}>État</th>
                    <th style={{ ...cell, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {view.data.items.map((r) => {
                    const pill = demoPill(r.isDemo);
                    return (
                      <tr key={r.id} style={r.hidden ? { opacity: 0.7 } : undefined}>
                        <td style={cell}>{formatDateFr(r.createdAt)}</td>
                        <td style={cell}>{r.rating} / 5</td>
                        <td style={{ ...cell, maxWidth: 320 }}>
                          {pill && <span style={{ ...pillStyle, marginRight: 6 }}>{pill}</span>}
                          {excerpt(r.comment, 120)}
                        </td>
                        <td style={cell}>
                          @{r.authorUsername}
                          <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>{r.authorEmail}</div>
                        </td>
                        <td style={cell}>
                          @{r.repairerUsername}
                          <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>{r.repairerEmail}</div>
                        </td>
                        <td style={cell}>
                          {r.demandeTitle}
                          <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>{formatShortReference(r.commandeId)}</div>
                        </td>
                        <td style={cell}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <span
                              style={{
                                ...pillStyle,
                                backgroundColor: r.hidden ? 'var(--badge-danger-bg)' : 'var(--badge-success-bg)',
                                color: r.hidden ? 'var(--badge-danger-text)' : 'var(--badge-success-text)',
                              }}
                            >
                              {r.hidden ? 'Masqué' : 'Visible'}
                            </span>
                            {r.hidden && (
                              <span
                                data-testid="moderation-motif-pill"
                                style={{
                                  ...pillStyle,
                                  backgroundColor: 'var(--badge-warning-bg)',
                                  color: 'var(--badge-warning-text)',
                                  border: '1px solid var(--badge-warning-border)',
                                  fontSize: 11,
                                }}
                              >
                                Motif : {r.moderationMotif ? (REVIEW_MODERATION_MOTIF_LABEL[r.moderationMotif] ?? r.moderationMotif) : 'Non renseigné'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...cell, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => onOpen(r.id)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              fontWeight: 500,
                              backgroundColor: 'var(--badge-info-bg)',
                              border: '1px solid var(--badge-info-border)',
                              borderRadius: 'var(--r-field, 4px)',
                              color: 'var(--badge-info-text)',
                              cursor: 'pointer',
                            }}
                          >
                            Voir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>
                {view.data.total} avis · Page {view.data.page} sur {lastPage}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={view.data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ ...field, cursor: view.data.page <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={view.data.page >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ ...field, cursor: view.data.page >= lastPage ? 'not-allowed' : 'pointer' }}
                >
                  Suivant
                </button>
              </div>
            </div>
          </>
        ))}
    </div>
  );
}
