'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { REVIEW_MODERATION_MOTIF_LABEL, type AdminReviewDetail } from '@revime/shared';
import { createLatestGuard } from '../../lib/list-query';
import { formatEuros } from '../../lib/money';
import { commandeStatusLabel, commandeStepLabel } from '../../lib/status-labels';
import { demoPill, reviewStateLabel } from '../../lib/review-format';
import { HideReviewModal } from './HideReviewModal';
import { pillStyle } from './ReviewsList';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

/**
 * CF4-37 (spec §4.4). Full review, the commande behind it (link to /paiements filtered on it)
 * and the moderation trail. Same accessible-dialog shape as RefundDetailDrawer.
 */

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminReviewDetail };

function formatDateTimeFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const dt: React.CSSProperties = { fontSize: 12, color: 'var(--muted, #6b7280)', marginTop: 10 };
const dd: React.CSSProperties = { margin: '2px 0 0', fontSize: 14 };

export interface ReviewDetailDrawerProps {
  reviewId: string | null;
  onClose: () => void;
  onChanged: () => void;
  initialDetail?: AdminReviewDetail | null;
}

export function ReviewDetailDrawer({ reviewId, onClose, onChanged, initialDetail }: ReviewDetailDrawerProps) {
  const [view, setView] = useState<View>(
    initialDetail ? { state: 'loaded', data: initialDetail } : { state: 'loading' }
  );
  const [hiding, setHiding] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canModerate = hasPermission(adminMe, 'content.moderate');
  const [actionError, setActionError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const guard = useRef(createLatestGuard());

  const fetchDetail = useCallback(async (id: string) => {
    const n = guard.current.next();
    setView({ state: 'loading' });
    try {
      const res = await fetch(`/api/proxy/admin/reviews/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!guard.current.isLatest(n)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || "Impossible de charger l'avis." });
        return;
      }
      setView({ state: 'loaded', data: data as AdminReviewDetail });
    } catch {
      if (!guard.current.isLatest(n)) return;
      setView({ state: 'error', message: "Impossible de charger l'avis." });
    }
  }, []);

  useEffect(() => {
    setActionError(null);
    setHiding(false);
    if (initialDetail) {
      setView({ state: 'loaded', data: initialDetail });
    } else if (reviewId) {
      void fetchDetail(reviewId);
    } else {
      setView({ state: 'loading' });
    }
  }, [reviewId, initialDetail, fetchDetail]);

  useEffect(() => {
    if (reviewId) headingRef.current?.focus();
  }, [reviewId, view.state]);

  useEffect(() => {
    if (!reviewId || hiding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reviewId, hiding, onClose]);

  async function restore(id: string) {
    if (!window.confirm("Rétablir l'avis ? Il réapparaîtra sur le profil du réparateur et comptera de nouveau dans sa note.")) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/admin/reviews/${encodeURIComponent(id)}/restore`, { method: 'PATCH' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error?.message || "Impossible de rétablir l'avis.");
        return;
      }
      setView({ state: 'loaded', data: data as AdminReviewDetail });
      onChanged();
    } catch {
      setActionError("Erreur réseau. Impossible de rétablir l'avis.");
    }
  }

  if (!reviewId) return null;
  const d = view.state === 'loaded' ? view.data : null;
  const pill = d ? demoPill(d.isDemo) : null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 900 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-review-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 640,
          backgroundColor: 'var(--paper, #fff)',
          zIndex: 1000,
          overflowY: 'auto',
          padding: 24,
          boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 id="drawer-review-title" ref={headingRef} tabIndex={-1} style={{ fontSize: 20, margin: 0 }}>
            Avis
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les détails de l'avis"
            data-testid="close-review-drawer"
            style={{
              padding: '6px 12px',
              fontSize: '16px',
              fontWeight: 700,
              backgroundColor: 'transparent',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {view.state === 'loading' && <p style={{ color: 'var(--muted, #6b7280)' }}>Chargement…</p>}
        {view.state === 'error' && (
          <p role="alert" style={{ color: 'var(--red-text, #bd0e26)' }}>
            {view.message}
          </p>
        )}

        {d && (
          <>
            <p style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{reviewStateLabel(d)}</strong>
              {pill && <span style={pillStyle}>{pill}</span>}
            </p>

            {d.hidden && (
              <div
                data-testid="moderation-reason-callout"
                style={{
                  backgroundColor: 'var(--badge-warning-bg)',
                  border: '1px solid var(--badge-warning-border)',
                  borderRadius: 'var(--r-card, 8px)',
                  padding: '12px 16px',
                  margin: '12px 0 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}><Icon as={TriangleAlert} /></span>
                  <strong style={{ fontSize: 13, color: 'var(--badge-warning-text)' }}>Avis masqué par la modération</strong>
                </div>
                <div style={{ fontSize: 13, color: 'var(--badge-warning-text)' }}>
                  <strong>Motif :</strong>{' '}
                  <span data-testid="drawer-moderation-motif">
                    {d.moderationMotif
                      ? (REVIEW_MODERATION_MOTIF_LABEL[d.moderationMotif] ?? d.moderationMotif)
                      : (d.moderation?.motif ? (REVIEW_MODERATION_MOTIF_LABEL[d.moderation.motif] ?? d.moderation.motif) : 'Motif non renseigné')}
                  </span>
                </div>
                {d.moderation?.note && (
                  <div style={{ fontSize: 13, color: 'var(--badge-warning-text)' }}>
                    <strong>Précision :</strong> {d.moderation.note}
                  </div>
                )}
              </div>
            )}

            <dl style={{ margin: 0 }}>
              <dt style={dt}>Note globale</dt>
              <dd style={dd}>{d.rating} / 5</dd>
              <dt style={dt}>Qualité · Délai · Communication</dt>
              <dd style={dd}>
                {[d.qualityRating, d.delayRating, d.communicationRating].map((n) => (n === null ? '—' : `${n}/5`)).join(' · ')}
              </dd>
              <dt style={dt}>Commentaire</dt>
              <dd style={{ ...dd, whiteSpace: 'pre-wrap' }}>{d.comment ?? 'Sans commentaire'}</dd>
              <dt style={dt}>Publié le</dt>
              <dd style={dd}>{formatDateTimeFr(d.createdAt)}</dd>
              <dt style={dt}>Auteur</dt>
              <dd style={dd}>
                <Link href={`/utilisateurs/${encodeURIComponent(d.authorUserId)}`}>@{d.authorUsername}</Link> · {d.authorEmail}
              </dd>
              <dt style={dt}>Réparateur</dt>
              <dd style={dd}>
                <Link href={`/utilisateurs/${encodeURIComponent(d.repairerUserId)}`}>@{d.repairerUsername}</Link> ·{' '}
                {d.repairerEmail}
              </dd>
            </dl>

            <h3 style={{ fontSize: 15, margin: '20px 0 4px' }}>Commande</h3>
            <dl style={{ margin: 0 }}>
              <dt style={dt}>Demande</dt>
              <dd style={dd}>{d.demandeTitle}</dd>
              <dt style={dt}>N° de commande</dt>
              <dd style={dd}>
                <Link href={`/paiements?q=${encodeURIComponent(d.commande.id)}`}>{d.commande.id}</Link>
              </dd>
              <dt style={dt}>Montants</dt>
              <dd style={dd}>
                Réparation {formatEuros(d.commande.repairCents)} · Livraison {formatEuros(d.commande.shippingCents)} · Commission{' '}
                {formatEuros(d.commande.protectionCents)} · Total {formatEuros(d.commande.totalCents)}
              </dd>
              <dt style={dt}>Statut</dt>
              <dd style={dd}>
                {commandeStatusLabel(d.commande.status)}
                {d.commande.step ? ` · ${commandeStepLabel(d.commande.step)}` : ''}
              </dd>
              <dt style={dt}>Dates</dt>
              <dd style={dd}>
                Créée le {formatDateTimeFr(d.commande.createdAt)}
                {d.commande.paidAt && ` · payée le ${formatDateTimeFr(d.commande.paidAt)}`}
                {d.commande.releasedAt && ` · fonds débloqués le ${formatDateTimeFr(d.commande.releasedAt)}`}
              </dd>
            </dl>

            {d.moderation && (
              <>
                <h3 style={{ fontSize: 15, margin: '20px 0 4px' }}>Modération</h3>
                <dl style={{ margin: 0 }}>
                  <dt style={dt}>Motif</dt>
                  <dd style={dd}>
                    {d.moderation.motif ? REVIEW_MODERATION_MOTIF_LABEL[d.moderation.motif] : 'Motif non renseigné'}
                  </dd>
                  {d.moderation.note && (
                    <>
                      <dt style={dt}>Précision</dt>
                      <dd style={{ ...dd, whiteSpace: 'pre-wrap' }}>{d.moderation.note}</dd>
                    </>
                  )}
                  <dt style={dt}>Masqué le</dt>
                  <dd style={dd}>
                    {formatDateTimeFr(d.moderation.at)}
                    {d.moderation.moderatorUserId &&
                      ` par ${d.moderation.moderatorName ? `@${d.moderation.moderatorName}` : 'un compte supprimé'}`}
                  </dd>
                </dl>
              </>
            )}

            {actionError && (
              <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginTop: 16 }}>
                {actionError}
              </p>
            )}

            <div style={{ marginTop: 24 }}>
              {d.hidden ? (
                <button hidden={!canModerate}
                  type="button"
                  onClick={() => void restore(d.id)}
                  style={{ padding: '8px 16px', fontSize: 14, fontWeight: 500, borderRadius: 4, border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper, #fff)', color: 'var(--ink, #141414)', cursor: 'pointer' }}
                >
                  Rétablir l&apos;avis
                </button>
              ) : (
                <button hidden={!canModerate}
                  type="button"
                  onClick={() => setHiding(true)}
                  style={{ padding: '8px 16px', fontSize: 14, fontWeight: 500, borderRadius: 4, border: 'none', backgroundColor: 'var(--red-deep, #bd0e26)', color: '#fff', cursor: 'pointer' }}
                >
                  Masquer l&apos;avis
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {hiding && d && (
        <HideReviewModal
          reviewId={d.id}
          onClose={() => setHiding(false)}
          onHidden={() => {
            setHiding(false);
            onChanged();
            void fetchDetail(d.id);
          }}
        />
      )}
    </>
  );
}
