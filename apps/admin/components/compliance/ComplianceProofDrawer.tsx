'use client';

import React, { useState, useEffect, useRef } from 'react';
import type {
  AdminComplianceItem,
  AdminComplianceVerifyResponse,
  ConsentProofKind,
  SignupMethod,
} from '@revime/shared';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../Icon';

export const COMPLIANCE_KIND_LABELS: Record<ConsentProofKind, string> = {
  CGU_ACCEPTANCE: 'Acceptation CGU',
  // V9 B1 (`DEC9-06` (1)).
  PRIVACY_ACCEPTANCE: 'Politique de confidentialité',
  WITHDRAWAL_WAIVER_IMMEDIATE: 'Renonciation immédiate (rétractation)',
  WITHDRAWAL_WAIVER_WAIT_14_DAYS: 'Délai légal (attente 14 jours)',
};

/** V9 B1 (`DEC9-06` (1)): how the account signed up, for each proof's details. */
export function signupMethodLabel(method: SignupMethod | null | undefined): string {
  if (method === 'APPLE') return 'Apple';
  if (method === 'GOOGLE') return 'Google';
  if (method === 'EMAIL') return 'E-mail';
  return 'Inconnu';
}

export function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function getComplianceKindBadge(kind: ConsentProofKind): {
  label: string;
  tone: 'info' | 'warning' | 'neutral';
} {
  switch (kind) {
    case 'CGU_ACCEPTANCE':
    case 'PRIVACY_ACCEPTANCE':
      return { label: COMPLIANCE_KIND_LABELS[kind] ?? kind, tone: 'info' };
    case 'WITHDRAWAL_WAIVER_IMMEDIATE':
      return { label: COMPLIANCE_KIND_LABELS[kind] ?? kind, tone: 'warning' };
    case 'WITHDRAWAL_WAIVER_WAIT_14_DAYS':
      return { label: COMPLIANCE_KIND_LABELS[kind] ?? kind, tone: 'neutral' };
    default:
      return { label: kind, tone: 'neutral' };
  }
}

export function getIntegrityBadge(valid: boolean, historicalImport: boolean): {
  label: string;
  tone: 'success' | 'warning' | 'danger';
} {
  if (!valid) return { label: 'Empreinte invalide', tone: 'danger' };
  // A reconstruction made on 2026-10-11 from the user / commande row, not a proof recorded when
  // the acceptance happened. Unchanged since the import, but it must not read like the others.
  if (historicalImport) return { label: 'Import historique', tone: 'warning' };
  return { label: 'Empreinte valide', tone: 'success' };
}

export function badgeStyle(tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'): React.CSSProperties {
  switch (tone) {
    case 'success':
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-success-bg)',
        color: 'var(--badge-success-text)',
        border: '1px solid var(--badge-success-border)',
      };
    case 'danger':
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--red-soft, #feedf0)',
        color: 'var(--red-text, #bd0e26)',
        border: '1px solid var(--badge-danger-border)',
      };
    case 'warning':
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--amber-soft, #fef7e0)',
        color: 'var(--amber-deep, #b06000)',
        border: '1px solid var(--badge-warning-border)',
      };
    case 'info':
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-info-bg)',
        color: 'var(--badge-info-text)',
        border: '1px solid var(--badge-info-border)',
      };
    case 'neutral':
    default:
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-neutral-bg)',
        color: 'var(--muted)',
        border: '1px solid var(--line)',
      };
  }
}

export async function sendVerifyComplianceProofRequest(
  proofId: string,
): Promise<{ ok: true; data: AdminComplianceVerifyResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/compliance/proofs/${encodeURIComponent(proofId)}/verify`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Échec de la vérification de l’empreinte.',
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la vérification de l’empreinte.' };
  }
}

export interface ComplianceProofDrawerProps {
  proof: AdminComplianceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onVerified?: (res: AdminComplianceVerifyResponse) => void;
}

export function ComplianceProofDrawer({
  proof,
  isOpen,
  onClose,
  onVerified,
}: ComplianceProofDrawerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AdminComplianceVerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Reset state when a different proof is opened
  useEffect(() => {
    setCopied(false);
    setVerifying(false);
    setVerifyResult(null);
    setVerifyError(null);
  }, [proof?.id]);

  // Accessibility: focus the heading on open
  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key closes the drawer
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !proof) return null;

  const kindBadge = getComplianceKindBadge(proof.kind);
  const liveValid = verifyResult !== null ? verifyResult.valid : proof.valid;
  const liveHistoricalImport = verifyResult !== null ? verifyResult.historicalImport : proof.historicalImport;
  const integrityBadge = getIntegrityBadge(liveValid, liveHistoricalImport);

  const copyHash = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(proof.checksum);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failures in restricted environments
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    const result = await sendVerifyComplianceProofRequest(proof.id);
    setVerifying(false);

    if (!result.ok) {
      setVerifyError(result.error);
      return;
    }

    setVerifyResult(result.data);
    if (onVerified) {
      onVerified(result.data);
    }
  };

  return (
    <>
      {/* Backdrop */}
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
        data-testid="compliance-drawer-backdrop"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-compliance-title"
        data-testid="compliance-proof-drawer"
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
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={badgeStyle(kindBadge.tone)}>{kindBadge.label}</span>
            <h2
              id="drawer-compliance-title"
              ref={headingRef}
              tabIndex={-1}
              style={{
                fontSize: '18px',
                fontWeight: 700,
                margin: 0,
                color: 'var(--ink, #141414)',
                outline: 'none',
              }}
            >
              {`Preuve #${proof.id}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau de preuve"
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

        {/* Content */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Section 1: Identité & Métadonnées */}
            <section aria-labelledby="section-metadata-title">
              <h3
                id="section-metadata-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: '0 0 12px 0',
                  color: 'var(--ink, #141414)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                1. Identité & Métadonnées
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  rowGap: '10px',
                  columnGap: '16px',
                  fontSize: '14px',
                  padding: '16px',
                  backgroundColor: 'var(--canvas)',
                  borderRadius: 'var(--r-card, 8px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>ID Utilisateur</span>
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{proof.userId}</span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>E-mail utilisateur</span>
                <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                  {proof.userEmail ?? <span style={{ color: 'var(--muted, #6b7280)' }}>Non renseigné</span>}
                </span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Mode d&apos;inscription</span>
                <span>{signupMethodLabel(proof.signupMethod)}</span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>ID Commande</span>
                <span>
                  {proof.commandeId ? (
                    <span style={{ fontFamily: 'monospace' }}>{proof.commandeId}</span>
                  ) : (
                    <span style={{ color: 'var(--muted, #6b7280)' }}>Non rattaché</span>
                  )}
                </span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Horodatage</span>
                <span>{formatDateFr(proof.timestamp)}</span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Adresse IP</span>
                <span style={{ fontFamily: 'monospace' }}>{proof.ipAddress ?? '—'}</span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>User Agent</span>
                <span style={{ fontSize: '13px', wordBreak: 'break-word', color: 'var(--ink, #141414)' }}>
                  {proof.userAgent ?? '—'}
                </span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Version CGU / Dérogation</span>
                <span>
                  {proof.cguVersion ? (
                    <span style={{ marginRight: '8px' }}>{`CGU v${proof.cguVersion}`}</span>
                  ) : null}
                  {proof.privacyVersion ? (
                    <span style={{ marginRight: '8px' }}>{`Confidentialité v${proof.privacyVersion}`}</span>
                  ) : null}
                  {proof.waiverTextVersion ? (
                    <span>{`Dérogation v${proof.waiverTextVersion}`}</span>
                  ) : null}
                  {!proof.cguVersion && !proof.waiverTextVersion && !proof.privacyVersion ? 'Standard' : null}
                </span>

                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Action prouvée</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{proof.actionProof}</span>
              </div>
            </section>

            {/* Section 2: Instantané textuel verbatim */}
            <section aria-labelledby="section-snapshot-title">
              <h3
                id="section-snapshot-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: '0 0 6px 0',
                  color: 'var(--ink, #141414)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                2. Instantané textuel verbatim
              </h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                Texte contractuel exact présenté au signataire au moment précis de l&apos;action (opposable aux tiers).
              </p>
              <blockquote
                data-testid="compliance-legal-snapshot"
                style={{
                  padding: '16px 20px',
                  backgroundColor: 'var(--canvas)',
                  borderLeft: '4px solid var(--accent, #0b7285)',
                  borderRadius: 'var(--r-field, 4px)',
                  fontFamily: 'monospace, monospace',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--ink, #141414)',
                  margin: 0,
                  borderTop: '1px solid var(--line, #dfe2e2)',
                  borderRight: '1px solid var(--line, #dfe2e2)',
                  borderBottom: '1px solid var(--line, #dfe2e2)',
                }}
              >
                {proof.legalTextSnapshot}
              </blockquote>
            </section>

            {/* Section 3: Intégrité cryptographique SHA-256 */}
            <section aria-labelledby="section-integrity-title">
              <h3
                id="section-integrity-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: '0 0 12px 0',
                  color: 'var(--ink, #141414)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                3. Intégrité cryptographique SHA-256
              </h3>

              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: 'var(--r-card, 8px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                    Empreinte enregistrée :
                  </span>
                  <span style={badgeStyle(integrityBadge.tone)}>{integrityBadge.label}</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: 'var(--canvas)',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                  }}
                >
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      wordBreak: 'break-all',
                      flex: '1 1 auto',
                      color: 'var(--ink, #141414)',
                    }}
                  >
                    {proof.checksum}
                  </code>
                  <button
                    type="button"
                    onClick={copyHash}
                    aria-label="Copier l'empreinte SHA-256"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--paper, #ffffff)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      cursor: 'pointer',
                      color: 'var(--ink, #141414)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copied ? '✓ Copié !' : 'Copier'}
                  </button>
                </div>

                {verifyError && (
                  <div role="alert" style={{ fontSize: '13px', margin: 0 }}>
                    {verifyError}
                  </div>
                )}

                {verifyResult && (
                  <div
                    data-testid="compliance-verify-live-result"
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--r-field, 4px)',
                      backgroundColor: verifyResult.valid ? 'var(--badge-success-bg)' : 'var(--red-soft, #feedf0)',
                      border: `1px solid ${verifyResult.valid ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: verifyResult.valid ? 'var(--badge-success-text)' : 'var(--red-text, #bd0e26)' }}>
                      {!verifyResult.valid
                        ? (
                          <>
                            <Icon as={TriangleAlert} /> Altération détectée : l’empreinte recalculée ne correspond pas au scellé
                          </>
                        )
                        : verifyResult.historicalImport
                          ? 'Import historique : inchangé depuis l’import du 11 octobre 2026, preuve reconstituée et non enregistrée au moment de l’acceptation'
                          : '✓ Empreinte identique au scellé d’origine (cohérence interne, SHA-256 non signé)'}
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      Calculée : {verifyResult.calculatedChecksum}
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      Stockée &nbsp;: {verifyResult.storedChecksum}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                      Vérifié en direct le {formatDateFr(verifyResult.verifiedAt)}
                    </div>
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying}
                    data-testid="compliance-verify-btn"
                    style={{
                      padding: '10px 18px',
                      fontSize: '14px',
                      fontWeight: 600,
                      backgroundColor: 'var(--accent, #0b7285)',
                      color: 'var(--on-accent, #ffffff)',
                      border: 'none',
                      borderRadius: 'var(--r-field, 4px)',
                      cursor: verifying ? 'wait' : 'pointer',
                    }}
                  >
                    {verifying ? 'Vérification en cours…' : "Vérifier l'empreinte"}
                  </button>
                </div>

                {/* Audit Disclaimer */}
                <div
                  style={{
                    marginTop: '8px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    borderRadius: 'var(--r-field, 4px)',
                    fontSize: '12px',
                    color: 'var(--muted, #5f6368)',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Avis d’intégrité & Traçabilité légale :</strong> Cette preuve de consentement est scellée par une
                  fonction de hachage cryptographique irréversible SHA-256. Toute vérification en direct déclenche un
                  journal d&apos;audit administrateur conforme aux exigences du Code de la consommation (art. L. 221-18 et
                  suiv.) et de la Directive européenne 2011/83/UE relative aux droits des consommateurs.
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
