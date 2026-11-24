'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminCancellationDetail } from '@revime/shared';
import { formatDisputeRef, CANCELLATION_REASON_LABEL } from '@revime/shared';
import { RefundForm, type RefundFormSubmitBody } from '../../components/RefundForm';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { disputeStatusLabel } from '../../lib/dispute-status-label';
import { cancellationStatusLabel, frozenStepLabel, transferredWarning } from '../../lib/cancellation-admin';
import { formatEuros } from '../../lib/money';
import { CopyableReference } from '../../components/CopyableReference';
import { isDeletedUser, DELETED_USER_NAME } from '../../lib/user-display';

export interface CancellationDrawerProps {
  id: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDecided: () => void;
  initialDetail?: AdminCancellationDetail | null;
}

/** Spec §3. */
const REASON_LABEL: Record<string, string> = {
  NO_LONGER_NEEDED: "Je n'ai plus besoin de la réparation",
  TOO_SLOW: 'Délai trop long',
  REPAIRER_UNRESPONSIVE: 'Le réparateur ne répond pas',
  OTHER_SOLUTION: "J'ai trouvé une autre solution",
  OTHER: 'Autre',
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

/** CF4-27 (spec §4.5). The « Annulations » drawer: reason/comment, the order's state, and,
 * with `refunds.issue`, the two decisions. A lost race (the request is no longer PENDING by
 * the time the admin acts) shows the server's message and reloads, same shape as the litiges
 * drawer's `assign`/`resolve` handlers. */
export function CancellationDrawer({ id, isOpen, onClose, onDecided, initialDetail }: CancellationDrawerProps) {
  const [detail, setDetail] = useState<AdminCancellationDetail | null>(initialDetail ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showRefuse, setShowRefuse] = useState(false);
  const [refuseNote, setRefuseNote] = useState('');
  const [refuseError, setRefuseError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);

  const [showApprove, setShowApprove] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const adminMe = useAdminMe();
  const canDecide = hasPermission(adminMe, 'refunds.issue');

  const load = useCallback(async () => {
    if (!id || initialDetail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/admin/cancellations/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message || 'Impossible de charger la demande.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as AdminCancellationDetail;
      setDetail(data);
    } catch {
      setError('Erreur de communication.');
    } finally {
      setLoading(false);
    }
  }, [id, initialDetail]);

  useEffect(() => {
    if (initialDetail) {
      setDetail(initialDetail);
      return;
    }
    if (isOpen && id) {
      void load();
    } else {
      setDetail(null);
      setError(null);
      setShowRefuse(false);
      setRefuseNote('');
      setRefuseError(null);
      setShowApprove(false);
      setApproveError(null);
    }
  }, [isOpen, id, load, initialDetail]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showRefuse && !showApprove) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showRefuse, showApprove, onClose]);

  if (!isOpen || !id) return null;

  const handleRefuse = async () => {
    if (!id || refusing || refuseNote.trim().length === 0) return;
    setRefusing(true);
    setRefuseError(null);
    try {
      const res = await fetch(`/api/proxy/admin/cancellations/${encodeURIComponent(id)}/refuse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: refuseNote.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setRefuseError(body?.message || 'Le refus a échoué.');
        await load();
        return;
      }
      setShowRefuse(false);
      onDecided();
      onClose();
    } catch {
      setRefuseError('Erreur de communication.');
    } finally {
      setRefusing(false);
    }
  };

  const handleApprove = async (body: RefundFormSubmitBody) => {
    if (!id) return;
    setApproveError(null);
    const res = await fetch(`/api/proxy/admin/cancellations/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = (await res.json().catch(() => null)) as { message?: string } | null;
      const message = responseBody?.message || "L'acceptation a échoué.";
      setApproveError(message);
      await load();
      throw new Error(message);
    }
    setShowApprove(false);
    onDecided();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Détail de la demande d'annulation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(1, 5, 36, 0.35)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !showRefuse && !showApprove) onClose();
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Demande d&apos;annulation</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>
            ×
          </button>
        </div>

        {loading && <p>Chargement…</p>}
        {error && (
          <p role="alert" style={{ color: 'var(--red-text, #bd0e26)' }}>
            {error}
          </p>
        )}

        {detail && (
          <>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600, fontSize: '15px', color: 'var(--ink, #141414)' }}>
              {detail.demandeTitle}
            </p>
            <div style={{ margin: '0 0 12px 0' }}>
              <CopyableReference
                value={detail.commandeId}
                prefix="CMD"
                href={`/paiements?commande=${detail.commandeId}`}
              />
            </div>

            {/* Requester Info Box */}
            <div
              data-testid="cancellation-requester-box"
              style={{
                margin: '0 0 16px 0',
                padding: '12px 14px',
                backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 8px)',
              }}
            >
              <div style={{ fontSize: '13px', color: 'var(--ink, #141414)', fontWeight: 500 }}>
                Demandée par : {isDeletedUser(detail.requestedByName) ? DELETED_USER_NAME : (detail.requestedByName || 'Inconnu')} (
                {detail.requestedByRole === 'CLIENT'
                  ? 'Client'
                  : detail.requestedByRole === 'REPAIRER'
                  ? 'Réparateur'
                  : 'Admin'}
                ) le {formatDate(detail.createdAt)}
              </div>
            </div>

            <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
              {isDeletedUser(detail.clientName) ? DELETED_USER_NAME : detail.clientName} → {isDeletedUser(detail.repairerName) ? DELETED_USER_NAME : detail.repairerName}
            </p>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
              Statut : {cancellationStatusLabel(detail.status)} · Étape gelée : {frozenStepLabel(detail.step)}
            </p>
            {detail.disputeNumber != null && (
              <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
                Litige associé :{' '}
                <Link
                  href={`/litiges?q=${encodeURIComponent(String(detail.disputeNumber))}`}
                  style={{ color: 'var(--ink, #141414)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  {formatDisputeRef(detail.disputeNumber)} ({disputeStatusLabel(detail.disputeStatus ?? null)})
                </Link>
              </p>
            )}
            <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
              <span style={{ fontWeight: 600 }}>Motif : </span>
              {CANCELLATION_REASON_LABEL[detail.reason] ?? REASON_LABEL[detail.reason] ?? detail.reason}
            </p>

            {/* Client comment in quotation block */}
            {detail.comment && (
              <blockquote
                data-testid="cancellation-comment-block"
                style={{
                  margin: '0 0 16px 0',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
                  borderLeft: '3px solid var(--line, #dfe2e2)',
                  borderRadius: '0 var(--r-card, 6px) var(--r-card, 6px) 0',
                  fontStyle: 'italic',
                  color: 'var(--ink, #141414)',
                  fontSize: '13px',
                }}
              >
                « {detail.comment} »
              </blockquote>
            )}

            {/* Decision block for non-pending */}
            {detail.status !== 'PENDING' && (
              <div
                data-testid="cancellation-decision-block"
                style={{
                  margin: '16px 0',
                  padding: '16px',
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-card, 8px)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink, #141414)', marginBottom: '8px' }}>
                  Décision
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                  Décidée par : {isDeletedUser(detail.decidedByName) ? DELETED_USER_NAME : (detail.decidedByName ?? 'Admin')}{detail.decidedAt ? ` le ${formatDate(detail.decidedAt)}` : ''}
                </p>
                {detail.status === 'REFUSED' && detail.refusalNote && (
                  <div style={{ marginTop: '8px', fontSize: '13px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>Note de refus : </span>
                    <span style={{ color: 'var(--muted, #6b7280)' }}>{detail.refusalNote}</span>
                  </div>
                )}
                {detail.status === 'APPROVED' && detail.refund && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink, #141414)', marginBottom: '6px' }}>
                      Détail du remboursement :
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--line, #dfe2e2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted, #6b7280)' }}>Réparation :</span>
                        <span style={{ fontWeight: 500 }}>{formatEuros(detail.refund.repairCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted, #6b7280)' }}>Livraison :</span>
                        <span style={{ fontWeight: 500 }}>{formatEuros(detail.refund.shippingCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted, #6b7280)' }}>Protection client :</span>
                        <span style={{ fontWeight: 500 }}>{formatEuros(detail.refund.protectionCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted, #6b7280)' }}>Assurance :</span>
                        <span style={{ fontWeight: 500 }}>{formatEuros(detail.refund.insuranceCents)}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderTop: '1px solid var(--line, #dfe2e2)',
                          paddingTop: '6px',
                          marginTop: '2px',
                          fontWeight: 600,
                        }}
                      >
                        <span>Total remboursé :</span>
                        <span>
                          {formatEuros(
                            detail.refund.repairCents +
                              detail.refund.shippingCents +
                              detail.refund.protectionCents +
                              detail.refund.insuranceCents
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Montant payé : {formatEuros(detail.totalCents)}</p>

            {transferredWarning(detail) && (
              <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginBottom: '16px' }}>
                {transferredWarning(detail)}
              </p>
            )}

            {canDecide && detail.status === 'PENDING' && !showRefuse && !showApprove && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowApprove(true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    backgroundColor: 'var(--navy, #25324f)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Accepter et rembourser
                </button>
                <button
                  type="button"
                  onClick={() => setShowRefuse(true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    backgroundColor: 'var(--paper, #ffffff)',
                    color: 'var(--red-text, #bd0e26)',
                    border: '1px solid var(--line, #dfe2e2)',
                    cursor: 'pointer',
                  }}
                >
                  Refuser
                </button>
              </div>
            )}

            {showRefuse && (
              <div style={{ marginTop: '16px' }}>
                <label htmlFor="refuse-note" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Raison du refus (visible par le client)
                </label>
                <textarea
                  id="refuse-note"
                  value={refuseNote}
                  onChange={(e) => setRefuseNote(e.target.value)}
                  maxLength={300}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--line, #dfe2e2)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                />
                {refuseError && (
                  <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginTop: '6px' }}>
                    {refuseError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => void handleRefuse()}
                    disabled={refusing || refuseNote.trim().length === 0}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      backgroundColor: 'var(--red-deep, #bd0e26)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: refusing || refuseNote.trim().length === 0 ? 'not-allowed' : 'pointer',
                      opacity: refusing || refuseNote.trim().length === 0 ? 0.6 : 1,
                    }}
                  >
                    Confirmer le refus
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRefuse(false)}
                    disabled={refusing}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      backgroundColor: 'var(--paper, #ffffff)',
                      color: 'var(--ink, #141414)',
                      border: '1px solid var(--line, #dfe2e2)',
                      cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {showApprove && (
              <div style={{ marginTop: '16px' }}>
                {approveError && (
                  <p role="alert" style={{ color: 'var(--red-text, #bd0e26)' }}>
                    {approveError}
                  </p>
                )}
                <RefundForm
                  mode="dispute"
                  fixedMotif="CLIENT_CANCELLED"
                  summary={{
                    order: {
                      repairCents: detail.refund.repairCents,
                      shippingCents: detail.refund.shippingCents,
                      insuranceCents: detail.refund.insuranceCents,
                      protectionCents: detail.refund.protectionCents,
                      transferred: detail.transferred,
                    },
                    suggestion: {
                      repairCents: detail.refund.repairCents,
                      shippingCents: detail.refund.shippingCents,
                      protectionCents: detail.refund.protectionCents,
                    },
                  }}
                  onSubmit={handleApprove}
                />
                <button
                  type="button"
                  onClick={() => setShowApprove(false)}
                  style={{
                    marginTop: '8px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    backgroundColor: 'var(--paper, #ffffff)',
                    color: 'var(--ink, #141414)',
                    border: '1px solid var(--line, #dfe2e2)',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
