'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COMMANDE_STATUS_LABEL,
  STEP_LABEL,
  type AdminCommandeDetail,
} from '@revime/shared';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { CopyableReference } from '../../../components/CopyableReference';
import { CommandeStepper } from '../../../components/CommandeStepper';
import { Can } from '../../../components/Can';
import { formatEuros } from '../../../lib/money';
import { getVerdictLabel } from '../../../lib/dispute-status-label';
import { formatUserDisplay } from '../../../lib/user-display';
import { shipmentStatusLabel, storedDisputeStatusLabel } from '../../../lib/status-labels';
import { RefundModal } from '../../../components/RefundModal';
import { CancelConfirmModal } from '../../../components/CancelConfirmModal';
import { PayShareConfirmModal } from '../../../components/PayShareConfirmModal';

const PARTS_LABEL: Record<string, string> = {
  UNKNOWN: 'Non spécifié',
  ORIGINAL: "Pièces d'origine",
  COMPATIBLE: 'Pièces compatibles',
  CLIENT_SUPPLIED: 'Pièces fournies par le client',
};

function deliveryBadge(delivery: string): string {
  switch (delivery) {
    case 'PARCEL':
      return 'Colis';
    case 'WORKSHOP':
      return 'Atelier';
    case 'HOME':
      return 'À domicile';
    default:
      return delivery;
  }
}

function statusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'PAID':
      return { backgroundColor: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: '1px solid var(--badge-success-border)' };
    case 'PENDING_PAYMENT':
      return { backgroundColor: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: '1px solid var(--badge-warning-bg)' };
    case 'REFUNDED':
      return { backgroundColor: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: '1px solid var(--badge-danger-border)' };
    case 'ABANDONED':
      return { backgroundColor: 'var(--badge-neutral-bg)', color: 'var(--muted)', border: '1px solid var(--line)' };
    default:
      return { backgroundColor: 'var(--badge-neutral-bg)', color: 'var(--ink, #141414)', border: '1px solid var(--line, #dfe2e2)' };
  }
}

export interface CommandeDetailViewProps {
  initialData?: AdminCommandeDetail | null;
  initialError?: string | null;
  id?: string;
  onRefresh?: () => void;
  initialRefundModalOpen?: boolean;
  initialCancelModalOpen?: boolean;
  initialPayShareModalOpen?: boolean;
}

export function CommandeDetailView({
  initialData = null,
  initialError = null,
  id,
  onRefresh,
  initialRefundModalOpen = false,
  initialCancelModalOpen = false,
  initialPayShareModalOpen = false,
}: CommandeDetailViewProps) {
  const [data, setData] = useState<AdminCommandeDetail | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Modals state
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(initialRefundModalOpen);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(initialCancelModalOpen);
  const [isPayShareModalOpen, setIsPayShareModalOpen] = useState(initialPayShareModalOpen);
  const [remindBusyLeg, setRemindBusyLeg] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [payShareError, setPayShareError] = useState<string | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxPhoto) {
        setLightboxPhoto(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxPhoto]);

  const handleCancel = async () => {
    if (!data) return;
    setBusy(true);
    setCancelError(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(data.commandeId)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error?.message || 'Erreur lors de l’annulation de la commande.';
        setCancelError(msg);
        setActionError(msg);
        return;
      }
      setIsCancelModalOpen(false);
      setActionSuccess('Commande annulée avec succès.');
      if (onRefresh) onRefresh();
    } catch {
      const msg = 'Une erreur réseau est survenue.';
      setCancelError(msg);
      setActionError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handlePayShare = async () => {
    if (!data) return;
    setBusy(true);
    setPayShareError(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(data.commandeId)}/refund/pay-share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error?.message || 'Erreur lors du versement de la part réparateur.';
        setPayShareError(msg);
        setActionError(msg);
        return;
      }
      setIsPayShareModalOpen(false);
      setActionSuccess('Part réparateur versée avec succès.');
      if (onRefresh) onRefresh();
    } catch {
      const msg = 'Une erreur réseau est survenue.';
      setPayShareError(msg);
      setActionError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSendReminder = async (leg: string) => {
    if (!data) return;
    setRemindBusyLeg(leg);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(
        `/api/proxy/admin/commandes/${encodeURIComponent(data.commandeId)}/shipments/${encodeURIComponent(leg)}/remind`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setActionError(errData?.error?.message || 'Erreur lors de l’envoi du rappel.');
        return;
      }
      setActionSuccess('Rappel de dépôt envoyé avec succès.');
      if (onRefresh) onRefresh();
    } catch {
      setActionError('Une erreur réseau est survenue.');
    } finally {
      setRemindBusyLeg(null);
    }
  };

  if (error) {
    return (
      <div className="page page--detail">
        <Breadcrumbs
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Paiements', href: '/paiements' },
            { label: 'Erreur' },
          ]}
        />
        <div style={{ marginBottom: '16px', marginTop: '16px' }}>
          <Link
            href="/paiements"
            style={{
              color: 'var(--muted, #6b7280)',
              textDecoration: 'none',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500,
            }}
          >
            ← Retour aux paiements
          </Link>
        </div>

        <div
          className="card"
          role="alert"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            marginTop: '24px',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
            Commande introuvable
          </h2>
          <p style={{ color: 'var(--muted, #6b7280)', fontSize: '14px', marginBottom: '24px' }}>
            La commande demandée n’existe pas ou n’a pas pu être chargée.
          </p>
          <Link
            href="/paiements"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--on-accent, #ffffff)',
              backgroundColor: 'var(--navy, #25324f)',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            ← Retour aux paiements
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page page--detail">
        <div style={{ padding: '32px 0', color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
          Chargement de la commande...
        </div>
      </div>
    );
  }

  const d = data;
  const statusLabel = (COMMANDE_STATUS_LABEL as Record<string, string>)[d.status] || d.status;
  const stepLabel = d.step ? (STEP_LABEL[d.step] || d.step) : null;

  return (
    <div className="page page--detail">
      {/* Lightbox Modal */}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(37, 50, 79, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              aria-label="Fermer"
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                fontSize: '28px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            <img
              src={lightboxPhoto}
              alt="Photo agrandie"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              }}
            />
          </div>
        </div>
      )}

      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Paiements', href: '/paiements' },
          { label: d.reference },
        ]}
      />

      {/* Top Header */}
      <div style={{ marginTop: '16px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '12px' }}>
          <Link
            href="/paiements"
            style={{
              color: 'var(--muted, #6b7280)',
              textDecoration: 'none',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500,
            }}
          >
            ← Retour aux paiements
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Commande</span>
              <CopyableReference value={d.reference} prefix="CMD" />
            </h1>

            {/* Status Badge */}
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '12px',
                ...statusBadgeStyle(d.status),
              }}
            >
              {statusLabel}
            </span>

            {/* Step Badge */}
            {stepLabel && (
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--badge-info-bg)',
                  color: 'var(--navy-text, #25324f)',
                  border: '1px solid var(--badge-info-border)',
                }}
              >
                {stepLabel}
              </span>
            )}

            {/* Delivery Badge */}
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                padding: '3px 10px',
                borderRadius: '12px',
                backgroundColor: 'var(--badge-neutral-bg)',
                color: 'var(--ink, #141414)',
                border: '1px solid var(--line, #dfe2e2)',
              }}
            >
              {deliveryBadge(d.delivery)}
            </span>
          </div>
        </div>
      </div>

      {/* Action feedback banners */}
      {actionError && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--badge-danger-bg)',
            border: '1px solid var(--badge-danger-border)',
            color: 'var(--badge-danger-text)',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          style={{
            backgroundColor: 'var(--badge-success-bg)',
            border: '1px solid var(--badge-success-border)',
            color: 'var(--badge-success-text)',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="detail-grid">
        {/* LEFT COLUMN: Lifecycle, Content, Parcels, Reviews & Disputes (1.6fr) */}
        <div data-testid="detail-grid-left">
          {/* 1. Lifecycle Stepper */}
          <CommandeStepper
            timeline={d.timeline}
            dispute={d.dispute}
            cancellation={d.cancellation}
          />

          {/* 2. Demande & Accepted Offer */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', margin: 0 }}>
                  {d.demande.title}
                </h2>
                {d.demande.categoryLabel && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      color: 'var(--navy-text, #25324f)',
                      border: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    {d.demande.categoryLabel}
                  </span>
                )}
                {d.demande.faultType && (
                  <span
                    data-testid="commande-fault-type-badge"
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--navy-soft, #f0f1f5)',
                      color: 'var(--navy-text, #25324f)',
                      border: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    Panne : {d.demande.faultType.labelFr}
                  </span>
                )}
              </div>

              <Link
                href={`/demandes/${encodeURIComponent(d.demande.id)}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--navy-text, #25324f)',
                  textDecoration: 'none',
                }}
              >
                Voir la demande ↗
              </Link>
            </div>

            {d.demande.description && (
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--ink, #141414)',
                  lineHeight: 1.5,
                  marginBottom: '16px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {d.demande.description}
              </p>
            )}

            {/* Photos Gallery */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted, #6b7280)', marginBottom: '8px' }}>
                Photos attachées ({d.demande.photos.length}) :
              </div>
              {d.demande.photos.length === 0 ? (
                <div style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--muted, #6b7280)' }}>
                  Aucune photo attachée à la demande.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {d.demande.photos.map((photoUrl, idx) => (
                    <button
                      key={photoUrl || idx}
                      type="button"
                      onClick={() => setLightboxPhoto(photoUrl)}
                      style={{
                        padding: 0,
                        border: '1px solid var(--line, #dfe2e2)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: 'none',
                      }}
                      title="Cliquer pour agrandir"
                    >
                      <img
                        src={photoUrl}
                        alt={`Photo ${idx + 1}`}
                        style={{
                          width: '72px',
                          height: '72px',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Accepted Quote / Offer details */}
            {d.offer && (
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
                  Devis accepté
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)' }}>Montant : </span>
                    <strong style={{ color: 'var(--ink, #141414)' }}>{formatEuros(d.offer.amountCents)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)' }}>Pièces : </span>
                    <span style={{ color: 'var(--ink, #141414)' }}>
                      {d.offer.parts ? (PARTS_LABEL[d.offer.parts] || d.offer.parts) : 'Non spécifié'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)' }}>Garantie : </span>
                    <span style={{ color: 'var(--ink, #141414)' }}>{d.offer.warranty || 'Non spécifiée'}</span>
                  </div>
                </div>
                {d.offer.message && (
                  <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                    <em>« {d.offer.message} »</em>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Parcel Shipping Boxtal (when PARCEL or shipments exist) */}
          {(d.delivery === 'PARCEL' || d.shipments.length > 0) && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
                Expédition Colis Boxtal
              </h2>

              {d.shipments.length === 0 ? (
                <p style={{ color: 'var(--muted, #6b7280)', fontSize: '14px', margin: 0 }}>
                  Aucune expédition enregistrée pour cette commande.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                        <th style={{ padding: '8px 4px' }}>Trajet</th>
                        <th style={{ padding: '8px 4px' }}>Transporteur</th>
                        <th style={{ padding: '8px 4px' }}>N° Suivi / Boxtal</th>
                        <th style={{ padding: '8px 4px' }}>État</th>
                        <th style={{ padding: '8px 4px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.shipments.map((s, idx) => (
                        <tr key={s.leg || idx} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                          <td style={{ padding: '10px 4px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                            {(s.leg as string) === 'OUTBOUND' || (s.leg as string) === 'INBOUND' ? 'Aller (Client → Réparateur)' : 'Retour (Réparateur → Client)'}
                          </td>
                          <td style={{ padding: '10px 4px' }}>{s.carrierLabel || '—'}</td>
                          <td style={{ padding: '10px 4px', fontFamily: 'monospace' }}>
                            {s.boxtalOrderId || '—'}
                          </td>
                          <td style={{ padding: '10px 4px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '12px',
                                backgroundColor: s.status === 'DELIVERED' ? 'var(--badge-success-bg)' : 'var(--badge-neutral-bg)',
                                color: s.status === 'DELIVERED' ? 'var(--badge-success-text)' : 'var(--ink, #141414)',
                              }}
                            >
                              {shipmentStatusLabel(s.status)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 4px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <a
                                href={`/api/proxy/admin/commandes/${encodeURIComponent(d.commandeId)}/shipments/${s.leg}/label`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  color: 'var(--navy-text, #25324f)',
                                  backgroundColor: 'var(--badge-neutral-bg)',
                                  border: '1px solid var(--line, #dfe2e2)',
                                  borderRadius: '4px',
                                  textDecoration: 'none',
                                }}
                              >
                                Étiquette PDF
                              </a>
                              <Can p="shipping.operate">
                                <button
                                  type="button"
                                  disabled={busy || remindBusyLeg === s.leg}
                                  onClick={() => handleSendReminder(s.leg)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    color: 'var(--ink, #141414)',
                                    backgroundColor: 'var(--paper, #ffffff)',
                                    border: '1px solid var(--line, #dfe2e2)',
                                    borderRadius: '4px',
                                    cursor: busy || remindBusyLeg === s.leg ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {remindBusyLeg === s.leg ? 'Envoi…' : 'Rappel dépôt'}
                                </button>
                              </Can>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4. Customer Review */}
          {d.review && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', margin: 0 }}>
                  Avis du client
                </h2>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--badge-warning-text)',
                  }}
                >
                  {'★'.repeat(d.review.rating)}
                  {'☆'.repeat(5 - d.review.rating)}
                  <span style={{ marginLeft: '4px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
                    ({d.review.rating}/5)
                  </span>
                </span>
              </div>

              {d.review.comment ? (
                <blockquote
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: 'var(--ink, #141414)',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                    padding: '8px 12px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    borderLeft: '3px solid var(--navy, #25324f)',
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  « {d.review.comment} »
                </blockquote>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
                  Aucun commentaire textuel laissé par le client.
                </div>
              )}
            </div>
          )}

          {/* 5. Dispute Details */}
          {d.dispute && (
            <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--badge-warning-text)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', margin: 0 }}>
                    Litige {d.dispute.disputeNumber}
                  </h2>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--badge-warning-bg)',
                      color: 'var(--badge-warning-text)',
                    }}
                  >
                    {storedDisputeStatusLabel(d.dispute.status)}
                  </span>
                </div>

                <Link
                  href={`/litiges?q=${encodeURIComponent(d.dispute.disputeNumber)}`}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--navy-text, #25324f)',
                    textDecoration: 'none',
                  }}
                >
                  Dossier litige ↗
                </Link>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--ink, #141414)', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Motif :</strong> {d.dispute.reason}
                </p>
                {d.dispute.verdict && (
                  <p style={{ margin: 0 }}>
                    <strong>Verdict :</strong> {getVerdictLabel(d.dispute.verdict)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 6. Conversation / Messaging Card */}
          {d.conversationId && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', margin: 0 }}>
                  Messagerie &amp; Échanges
                </h2>
                <Link
                  href={`/demandes/${encodeURIComponent(d.demande.id)}`}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--navy-text, #25324f)',
                    textDecoration: 'none',
                  }}
                >
                  Consulter les messages ↗
                </Link>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0 }}>
                Un fil de discussion existe entre le client et le réparateur sur cette demande.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Parties, Financial Breakdown, Stripe Links, Action Center (1.1fr) */}
        <div data-testid="detail-grid-right">
          {/* 1. Acteurs de la commande */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
              Acteurs de la commande
            </h2>

            {/* Client Card */}
            <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--line, #dfe2e2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted, #6b7280)' }}>
                  Client
                </span>
                <Link
                  href={`/utilisateurs/${encodeURIComponent(d.client.userId)}`}
                  style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-text, #25324f)', textDecoration: 'none' }}
                >
                  Profil ↗
                </Link>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {formatUserDisplay(d.client.name, d.client.email).name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                {formatUserDisplay(d.client.name, d.client.email).email}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                {d.client.phone || 'Téléphone non renseigné'} · {d.client.city || 'Ville non renseignée'}
              </div>
            </div>

            {/* Repairer Card */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted, #6b7280)' }}>
                  Réparateur
                </span>
                <Link
                  href={`/utilisateurs/${encodeURIComponent(d.repairer.userId)}`}
                  style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-text, #25324f)', textDecoration: 'none' }}
                >
                  Profil ↗
                </Link>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {formatUserDisplay(d.repairer.name, d.repairer.email).name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                {formatUserDisplay(d.repairer.name, d.repairer.email).email}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                {d.repairer.phone || 'Téléphone non renseigné'} · {d.repairer.city || 'Ville non renseignée'}
              </div>
            </div>
          </div>

          {/* 2. Détail financier & Séquestre */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
              Détail financier & séquestre
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #6b7280)' }}>
                <span>Prestation de réparation :</span>
                <span style={{ color: 'var(--ink, #141414)' }}>{formatEuros(d.amounts.repairCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #6b7280)' }}>
                <span>Frais de livraison :</span>
                <span style={{ color: 'var(--ink, #141414)' }}>{formatEuros(d.amounts.shippingCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #6b7280)' }}>
                <span>Commission :</span>
                <span style={{ color: 'var(--ink, #141414)' }}>{formatEuros(d.amounts.protectionCents)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--line, #dfe2e2)',
                  paddingTop: '8px',
                  marginTop: '4px',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--ink, #141414)',
                }}
              >
                <span>Total payé :</span>
                <span>{formatEuros(d.amounts.totalCents)}</span>
              </div>
            </div>

            {/* Escrow Status Tag */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '13px',
              }}
            >
              <div style={{ color: 'var(--muted, #6b7280)', marginBottom: '4px' }}>Statut séquestre :</div>
              <strong style={{ color: 'var(--navy-text, #25324f)' }}>
                {d.status === 'REFUNDED'
                  ? 'Fonds remboursés au client'
                  : d.stripe.transferSucceeded || d.step === 'RELEASED'
                  ? 'Fonds débloqués au réparateur'
                  : d.status === 'PAID'
                  ? 'Fonds sécurisés sous séquestre'
                  : 'En attente de règlement'}
              </strong>
              {d.amounts.shareOwedCents > 0 && (
                <div style={{ marginTop: '6px', color: 'var(--badge-danger-text)' }}>
                  Part réparateur due : <strong>{formatEuros(d.amounts.shareOwedCents)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* 3. Liens Stripe directs */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
              Liens Stripe directs
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              {d.stripe.paymentIntentId ? (
                <div>
                  <div style={{ color: 'var(--muted, #6b7280)', marginBottom: '2px' }}>PaymentIntent :</div>
                  <a
                    href={`https://dashboard.stripe.com/payments/${encodeURIComponent(d.stripe.paymentIntentId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="link"
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'none',
                    }}
                  >
                    {d.stripe.paymentIntentId} ↗
                  </a>
                </div>
              ) : (
                <div style={{ color: 'var(--muted, #6b7280)' }}>Aucun PaymentIntent associé</div>
              )}

              {d.stripe.chargeId && (
                <div>
                  <div style={{ color: 'var(--muted, #6b7280)', marginBottom: '2px' }}>Charge :</div>
                  <a
                    href={`https://dashboard.stripe.com/charges/${encodeURIComponent(d.stripe.chargeId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="link"
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'none',
                    }}
                  >
                    {d.stripe.chargeId} ↗
                  </a>
                </div>
              )}

              {d.stripe.transferId && (
                <div>
                  <div style={{ color: 'var(--muted, #6b7280)', marginBottom: '2px' }}>Transfert :</div>
                  <a
                    href={`https://dashboard.stripe.com/transfers/${encodeURIComponent(d.stripe.transferId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="link"
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'none',
                    }}
                  >
                    {d.stripe.transferId} ↗
                  </a>
                </div>
              )}

              {d.stripe.refundId && (
                <div>
                  <div style={{ color: 'var(--muted, #6b7280)', marginBottom: '2px' }}>Remboursement :</div>
                  <a
                    href={`https://dashboard.stripe.com/refunds/${encodeURIComponent(d.stripe.refundId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="link"
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'none',
                    }}
                  >
                    {d.stripe.refundId} ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 4. Action Center */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
              Actions administratives
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Rembourser button */}
              <Can p="refunds.issue">
                {d.status === 'PAID' && (
                  <button
                    type="button"
                    onClick={() => setIsRefundModalOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--on-accent, #ffffff)',
                      backgroundColor: 'var(--navy, #25324f)',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    Rembourser la commande
                  </button>
                )}

                {/* Annuler button */}
                {(d.status === 'PENDING_PAYMENT' || !d.stripe.hasCharge) && d.status !== 'ABANDONED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setCancelError(null);
                      setIsCancelModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--navy-text, #f61b39)',
                      backgroundColor: 'var(--paper, #ffffff)',
                      border: '1px solid var(--accent, #f61b39)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Annuler la commande
                  </button>
                )}

                {/* Payer part réparateur button */}
                {d.amounts.shareOwedCents > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPayShareError(null);
                      setIsPayShareModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--on-accent, #ffffff)',
                      backgroundColor: 'var(--navy, #25324f)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Payer la part réparateur ({formatEuros(d.amounts.shareOwedCents)})
                  </button>
                )}
              </Can>

              {/* Litige Link */}
              {d.dispute && (
                <Link
                  href={`/litiges?q=${encodeURIComponent(d.dispute.disputeNumber)}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--ink, #141414)',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Accéder au dossier litige
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Modals */}
      <RefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        onSuccess={(msg) => {
          setActionSuccess(msg);
          if (onRefresh) onRefresh();
        }}
        commande={d}
      />

      <CancelConfirmModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancel}
        submitting={busy}
        commandeReference={d.reference}
        error={cancelError}
      />

      <PayShareConfirmModal
        isOpen={isPayShareModalOpen}
        onClose={() => setIsPayShareModalOpen(false)}
        onConfirm={handlePayShare}
        submitting={busy}
        shareOwedCents={d.amounts.shareOwedCents}
        repairerName={d.repairer.name}
        commandeReference={d.reference}
        error={payShareError}
      />
    </div>
  );
}

export default function CommandeFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<AdminCommandeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError('Commande introuvable');
        return;
      }
      const json = await res.json();
      setData(json as AdminCommandeDetail);
    } catch {
      setError('Commande introuvable');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return <CommandeDetailView initialData={data} initialError={error} id={id} onRefresh={load} />;
}
