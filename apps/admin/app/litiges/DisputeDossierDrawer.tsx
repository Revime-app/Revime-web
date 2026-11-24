'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  DISPUTE_MOTIFS,
  DELETED_USER_NAME,
  formatDisputeRef,
  type AdminDisputeDossierDto,
} from '@revime/shared';
import { ArbitrationModal, type ArbitrationMode } from './ArbitrationModal';
import { DisputeSpacesPanel } from './DisputeSpacesPanel';
import { DisputeChronologyTimeline } from '../../components/DisputeChronologyTimeline';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';

export interface DisputeDossierDrawerProps {
  disputeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDisputeUpdated: () => void;
  initialDossier?: AdminDisputeDossierDto | null;
}

type TabType = 'SYNTHESIS' | 'MESSAGES' | 'NOTES';

import { formatEuros } from '../../lib/money';
import { escrowCard } from '../../lib/dispute-escrow';
import { CopyableReference } from '../../components/CopyableReference';
import { isDeletedUser } from '../../lib/user-display';
import { getVerdictLabel } from '../../lib/dispute-status-label';
import { shipmentLegLabel, shipmentStatusLabel } from '../../lib/status-labels';
import { Camera, Coins, Info, Mail, MapPin, Phone, Scale, Scissors, TriangleAlert, Undo2, User, Wrench } from 'lucide-react';
import { Icon } from '../../components/Icon';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getDisputeStatusBadge(status: string) {
  switch (status) {
    case 'OPEN':
      return {
        label: 'Ouvert',
        bg: 'var(--badge-warning-bg)',
        color: 'var(--badge-warning-text)',
        border: 'var(--badge-warning-border)',
      };
    case 'IN_REVIEW':
      return {
        label: "En cours d'examen",
        bg: 'var(--badge-info-bg)',
        color: 'var(--badge-info-text)',
        border: 'var(--badge-info-border)',
      };
    case 'RESOLVED_RELEASED':
      return {
        label: 'Versé au réparateur',
        bg: 'var(--badge-success-bg)',
        color: 'var(--badge-success-text)',
        border: 'var(--badge-success-border)',
      };
    case 'RESOLVED_REFUNDED':
      return {
        label: 'Remboursé au client',
        bg: 'var(--badge-danger-bg)',
        color: 'var(--badge-danger-text)',
        border: 'var(--badge-danger-border)',
      };
    case 'RESOLVED_DISMISSED':
      return {
        label: 'Réparation reprise',
        bg: 'var(--badge-neutral-bg)',
        color: 'var(--ink2)',
        border: 'var(--line)',
      };
    default:
      return {
        label: status,
        bg: 'var(--badge-neutral-bg)',
        color: 'var(--ink2)',
        border: 'var(--line)',
      };
  }
}

const getStatusBadge = getDisputeStatusBadge;

function getInitiatorBadge(initiator: string) {
  switch (initiator) {
    case 'CLIENT':
      return { label: 'Client', bg: 'var(--badge-info-bg)', color: 'var(--badge-info-text)', border: 'var(--badge-info-border)' };
    case 'REPAIRER':
      return { label: 'Réparateur', bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)' };
    case 'ADMIN':
      return { label: 'Administrateur', bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)' };
    case 'STRIPE':
      return { label: 'Stripe', bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)' };
    default:
      return { label: initiator, bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)' };
  }
}

export interface DisputeEvidencePhotosGalleryProps {
  photos: string[];
  onPreviewPhoto: (photo: string) => void;
}

export function DisputeEvidencePhotosGallery({
  photos,
  onPreviewPhoto,
}: DisputeEvidencePhotosGalleryProps) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFailedUrls({});
  }, [photos]);

  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', marginBottom: '8px' }}>
        {`Photos jointes au litige (${photos.length}) :`}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {photos.map((photo, index) => (
          <button
            type="button"
            key={index}
            onClick={() => onPreviewPhoto(photo)}
            data-testid={`evidence-photo-${index}`}
            title="Cliquez pour afficher en taille réelle"
            style={{
              padding: 0,
              background: 'none',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'block',
            }}
          >
            {failedUrls[photo] ? (
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  color: 'var(--muted)',
                  fontSize: '11px',
                  padding: '6px',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                <span style={{ fontSize: '18px', marginBottom: '2px' }}><Icon as={Camera} /></span>
                <span>Image indisponible</span>
              </div>
            ) : (
              <img
                src={photo}
                alt={`Pièce jointe litige ${index + 1}`}
                onError={() => setFailedUrls((prev) => ({ ...prev, [photo]: true }))}
                style={{ width: '90px', height: '90px', objectFit: 'cover', display: 'block' }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface DisputePhotoPreviewModalProps {
  photo: string | null;
  onClose: () => void;
}

export function DisputePhotoPreviewModal({
  photo,
  onClose,
}: DisputePhotoPreviewModalProps) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, onClose]);

  if (!photo) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de la photo"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loadFailed ? (
          <div
            style={{
              padding: '32px 48px',
              backgroundColor: 'var(--paper)',
              borderRadius: '8px',
              textAlign: 'center',
              maxWidth: '400px',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}><Icon as={TriangleAlert} /></div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>
              Impossible de charger l&apos;image
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Le lien de la photo a peut-être expiré ou le fichier est inaccessible.
            </div>
          </div>
        ) : (
          <img
            src={photo}
            alt="Aperçu photo"
            onError={() => setLoadFailed(true)}
            style={{
              maxWidth: '100%',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: '6px',
              display: 'block',
            }}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'aperçu"
          data-testid="close-photo-preview"
          style={{
            position: 'absolute',
            top: '-16px',
            right: '-16px',
            backgroundColor: 'var(--paper)',
            color: 'var(--ink)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            fontSize: '16px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function DisputeDossierDrawer({
  disputeId,
  isOpen,
  onClose,
  onDisputeUpdated,
  initialDossier,
}: DisputeDossierDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('SYNTHESIS');
  const [dossier, setDossier] = useState<AdminDisputeDossierDto | null>(initialDossier ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDossier) {
      setDossier(initialDossier);
    }
  }, [initialDossier]);

  // Arbitration modal
  const [arbitrationMode, setArbitrationMode] = useState<ArbitrationMode | null>(null);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canHandle = hasPermission(adminMe, 'disputes.handle');
  const canResolve = hasPermission(adminMe, 'disputes.resolve');

  // Internal note form
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Assign action
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Gallery modal preview
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const fetchDossier = useCallback(async () => {
    if (!disputeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message || 'Impossible de charger le dossier de litige.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as AdminDisputeDossierDto;
      setDossier(data);
    } catch {
      setError('Erreur de communication lors du chargement du dossier.');
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    if (isOpen && disputeId) {
      void fetchDossier();
    } else {
      setDossier(null);
      setError(null);
      setLoading(false);
      setActiveTab('SYNTHESIS');
      setArbitrationMode(null);
      setNoteText('');
      setNoteError(null);
      setAssignError(null);
      setPreviewPhoto(null);
    }
  }, [isOpen, disputeId, fetchDossier]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !arbitrationMode && !previewPhoto) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, arbitrationMode, previewPhoto, onClose]);

  if (!isOpen || !disputeId) return null;

  const dispute = dossier?.dispute;
  const commande = dossier?.commande;
  const isResolved =
    dispute?.status === 'RESOLVED_RELEASED' ||
    dispute?.status === 'RESOLVED_REFUNDED' ||
    dispute?.status === 'RESOLVED_DISMISSED';

  const handleAssign = async () => {
    if (!disputeId || isAssigning) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setAssignError(body?.message || "Impossible d'assigner le litige.");
      } else {
        await fetchDossier();
        notifyUpdated();
      }
    } catch {
      setAssignError('Erreur réseau lors de l\'assignation.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async () => {
    if (!disputeId || isAssigning) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/unassign`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setAssignError(body?.message || 'Impossible de désassigner le litige.');
      } else {
        await fetchDossier();
        notifyUpdated();
      }
    } catch {
      setAssignError('Erreur réseau lors de la désassignation.');
    } finally {
      setIsAssigning(false);
    }
  };

  const submitAdminNote = async (text: string) => {
    if (!disputeId || text.trim().length < 2) return;
    const res = await fetch(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: text.trim() }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || "Impossible d'ajouter la note interne.");
    }
    await fetchDossier();
    notifyUpdated();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeId || noteText.trim().length < 2 || isSubmittingNote) return;

    setIsSubmittingNote(true);
    setNoteError(null);
    try {
      await submitAdminNote(noteText.trim());
      setNoteText('');
    } catch (err: any) {
      setNoteError(err?.message || 'Erreur réseau lors de l\'ajout de la note.');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const notifyUpdated = () => {
    onDisputeUpdated();
  };

  const statusStyle = dispute ? getStatusBadge(dispute.status) : null;
  const initiatorStyle = dispute ? getInitiatorBadge(dispute.initiator) : null;
  const isAssigned = Boolean(
    dossier?.dispute?.assignedToUserId &&
    dossier?.dispute?.assignedToName &&
    dossier?.dispute?.assignedToName !== DELETED_USER_NAME &&
    dossier?.dispute?.assignedToName !== 'Opérateur supprimé',
  );
  const assignedLabel = isAssigned ? dossier?.dispute?.assignedToName : null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 900,
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-dispute-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '820px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 901,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Drawer Fixed Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--paper)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h2
              id="drawer-dispute-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                margin: 0,
                color: 'var(--ink, #141414)',
              }}
            >
              Dossier de litige
            </h2>
            {dispute && (
              <>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--ink, #141414)',
                    backgroundColor: 'var(--badge-info-bg)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--badge-info-border)',
                  }}
                >
                  {formatDisputeRef(dispute.number)}
                </span>
                <CopyableReference
                  value={dispute.commandeId}
                  prefix="CMD"
                  href={`/paiements?commande=${dispute.commandeId}`}
                />
                {statusStyle && (
                  <span
                    className="badge"
                    style={{
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`,
                    }}
                  >
                    {statusStyle.label}
                  </span>
                )}
                {dossier?.commande?.status === 'REFUNDED' && (
                  <span
                    className="badge"
                    style={{
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: 'var(--badge-danger-bg)',
                      color: 'var(--badge-danger-text)',
                      border: '1px solid var(--badge-danger-border)',
                    }}
                  >
                    Commande annulée &amp; remboursée
                  </span>
                )}
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink2)',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--line)',
                  }}
                >
                  Ouvert par : {dispute.initiator === 'CLIENT' ? 'client' : dispute.initiator === 'REPAIRER' ? 'réparateur' : dispute.initiator === 'ADMIN' ? 'REVIME' : 'Stripe'}
                </span>
                {dispute.motif && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--badge-info-text)',
                      backgroundColor: 'var(--badge-info-bg)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--badge-info-border)',
                    }}
                  >
                    {DISPUTE_MOTIFS[dispute.motif]?.label ?? dispute.motif}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le dossier de litige"
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

        {/* Navigation Tabs Bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--badge-neutral-bg)',
            flexShrink: 0,
            padding: '0 24px',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('SYNTHESIS')}
            style={{
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: activeTab === 'SYNTHESIS' ? 600 : 500,
              color: activeTab === 'SYNTHESIS' ? 'var(--navy-deep-text, #1e293b)' : 'var(--muted, #6b7280)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'SYNTHESIS' ? '2px solid var(--accent, #141414)' : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            1. Synthèse & Arbitrage
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MESSAGES')}
            style={{
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: activeTab === 'MESSAGES' ? 600 : 500,
              color: activeTab === 'MESSAGES' ? 'var(--navy-deep-text, #1e293b)' : 'var(--muted, #6b7280)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'MESSAGES' ? '2px solid var(--accent, #141414)' : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            2. Échanges & Justificatifs
            {dossier?.conversation?.messages && dossier.conversation.messages.length > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'var(--badge-info-bg)',
                  color: 'var(--badge-info-text)',
                  padding: '1px 6px',
                  borderRadius: '9999px',
                }}
              >
                {dossier.conversation.messages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('NOTES')}
            style={{
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: activeTab === 'NOTES' ? 600 : 500,
              color: activeTab === 'NOTES' ? 'var(--navy-deep-text, #1e293b)' : 'var(--muted, #6b7280)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'NOTES' ? '2px solid var(--accent, #141414)' : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            3. Notes internes & Historique
            {dossier?.dispute?.adminNotes && dossier.dispute.adminNotes.length > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'var(--badge-warning-bg)',
                  color: 'var(--badge-warning-text)',
                  padding: '1px 6px',
                  borderRadius: '9999px',
                }}
              >
                {dossier.dispute.adminNotes.length}
              </span>
            )}
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '24px',
            backgroundColor: 'var(--paper)',
          }}
        >
          {loading && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
              Chargement du dossier de litige…
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: '16px',
                backgroundColor: 'var(--red-soft, #feedf0)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: 'var(--r-card, 6px)',
                color: 'var(--red-text, #bd0e26)',
                fontSize: '14px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Erreur de chargement</div>
              <div>{error}</div>
              <button
                type="button"
                onClick={() => void fetchDossier()}
                style={{
                  marginTop: '12px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--red-deep, #bd0e26)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {!loading && !error && dossier && (
            <>
              {/* TAB 1: SYNTHESIS & ARBITRATION */}
              {activeTab === 'SYNTHESIS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Status & Assignment Banner */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-card, 8px)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Statut actuel
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span
                            className="badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 700,
                              backgroundColor: statusStyle?.bg,
                              color: statusStyle?.color,
                              border: `1px solid ${statusStyle?.border}`,
                            }}
                          >
                            {statusStyle?.label}
                          </span>
                        </div>
                      </div>

                      <div style={{ height: '32px', width: '1px', backgroundColor: 'var(--line, #dfe2e2)' }} />

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Initié par
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span
                            className="badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor: initiatorStyle?.bg,
                              color: initiatorStyle?.color,
                              border: `1px solid ${initiatorStyle?.border}`,
                            }}
                          >
                            {initiatorStyle?.label}
                          </span>
                        </div>
                      </div>

                      <div style={{ height: '32px', width: '1px', backgroundColor: 'var(--line, #dfe2e2)' }} />

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Assignation
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginTop: '2px' }}>
                          {isAssigned ? (
                            <span style={{ color: 'var(--navy-text, #25324f)' }}>
                              <Icon as={User} /> {assignedLabel}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
                              Non assigné
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Assign / Unassign Buttons */}
                    <div>
                      {isResolved ? null : isAssigned ? (
                        <button hidden={!canHandle}
                          type="button"
                          onClick={() => void handleUnassign()}
                          disabled={isAssigning}
                          style={{
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 500,
                            backgroundColor: 'var(--paper)',
                            color: 'var(--muted, #6b7280)',
                            border: '1px solid var(--line, #dfe2e2)',
                            borderRadius: 'var(--r-field, 4px)',
                            cursor: isAssigning ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isAssigning ? 'Traitement…' : 'Désassigner'}
                        </button>
                      ) : (
                        <button hidden={!canHandle}
                          type="button"
                          onClick={() => void handleAssign()}
                          disabled={isAssigning}
                          style={{
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            backgroundColor: 'var(--accent, #141414)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--r-field, 4px)',
                            cursor: isAssigning ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isAssigning ? 'Traitement…' : "M'assigner ce litige"}
                        </button>
                      )}
                    </div>
                  </div>

                  {assignError && (
                    <div
                      role="alert"
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'var(--red-soft, #feedf0)',
                        border: '1px solid var(--badge-danger-border)',
                        borderRadius: 'var(--r-field, 4px)',
                        color: 'var(--red-text, #bd0e26)',
                        fontSize: '13px',
                      }}
                    >
                      {assignError}
                    </div>
                  )}

                  {/* Financial Summary */}
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink, #141414)' }}>
                      Récapitulatif financier de la commande
                    </h3>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          padding: '14px',
                          backgroundColor: 'var(--badge-danger-bg)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: 'var(--r-card, 8px)',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: 'var(--badge-danger-text)', textTransform: 'uppercase', fontWeight: 600 }}>
                          {escrowCard({ disputeStatus: dossier.dispute.status, commandeStatus: dossier.commande.status }).title}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--badge-danger-text)', marginTop: '4px' }}>
                          {formatEuros(dossier.commande.totalCents)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--badge-danger-text)', marginTop: '2px' }}>
                          {escrowCard({ disputeStatus: dossier.dispute.status, commandeStatus: dossier.commande.status }).caption}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '14px',
                          backgroundColor: 'var(--badge-neutral-bg)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-card, 8px)',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Part réparateur
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink, #141414)', marginTop: '4px' }}>
                          {formatEuros(dossier.commande.repairCents)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                          Prestation réparation
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '14px',
                          backgroundColor: 'var(--badge-neutral-bg)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-card, 8px)',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Commission plateforme
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink, #141414)', marginTop: '4px' }}>
                          {formatEuros(dossier.commande.protectionCents)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                          Commission
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '14px',
                          backgroundColor: 'var(--badge-neutral-bg)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-card, 8px)',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Frais de port
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink, #141414)', marginTop: '4px' }}>
                          {formatEuros(dossier.commande.shippingCents)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                          Boxtal / transport
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* User Identity Cards */}
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink, #141414)' }}>
                      Parties prenantes
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                      {/* Client Card */}
                      {(() => {
                        const isClientDeleted = isDeletedUser(dossier.client.name, dossier.client.email);
                        const isRepairerDeleted = isDeletedUser(dossier.repairer.name, dossier.repairer.email);
                        return (
                          <>
                            <div
                              style={{
                                padding: '16px',
                                backgroundColor: 'var(--paper)',
                                border: '1px solid var(--line, #dfe2e2)',
                                borderRadius: 'var(--r-card, 8px)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted, #6b7280)' }}>
                                  <Icon as={User} /> Client
                                </span>
                                <Link
                                  href={`/utilisateurs/${dossier.client.id}`}
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'var(--navy-text, #25324f)',
                                    textDecoration: 'none',
                                  }}
                                >
                                  Voir la fiche ↗
                                </Link>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink, #141414)' }}>
                                {isClientDeleted ? DELETED_USER_NAME : (dossier.client.name || 'Nom inconnu')}
                              </div>
                              {!isClientDeleted && (
                                <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
                                  <Icon as={Mail} /> {dossier.client.email || 'Email inconnu'}
                                </div>
                              )}
                              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                                <Icon as={Phone} /> {dossier.client.phone || 'Non renseigné'}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                                <Icon as={MapPin} /> {dossier.client.city || 'Ville non renseignée'}
                              </div>
                            </div>

                            {/* Repairer Card */}
                            <div
                              style={{
                                padding: '16px',
                                backgroundColor: 'var(--paper)',
                                border: '1px solid var(--line, #dfe2e2)',
                                borderRadius: 'var(--r-card, 8px)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted, #6b7280)' }}>
                                  <Icon as={Wrench} /> Réparateur
                                </span>
                                <Link
                                  href={`/utilisateurs/${dossier.repairer.id}`}
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'var(--navy-text, #25324f)',
                                    textDecoration: 'none',
                                  }}
                                >
                                  Voir la fiche ↗
                                </Link>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink, #141414)' }}>
                                {isRepairerDeleted ? DELETED_USER_NAME : (dossier.repairer.name || 'Nom inconnu')}
                              </div>
                              {!isRepairerDeleted && (
                                <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
                                  <Icon as={Mail} /> {dossier.repairer.email || 'Email inconnu'}
                                </div>
                              )}
                              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                                <Icon as={Phone} /> {dossier.repairer.phone || 'Non renseigné'}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                                <Icon as={MapPin} /> {dossier.repairer.city || 'Ville non renseignée'} · Statut :{' '}
                                <strong style={{ color: 'var(--ink, #141414)' }}>{dossier.repairer.kind}</strong> ·
                                Vérif :{' '}
                                <strong style={{ color: 'var(--ink, #141414)' }}>{dossier.repairer.verificationLevel}</strong>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Justificatif & Motifs */}
                  <div
                    style={{
                      padding: '18px',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-card, 8px)',
                    }}
                  >
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink, #141414)' }}>
                      Motif & Justificatifs du litige
                    </h3>
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                        Motif déclaré :
                      </span>{' '}
                      <strong style={{ color: 'var(--ink, #141414)', fontSize: '14px' }}>
                        {dossier.dispute.reason}
                      </strong>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                        Description détaillée :
                      </span>
                      <p
                        style={{
                          margin: '6px 0 0 0',
                          fontSize: '14px',
                          color: 'var(--ink, #141414)',
                          backgroundColor: 'var(--paper)',
                          padding: '12px',
                          borderRadius: 'var(--r-field, 4px)',
                          border: '1px solid var(--line, #dfe2e2)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {dossier.dispute.description || 'Aucune description textuelle fournie.'}
                      </p>
                    </div>

                    {/* Photos jointes */}
                    <DisputeEvidencePhotosGallery
                      photos={dossier.dispute.evidencePhotos ?? []}
                      onPreviewPhoto={(photo) => setPreviewPhoto(photo)}
                    />

                    {/* Demande associée */}
                    {dossier.demande && (
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--line, #dfe2e2)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                          Demande associée :
                        </span>{' '}
                        <Link
                          href={`/demandes/${dossier.demande.id}`}
                          style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-text, #25324f)' }}
                        >
                          {dossier.demande.title || 'Voir la demande'} ↗
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Shipments Summary */}
                  {dossier.shipments && dossier.shipments.length > 0 && (
                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: 'var(--paper)',
                        border: '1px solid var(--line, #dfe2e2)',
                        borderRadius: 'var(--r-card, 8px)',
                      }}
                    >
                      <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink, #141414)' }}>
                        Suivi logistique Boxtal
                      </h3>
                      <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>Trajet (Leg)</th>
                            <th>Transporteur</th>
                            <th>Statut</th>
                            <th>N° Expédition / Boxtal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.shipments.map((s, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{shipmentLegLabel(s.leg)}</td>
                              <td>{s.carrierLabel}</td>
                              <td>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: s.failureReason ? 'var(--badge-danger-bg)' : 'var(--badge-neutral-bg)',
                                    color: s.failureReason ? 'var(--badge-danger-text)' : 'var(--ink2)',
                                  }}
                                >
                                  {shipmentStatusLabel(s.status)}
                                </span>
                                {s.failureReason && (
                                  <div style={{ fontSize: '11px', color: 'var(--badge-danger-text)', marginTop: '2px' }}>
                                    {s.failureReason}
                                  </div>
                                )}
                              </td>
                              <td style={{ fontFamily: 'monospace' }}>{s.boxtalOrderId || 'Non renseigné'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Arbitration Action Section */}
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 'var(--r-card, 8px)',
                      border: isResolved ? '1px solid var(--badge-success-border)' : '1px solid var(--line, #dfe2e2)',
                      backgroundColor: isResolved ? 'var(--badge-success-bg)' : 'var(--badge-neutral-bg)',
                    }}
                  >
                    {isResolved ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '20px' }}><Icon as={Scale} /></span>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: dossier.commande.status === 'REFUNDED' ? 'var(--badge-danger-text)' : 'var(--badge-success-text)' }}>
                            {dossier.commande.status === 'REFUNDED'
                              ? `Commande annulée & remboursée (${getVerdictLabel(dossier.dispute.verdict)})`
                              : `Litige résolu (${getVerdictLabel(dossier.dispute.verdict)})`}
                          </h3>
                        </div>
                        {dossier.commande.status === 'REFUNDED' && (
                          <div
                            style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--badge-danger-bg)',
                              border: '1px solid var(--badge-danger-border)',
                              borderRadius: 'var(--r-field, 4px)',
                              fontSize: '12px',
                              color: 'var(--badge-danger-text)',
                              marginBottom: '10px',
                              fontWeight: 600,
                            }}
                          >
                            Cette commande est annulée et remboursée ({formatEuros(dossier.commande.totalCents)}). Ce statut terminal fait foi sur Litiges, Annulations et Remboursements.
                          </div>
                        )}
                        <div style={{ fontSize: '13px', color: dossier.commande.status === 'REFUNDED' ? 'var(--badge-danger-text)' : 'var(--badge-success-text)', marginBottom: '10px' }}>
                          Résolu le {formatDate(dossier.dispute.resolvedAt)}
                          {dossier.dispute.resolvedByName && (
                            <> par l'opérateur <strong>{dossier.dispute.resolvedByName}</strong></>
                          )}
                        </div>
                        {dossier.dispute.resolutionNote && (
                          <div
                            style={{
                              padding: '12px',
                              backgroundColor: 'var(--paper)',
                              border: dossier.commande.status === 'REFUNDED' ? '1px solid var(--badge-danger-border)' : '1px solid var(--badge-success-border)',
                              borderRadius: 'var(--r-field, 4px)',
                              fontSize: '13px',
                              color: 'var(--ink2)',
                            }}
                          >
                            <strong>Justification consignée :</strong>
                            <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
                              « {dossier.dispute.resolutionNote} »
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink, #141414)' }}>
                          <Icon as={Scale} /> Décision d'arbitrage
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: '0 0 16px 0' }}>
                          Sélectionnez la décision appropriée. Cette action impacte les transferts financiers Stripe et clôture définitivement le litige.
                        </p>

                        {dossier.commande.status === 'REFUNDED' ? (
                          <div
                            style={{
                              padding: '12px 16px',
                              backgroundColor: 'var(--badge-danger-bg)',
                              border: '1px solid var(--badge-danger-border)',
                              borderRadius: 'var(--r-field, 4px)',
                              fontSize: '13px',
                              color: 'var(--badge-danger-text)',
                            }}
                          >
                            <strong>Commande déjà annulée et remboursée :</strong> Aucun versement au réparateur ou reprise de réparation ne peut être ordonné sur une commande remboursée. Ce statut fait foi.
                          </div>
                        ) : canResolve ? (
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setArbitrationMode('RELEASE')}
                              style={{
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                backgroundColor: 'var(--navy)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 'var(--r-field, 6px)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Icon as={Coins} /> Paiement au réparateur
                            </button>

                            <button
                              type="button"
                              onClick={() => setArbitrationMode('REFUND_FULL')}
                              style={{
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                backgroundColor: 'var(--red-deep, #bd0e26)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 'var(--r-field, 6px)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Icon as={Undo2} /> Remboursement
                            </button>

                            <button
                              type="button"
                              onClick={() => setArbitrationMode('REFUND_PARTIAL')}
                              style={{
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                backgroundColor: 'var(--navy)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 'var(--r-field, 6px)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Icon as={Scissors} /> Remboursement partiel
                            </button>

                            <button
                              type="button"
                              onClick={() => setArbitrationMode('DISMISS')}
                              style={{
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                backgroundColor: 'var(--navy)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 'var(--r-field, 6px)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Icon as={Wrench} /> La réparation reprend
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: '10px 14px',
                              backgroundColor: 'var(--badge-neutral-bg)',
                              border: '1px solid var(--line)',
                              borderRadius: 'var(--r-field, 4px)',
                              fontSize: '13px',
                              color: 'var(--muted, #6b7280)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span><Icon as={Info} /></span>
                            <span>L&apos;arbitrage financier et la décision finale sont réservés aux rôles Finance et Admin. Le Support assure l&apos;instruction et la médiation.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: MESSAGES & EVIDENCE */}
              {activeTab === 'MESSAGES' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--ink, #141414)' }}>
                      Espaces d&apos;échange &amp; Messagerie
                    </h3>
                  </div>

                  <DisputeSpacesPanel
                    disputeId={dossier.dispute.id}
                    disputeStatus={dossier.dispute.status}
                    mainMessages={[...(dossier.conversation?.messages ?? [])].reverse()}
                    client={dossier.client}
                    repairer={dossier.repairer}
                    onReloadDossier={fetchDossier}
                  />
                </div>
              )}

              {/* TAB 3: INTERNAL ADMIN NOTES & CHRONOLOGY TIMELINE */}
              {activeTab === 'NOTES' && (
                <DisputeChronologyTimeline
                  timeline={dossier.timeline ?? []}
                  processingTimeDays={dossier.processingTimeDays ?? 0}
                  disputeStatus={dossier.dispute.status}
                  onAddNote={canHandle ? submitAdminNote : undefined}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Arbitration Action Modal */}
      <ArbitrationModal
        isOpen={arbitrationMode !== null}
        disputeId={disputeId}
        disputeNumber={dossier?.dispute.number}
        mode={arbitrationMode}
        commandeId={dossier?.commande.id}
        repairCents={dossier?.commande.repairCents}
        totalCents={dossier?.commande.totalCents}
        clientName={dossier?.client.name}
        repairerName={dossier?.repairer.name}
        onClose={() => setArbitrationMode(null)}
        onSuccess={() => {
          setArbitrationMode(null);
          void fetchDossier();
          notifyUpdated();
        }}
      />

      {/* Full-size Photo Preview Modal */}
      <DisputePhotoPreviewModal
        photo={previewPhoto}
        onClose={() => setPreviewPhoto(null)}
      />
    </>
  );
}
