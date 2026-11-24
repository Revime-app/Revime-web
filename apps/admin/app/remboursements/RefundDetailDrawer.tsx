'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminRefundDetail, AdminAuditAction } from '@revime/shared';
import { REFUND_MOTIF_LABEL, formatDisputeRef, ADMIN_AUDIT_ACTION_LABEL } from '@revime/shared';
import { createLatestGuard } from '../../lib/list-query';
import { formatCardMethod, formatStripeRefundStatus } from '../../lib/refund-detail-format';
import { formatEuros } from '../../lib/money';
import { formatAuditStatus } from '../../components/RecentActions';
import { CopyableReference } from '../../components/CopyableReference';
import { disputeStatusLabel } from '../../lib/dispute-status-label';
import { isDeletedUser, DELETED_USER_NAME } from '../../lib/user-display';

/**
 * CF4-19 (task 7 brief; spec §4). Detail drawer for a refund row: fetches
 * `/api/proxy/admin/refunds/{commandeId}` on open, same accessible-dialog shape
 * as `DisputeDossierDrawer` (role=dialog, aria-modal, Escape closes) plus the
 * brief's own requirement to focus the heading on open.
 */

export interface RefundDetailDrawerProps {
  commandeId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminRefundDetail };

export function RefundDetailDrawer({ commandeId, isOpen, onClose }: RefundDetailDrawerProps) {
  const [view, setView] = useState<View>({ state: 'loading' });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Same `createLatestGuard` used by the list fetch (per the task instructions):
  // a slower earlier drawer fetch (e.g. re-opening a different row quickly)
  // must not overwrite the newer row's detail.
  const loadGuardRef = useRef(createLatestGuard());

  const fetchDetail = useCallback(async (id: string) => {
    const requestNumber = loadGuardRef.current.next();
    setView({ state: 'loading' });
    try {
      const res = await fetch(`/api/proxy/admin/refunds/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger le remboursement.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminRefundDetail });
    } catch {
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      setView({ state: 'error', message: 'Impossible de charger le remboursement.' });
    }
  }, []);

  useEffect(() => {
    if (isOpen && commandeId) {
      void fetchDetail(commandeId);
    } else {
      setView({ state: 'loading' });
    }
  }, [isOpen, commandeId, fetchDetail]);

  // Focus the heading on open (accessibility requirement, task 7 brief).
  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus();
    }
  }, [isOpen, view.state]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !commandeId) return null;

  const data = view.state === 'loaded' ? view.data : null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 900,
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-refund-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '720px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 901,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2
              id="drawer-refund-title"
              ref={headingRef}
              tabIndex={-1}
              style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--ink, #141414)', outline: 'none' }}
            >
              Remboursement
            </h2>
            {data && (
              <CopyableReference
                value={data.commandeId}
                prefix="CMD"
                href={`/paiements?commande=${data.commandeId}`}
              />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le détail du remboursement"
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

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '24px' }}>
          {view.state === 'loading' && (
            <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement du remboursement…</p>
          )}

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

          {data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Main info card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-card, 6px)',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <dl style={{ margin: 0, display: 'contents' }}>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Client</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{isDeletedUser(data.clientName) ? DELETED_USER_NAME : data.clientName}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Réparateur</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{isDeletedUser(data.repairerName) ? DELETED_USER_NAME : data.repairerName}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Demande</dt>
                      <dd style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>{data.demandeTitle}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Montant initial</dt>
                      <dd style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--ink, #141414)' }}>
                        <strong>{formatEuros(data.totalCents)}</strong>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Line items table card */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink, #141414)' }}>Détail par ligne</h3>
                <div
                  style={{
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 'var(--r-card, 6px)',
                    overflow: 'hidden',
                  }}
                >
                  <table className="table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--badge-neutral-bg)' }}>
                        <th style={{ padding: '8px 12px' }}>Ligne</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Payé</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Remboursé</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderTop: '1px solid var(--line, #dfe2e2)' }}>
                        <td style={{ padding: '8px 12px' }}>Réparation</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.repair.paid)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.repair.refunded)}</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid var(--line, #dfe2e2)' }}>
                        <td style={{ padding: '8px 12px' }}>Livraison (dont assurance {formatEuros(data.lines.shipping.insuranceCents)})</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.shipping.paid)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.shipping.refunded)}</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid var(--line, #dfe2e2)' }}>
                        <td style={{ padding: '8px 12px' }}>Commission</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.protection.paid)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatEuros(data.lines.protection.refunded)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status and details card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-card, 6px)',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <dl style={{ margin: 0, display: 'contents' }}>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Montant remboursable</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(data.refundableCents)}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Réellement remboursé</dt>
                      <dd style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>{formatEuros(data.refundedCents)}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Part du réparateur</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>
                        {formatEuros(data.shareCents)}
                        {data.shareOwedCents > 0 && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--badge-warning-bg)',
                              color: 'var(--badge-warning-text)',
                              border: '1px solid var(--badge-warning-border)',
                            }}
                          >
                            due
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Moyen de paiement</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatCardMethod(data.stripe)}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Statut Stripe</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatStripeRefundStatus(data.stripe)}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Administrateur</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{data.adminName ?? 'Non renseigné'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Motif</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{data.motif === null ? 'Non renseigné' : REFUND_MOTIF_LABEL[data.motif]}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Note</dt>
                      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{data.note ?? '—'}</dd>
                    </div>
                    {data.disputeNumber != null && (
                      <div>
                        <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Litige associé</dt>
                        <dd style={{ margin: 0, fontSize: '14px' }}>
                          <Link
                            href={`/litiges?q=${encodeURIComponent(String(data.disputeNumber))}`}
                            style={{ color: 'var(--ink, #141414)', fontWeight: 600, textDecoration: 'underline' }}
                          >
                            {formatDisputeRef(data.disputeNumber)} ({disputeStatusLabel(data.disputeStatus ?? null)})
                          </Link>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* History table card */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink, #141414)' }}>Historique</h3>
                {data.history.length === 0 ? (
                  <p style={{ color: 'var(--muted, #6b7280)', fontSize: 13, margin: 0 }}>Aucun événement enregistré.</p>
                ) : (
                  <div
                    style={{
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-card, 6px)',
                      overflow: 'hidden',
                    }}
                  >
                    <table className="table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--badge-neutral-bg)' }}>
                          <th style={{ padding: '8px 12px' }}>Date</th>
                          <th style={{ padding: '8px 12px' }}>Action</th>
                          <th style={{ padding: '8px 12px' }}>E-mail</th>
                          <th style={{ padding: '8px 12px' }}>Résultat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map((h, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid var(--line, #dfe2e2)' }}>
                            <td style={{ padding: '8px 12px' }}>{formatDateFr(h.at)}</td>
                            <td style={{ padding: '8px 12px' }}>{ADMIN_AUDIT_ACTION_LABEL[h.action as AdminAuditAction] ?? h.action}</td>
                            <td style={{ padding: '8px 12px' }}>{h.actorEmail}</td>
                            <td style={{ padding: '8px 12px' }}>{formatAuditStatus(h.statusCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <Link
                  href={`/remboursement?commande=${encodeURIComponent(data.commandeId)}`}
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: 'var(--navy)',
                    color: '#fff',
                    borderRadius: 'var(--r-field, 4px)',
                    textDecoration: 'none',
                  }}
                >
                  Ouvrir le remboursement
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
