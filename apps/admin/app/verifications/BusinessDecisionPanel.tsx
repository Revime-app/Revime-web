'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  compareSiret,
  formatLegalForm,
  type AdminBusinessDetailsResponse,
  type AdminVerificationListItem,
} from '@revime/shared';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import {
  allowedBusinessActions,
  businessDecisionLine,
  compareDirigeantWithIdentity,
  formatFileSize,
} from '../../lib/business-decision';
import { BusinessDecisionModal, type BusinessDecisionKind } from './BusinessDecisionModal';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

/**
 * CF5-07: Business verification review drawer / panel.
 * Allows operators to compare declared legal data against Stripe identity verification,
 * inspect registration proof & insurance docs, and approve, refuse or request documents.
 */

export interface BusinessDecisionPanelProps {
  row: AdminVerificationListItem;
  onClose: () => void;
  /** Reload the list; called after a decision and after a CONFLICT. */
  onChanged: () => void;
}

const buttonStyle = (tone: 'danger' | 'neutral' | 'ok'): React.CSSProperties => ({
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 4,
  border: tone === 'neutral' ? '1px solid var(--line, #dfe2e2)' : 'none',
  backgroundColor: tone === 'danger' ? 'var(--red-deep, #bd0e26)' : tone === 'ok' ? 'var(--navy)' : 'var(--paper)',
  color: tone === 'neutral' ? 'var(--ink, #141414)' : '#fff',
  cursor: 'pointer',
});

const badgeStyle = (tone: 'success' | 'danger' | 'warning' | 'neutral'): React.CSSProperties => {
  const map = {
    success: { bg: 'var(--badge-success-bg)', text: 'var(--badge-success-text)', border: 'var(--badge-success-border)' },
    danger: { bg: 'var(--badge-danger-bg)', text: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)' },
    warning: { bg: 'var(--badge-warning-bg)', text: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)' },
    neutral: { bg: 'var(--badge-neutral-bg)', text: 'var(--ink2)', border: 'var(--line)' },
  };
  const c = map[tone];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
  };
};

export interface BusinessDecisionPanelViewProps {
  row: AdminVerificationListItem;
  details: AdminBusinessDetailsResponse | null;
  loading: boolean;
  error: string | null;
  banner: string | null;
  canDecide: boolean;
  confirmingApprove: boolean;
  saving: boolean;
  modal: BusinessDecisionKind | null;
  onClose: () => void;
  onOpenModal: (kind: BusinessDecisionKind) => void;
  onCloseModal: () => void;
  onStartConfirmApprove: () => void;
  onCancelConfirmApprove: () => void;
  onApprove: () => void;
  onModalConflict: (message: string) => void;
  onModalDone: () => void;
}

export function BusinessDecisionPanelView({
  row,
  details,
  loading,
  error,
  banner,
  canDecide,
  confirmingApprove,
  saving,
  modal,
  onClose,
  onOpenModal,
  onCloseModal,
  onStartConfirmApprove,
  onCancelConfirmApprove,
  onApprove,
  onModalConflict,
  onModalDone,
}: BusinessDecisionPanelViewProps) {
  const business = details?.business;
  const user = details?.user;
  const allowed = allowedBusinessActions(business?.status);
  const identityComparison = compareDirigeantWithIdentity(
    business?.dirigeantName,
    user?.verifiedIdentityName,
  );
  const siretComparison = compareSiret({
    declaredSiret: business?.siret ?? row.siret,
    declaredSiren: business?.siren ?? row.siren,
    filename: business?.registrationProof?.name,
  });
  const priorDecision = details?.decision ? businessDecisionLine(details.decision) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-panel-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--paper)',
          borderRadius: 10,
          padding: 24,
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'grid',
          gap: 16,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 id="business-panel-title" style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>
              Vérification d&apos;entreprise · {business?.denomination || row.displayName}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted, #6b7280)' }}>
              {row.displayName} · {row.email}
              {row.marker === 'demo' && ' · Démo'}
              {row.marker === 'fixture' && ' · Fixture de test'}
              {row.marker === 'review' && ' · Compte de revue'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Banners */}
        {banner && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: 'var(--red-text, #bd0e26)',
              backgroundColor: 'var(--red-soft, #feedf0)',
              padding: '10px 14px',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {banner}
          </p>
        )}

        {loading && (
          <p style={{ margin: '16px 0', fontSize: 14, color: 'var(--muted, #6b7280)' }}>
            Chargement des détails de l&apos;entreprise…
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: 'var(--red-text, #bd0e26)',
              backgroundColor: 'var(--red-soft, #feedf0)',
              padding: '12px 16px',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && details && (
          <>
            {/* Bug B4: Red Alert on SIRET Mismatch */}
            {siretComparison.mismatch && (
              <div
                role="alert"
                style={{
                  margin: 0,
                  color: 'var(--red-text, #bd0e26)',
                  backgroundColor: 'var(--red-soft, #feedf0)',
                  border: '1px solid var(--red, #e11d48)',
                  padding: '12px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
                  <span><Icon as={TriangleAlert} /> Discordance SIRET détectée</span>
                </div>
                <div style={{ lineHeight: 1.45 }}>
                  {siretComparison.reason ??
                    `Le numéro SIRET extrait du nom du justificatif (${siretComparison.extractedSiret}) ne correspond pas au SIRET déclaré (${siretComparison.declaredSiret}). Vérifiez attentivement la pièce justificative avant toute validation.`}
                </div>
              </div>
            )}

            {/* Side-by-side Dirigeant & Identity Card */}
            <div
              style={{
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 8,
                padding: 16,
                backgroundColor: 'var(--badge-neutral-bg)',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  Concordance Dirigeant / Identité
                </h3>
                <span style={badgeStyle(identityComparison.tone)}>{identityComparison.label}</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  backgroundColor: 'var(--paper)',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 2 }}>
                    Identité vérifiée (Stripe)
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {user?.verifiedIdentityName ?? (
                      <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 400 }}>
                        Non vérifiée
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 2 }}>
                    Nom du dirigeant déclaré
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {business?.dirigeantName ?? '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Business Information Card */}
            <div
              style={{
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 8,
                padding: 16,
                display: 'grid',
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                Informations légales de l&apos;entreprise
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Raison sociale :</span>{' '}
                  <strong>{business?.denomination ?? '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Forme juridique :</span>{' '}
                  <strong>{formatLegalForm(business?.legalForm)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>SIRET / SIREN :</span>{' '}
                  <strong>{business?.siret ?? business?.siren ?? row.siret ?? row.siren ?? '—'}</strong>
                  {siretComparison.mismatch && (
                    <span style={{ ...badgeStyle('danger'), marginLeft: 8 }}>
                      Discordance justificatif
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>N° TVA intracommunautaire :</span>{' '}
                  <strong>{business?.vatNumber || 'Non renseigné'}</strong>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Adresse de l&apos;établissement :</span>{' '}
                  <strong>{business?.establishmentAddress ?? '—'}</strong>
                </div>
              </div>

              {priorDecision && (
                <div style={{ marginTop: 6, padding: '8px 12px', backgroundColor: 'var(--badge-neutral-bg)', borderRadius: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Historique de décision :</span> {priorDecision}
                </div>
              )}
            </div>

            {/* Documents Section */}
            <div
              style={{
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 8,
                padding: 16,
                display: 'grid',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Pièces justificatives</h3>

              <div style={{ display: 'grid', gap: 10 }}>
                {/* Registration Proof */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 6,
                    backgroundColor: 'var(--badge-neutral-bg)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Justificatif d&apos;immatriculation (&lt; 3 mois)
                    </div>
                    {business?.registrationProof ? (
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                        {business.registrationProof.name} · {formatFileSize(business.registrationProof.sizeBytes)}
                        {siretComparison.mismatch && siretComparison.extractedSiret && (
                          <span style={{ ...badgeStyle('danger'), marginLeft: 8 }}>
                            SIRET extrait : {siretComparison.extractedSiret} ≠ déclaré
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>Non fourni</div>
                    )}
                  </div>

                  {business?.registrationProof?.url && (
                    <a
                      href={business.registrationProof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        backgroundColor: 'var(--badge-info-bg)',
                        color: 'var(--badge-info-text)',
                        border: '1px solid var(--badge-info-border)',
                        borderRadius: 4,
                        textDecoration: 'none',
                      }}
                    >
                      Ouvrir la pièce ↗
                    </a>
                  )}
                </div>

                {/* Insurance Proof */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 6,
                    backgroundColor: 'var(--badge-neutral-bg)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Attestation RC Pro</div>
                    {business?.insuranceProof ? (
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                        {business.insuranceProof.name} · {formatFileSize(business.insuranceProof.sizeBytes)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                        Non fournie (facultatif)
                      </div>
                    )}
                  </div>

                  {business?.insuranceProof?.url && (
                    <a
                      href={business.insuranceProof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        backgroundColor: 'var(--badge-info-bg)',
                        color: 'var(--badge-info-text)',
                        border: '1px solid var(--badge-info-border)',
                        borderRadius: 4,
                        textDecoration: 'none',
                      }}
                    >
                      Ouvrir la pièce ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Confirmation Box for Approval */}
            {confirmingApprove && (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  border: '1px solid var(--badge-success-border)',
                  backgroundColor: 'var(--badge-success-bg)',
                  borderRadius: 6,
                }}
              >
                <p style={{ margin: 0, fontSize: 14, color: 'var(--badge-success-text)', fontWeight: 500 }}>
                  Valider l&apos;entreprise ? Le profil professionnel sera activé immédiatement.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={onCancelConfirmApprove}
                    disabled={saving}
                    style={buttonStyle('neutral')}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onApprove}
                    style={buttonStyle('ok')}
                  >
                    {saving ? 'Validation en cours…' : 'Confirmer la validation'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Bottom Actions Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <Link
            href={`/utilisateurs/${row.userId}`}
            style={{ fontSize: 14, color: 'var(--badge-info-text)', textDecoration: 'underline' }}
          >
            Voir l&apos;utilisateur
          </Link>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {canDecide && allowed.approve && !confirmingApprove && (
              <button
                type="button"
                onClick={onStartConfirmApprove}
                style={buttonStyle('ok')}
              >
                Valider l&apos;entreprise
              </button>
            )}
            {canDecide && allowed.request && (
              <button
                type="button"
                onClick={() => onOpenModal('request')}
                style={buttonStyle('neutral')}
              >
                Demander de nouveaux documents
              </button>
            )}
            {canDecide && allowed.refuse && (
              <button
                type="button"
                onClick={() => onOpenModal('refuse')}
                style={buttonStyle('danger')}
              >
                Refuser la vérification
              </button>
            )}
            <button type="button" onClick={onClose} style={buttonStyle('neutral')}>
              Fermer
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <BusinessDecisionModal
          userId={row.userId}
          kind={modal}
          onClose={onCloseModal}
          onConflict={onModalConflict}
          onDone={onModalDone}
        />
      )}
    </div>
  );
}

export async function fetchBusinessDetails(
  userId: string,
): Promise<{ ok: true; data: AdminBusinessDetailsResponse } | { ok: false; status?: number; error: string }> {
  try {
    const res = await fetch(
      `/api/proxy/admin/verifications/business/${encodeURIComponent(userId)}/details`,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error?.message || "Impossible de charger les détails de l'entreprise.",
      };
    }
    return { ok: true, data: data as AdminBusinessDetailsResponse };
  } catch {
    return { ok: false, error: "Erreur réseau. Impossible de charger les détails de l'entreprise." };
  }
}

export async function sendBusinessApproveRequest(
  userId: string,
): Promise<{ ok: true } | { ok: false; status?: number; error: string }> {
  try {
    const res = await fetch(
      `/api/proxy/admin/verifications/business/${encodeURIComponent(userId)}/approve`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return {
        ok: false,
        status: res.status,
        error: data?.error?.message || "Impossible de valider l'entreprise.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erreur réseau. Impossible de valider l'entreprise." };
  }
}

export function BusinessDecisionPanel({ row, onClose, onChanged }: BusinessDecisionPanelProps) {
  const [details, setDetails] = useState<AdminBusinessDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [modal, setModal] = useState<BusinessDecisionKind | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [saving, setSaving] = useState(false);

  const adminMe = useAdminMe();
  const canDecide = hasPermission(adminMe, 'verification.decide');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetchBusinessDetails(row.userId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
      } else {
        setDetails(res.data);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [row.userId]);

  function conflict(message: string) {
    setModal(null);
    setConfirmingApprove(false);
    setBanner(message);
    onChanged();
  }

  async function approve() {
    setSaving(true);
    setBanner(null);
    try {
      const res = await sendBusinessApproveRequest(row.userId);
      if (!res.ok) {
        if (res.status === 409) {
          conflict(res.error);
          return;
        }
        setBanner(res.error);
        return;
      }
      setConfirmingApprove(false);
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BusinessDecisionPanelView
      row={row}
      details={details}
      loading={loading}
      error={error}
      banner={banner}
      canDecide={canDecide}
      confirmingApprove={confirmingApprove}
      saving={saving}
      modal={modal}
      onClose={onClose}
      onOpenModal={(kind) => setModal(kind)}
      onCloseModal={() => setModal(null)}
      onStartConfirmApprove={() => setConfirmingApprove(true)}
      onCancelConfirmApprove={() => setConfirmingApprove(false)}
      onApprove={() => void approve()}
      onModalConflict={conflict}
      onModalDone={() => {
        setModal(null);
        onChanged();
        onClose();
      }}
    />
  );
}
