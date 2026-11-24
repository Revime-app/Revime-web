'use client';

import { useEffect, useRef, useState } from 'react';
import { RefundForm, type RefundFormSubmitBody } from '../../components/RefundForm';
import { ArbitrationConfirmModal } from '../../components/ArbitrationConfirmModal';
import { arbitrationRecap } from '../../lib/arbitration-recap';

export type ArbitrationMode = 'RELEASE' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'DISMISS' | 'REFUND';

export interface ArbitrationConfig {
  title: string;
  warningText: string;
  submitLabel: string;
  endpoint: string;
  buttonBg: string;
  isRefund: boolean;
  refundPreset?: 'full' | 'suggestion';
}

export interface ArbitrationModalProps {
  isOpen: boolean;
  disputeId: string | null;
  mode: ArbitrationMode | null;
  disputeNumber?: number | string | null;
  /** Needed only in REFUND modes, to fetch the commande summary the RefundForm reads. */
  commandeId?: string | null;
  repairCents?: number;
  totalCents?: number;
  clientName?: string | null;
  repairerName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

import { formatEuros } from '../../lib/money';
import { CircleCheck, Info, Scale, Wrench } from 'lucide-react';
import { Icon } from '../../components/Icon';

export function getArbitrationConfig(
  mode: ArbitrationMode,
  disputeId: string,
  repairCents: number = 0,
): ArbitrationConfig {
  switch (mode) {
    case 'RELEASE':
      return {
        title: 'Paiement au réparateur',
        warningText:
          "Êtes-vous sûr de vouloir verser les fonds au réparateur ? Cette action force le déblocage de l'escrow Stripe vers le réparateur et clôture le litige en sa faveur.",
        submitLabel: `Confirmer le paiement (${formatEuros(repairCents)})`,
        endpoint: `/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/resolve-release`,
        buttonBg: 'var(--navy)', // green
        isRefund: false,
      };

    case 'REFUND_FULL':
    case 'REFUND':
      return {
        title: 'Remboursement intégral du client',
        warningText: '',
        submitLabel: '',
        endpoint: `/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/resolve-refund`,
        buttonBg: 'var(--red-deep, #bd0e26)', // red
        isRefund: true,
        refundPreset: 'full',
      };

    case 'REFUND_PARTIAL':
      return {
        title: 'Remboursement partiel',
        warningText: '',
        submitLabel: '',
        endpoint: `/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/resolve-refund`,
        buttonBg: 'var(--navy)', // amber/orange
        isRefund: true,
        refundPreset: 'suggestion',
      };

    case 'DISMISS':
      return {
        title: 'La réparation reprend',
        warningText:
          "Êtes-vous sûr de vouloir clore le litige ? La réparation reprend et la commande repart à l'étape où elle s'était arrêtée. Aucun mouvement financier n'est effectué à ce stade.",
        submitLabel: 'Confirmer la reprise de la réparation',
        endpoint: `/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/resolve-dismiss`,
        buttonBg: 'var(--navy)', // neutral slate
        isRefund: false,
      };
  }
}

type CommandeSummary = {
  repairCents: number;
  shippingCents: number;
  insuranceCents: number;
  protectionCents: number;
  transferred: boolean;
  suggestion: { repairCents: number; shippingCents: number; protectionCents: number };
};

export function ArbitrationModal({
  isOpen,
  disputeId,
  mode,
  disputeNumber = null,
  commandeId = null,
  repairCents = 0,
  totalCents = 0,
  clientName = null,
  repairerName = null,
  onClose,
  onSuccess,
}: ArbitrationModalProps) {
  const [resolutionNote, setResolutionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingRefundBody, setPendingRefundBody] = useState<RefundFormSubmitBody | null>(null);
  const refundResolverRef = useRef<{ resolve: () => void; reject: (err: any) => void } | null>(null);

  // REFUND mode needs the commande's amounts and step-based suggestion, which the
  // props above don't carry in full - fetched fresh each time the modal opens so a
  // stale summary from a previous dossier is never shown.
  const [commandeSummary, setCommandeSummary] = useState<CommandeSummary | null>(null);
  const [loadingCommande, setLoadingCommande] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResolutionNote('');
      setIsSubmitting(false);
      setError(null);
      setShowConfirmModal(false);
      setPendingRefundBody(null);
      refundResolverRef.current = null;
    }
  }, [isOpen]);

  const config = mode && disputeId ? getArbitrationConfig(mode, disputeId, repairCents) : null;

  useEffect(() => {
    if (!isOpen || !config?.isRefund || !commandeId) {
      setCommandeSummary(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadingCommande(true);
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(commandeId)}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error?.message || 'Commande introuvable.');
          return;
        }
        if (!cancelled) {
          setCommandeSummary({
            repairCents: data.repairCents,
            shippingCents: data.shippingCents,
            insuranceCents: data.insuranceCents,
            protectionCents: data.protectionCents,
            transferred: data.transferred,
            suggestion: data.suggestion,
          });
        }
      } catch {
        if (!cancelled) setLoadError('Erreur réseau. Impossible de contacter le serveur.');
      } finally {
        if (!cancelled) setLoadingCommande(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, config?.isRefund, commandeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !disputeId || !mode || !config) return null;

  const isNoteValid = resolutionNote.trim().length >= 3;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNoteValid || isSubmitting) return;
    setShowConfirmModal(true);
  };

  // R6: the REFUND body must be the flexible breakdown (RefundBreakdownInput's
  // dispute counterpart, `ResolveDisputeRefundInput`), never `{ resolutionNote }`
  // alone - the route now rejects that with a 400.
  const handleRefundSubmit = (body: RefundFormSubmitBody) => {
    setPendingRefundBody(body);
    setShowConfirmModal(true);
    return new Promise<void>((resolve, reject) => {
      refundResolverRef.current = { resolve, reject };
    });
  };

  const handleConfirmArbitration = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (pendingRefundBody) {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolutionNote: pendingRefundBody.note,
            motif: pendingRefundBody.motif,
            repairCents: pendingRefundBody.repairCents,
            shippingCents: pendingRefundBody.shippingCents,
            protectionCents: pendingRefundBody.protectionCents,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error?.message || data?.message || "Une erreur est survenue lors de l'enregistrement de la décision.");
        }

        refundResolverRef.current?.resolve();
        refundResolverRef.current = null;
        setShowConfirmModal(false);
        setIsSubmitting(false);
        onSuccess();
      } else {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resolutionNote: resolutionNote.trim(),
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string; error?: { message?: string } }
            | null;
          throw new Error(
            body?.message ||
              body?.error?.message ||
              "Une erreur est survenue lors de l'enregistrement de la décision.",
          );
        }

        setShowConfirmModal(false);
        setIsSubmitting(false);
        onSuccess();
      }
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors de la validation.';
      setError(msg);
      refundResolverRef.current?.reject(err);
      refundResolverRef.current = null;
      setShowConfirmModal(false);
      setIsSubmitting(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    if (refundResolverRef.current) {
      refundResolverRef.current.resolve();
      refundResolverRef.current = null;
    }
    setPendingRefundBody(null);
  };

  let verdictLabel = config.title;
  if (mode === 'RELEASE') {
    verdictLabel = 'Paiement au réparateur';
  } else if (mode === 'REFUND_FULL' || (mode === 'REFUND' && (!pendingRefundBody || pendingRefundBody.repairCents === repairCents))) {
    verdictLabel = 'Remboursement intégral';
  } else if (mode === 'REFUND_PARTIAL' || (pendingRefundBody && pendingRefundBody.repairCents < repairCents)) {
    verdictLabel = 'Remboursement partiel';
  } else if (mode === 'DISMISS') {
    verdictLabel = 'Reprise de la réparation';
  }

  const { clientRefundCents, repairerPayoutCents, retainedCents } = arbitrationRecap({
    mode,
    totalCents,
    repairCents,
    refundBody: pendingRefundBody,
  });

  return (
    <>
      <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="arbitration-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--paper)',
          }}
        >
          <h2
            id="arbitration-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            {config.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fermer la fenêtre d'arbitrage"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {config.isRefund ? (
          <div style={{ padding: '24px' }}>
            {/* Banner explaining outcome for Full vs Partial */}
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: config.refundPreset === 'full' ? 'var(--red-soft, #feedf0)' : 'var(--badge-warning-bg)',
                border: `1px solid ${config.refundPreset === 'full' ? 'var(--badge-danger-border)' : 'var(--badge-warning-border)'}`,
                borderRadius: 'var(--r-field, 4px)',
                fontSize: '13px',
                lineHeight: 1.5,
                color: config.refundPreset === 'full' ? 'var(--badge-danger-text)' : 'var(--badge-warning-text)',
                marginBottom: '16px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}><Icon as={config.refundPreset === 'full' ? Info : Scale} /></span>
              <div>
                {config.refundPreset === 'full' ? (
                  <>
                    <strong>Remboursement intégral :</strong> la commande sera clôturée et le réparateur ne recevra rien (0,00 €). Vous pouvez ajuster les montants ligne par ligne ci-dessous si nécessaire.
                  </>
                ) : (
                  <>
                    <strong>Remboursement partiel :</strong> le client récupère les montants saisis ci-dessous. Le réparateur recevra le solde restant de la réparation (si non déjà transféré). La commande sera clôturée.
                  </>
                )}
              </div>
            </div>

            {loadError && (
              <p role="alert" style={{ color: 'var(--red-text, #bd0e26)' }}>
                {loadError}
              </p>
            )}
            {loadingCommande && <p>Chargement…</p>}
            {commandeSummary && (
              <RefundForm
                mode="dispute"
                initialPreset={config.refundPreset}
                summary={{
                  order: {
                    repairCents: commandeSummary.repairCents,
                    shippingCents: commandeSummary.shippingCents,
                    insuranceCents: commandeSummary.insuranceCents,
                    protectionCents: commandeSummary.protectionCents,
                    transferred: commandeSummary.transferred,
                  },
                  suggestion: commandeSummary.suggestion,
                }}
                onSubmit={handleRefundSubmit}
              />
            )}
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} style={{ padding: '24px', gap: '20px', display: 'flex', flexDirection: 'column' }}>
            {error && (
              <div
                role="alert"
                style={{
                  color: 'var(--red-text, #bd0e26)',
                  backgroundColor: 'var(--red-soft, #feedf0)',
                  border: '1px solid var(--badge-danger-border)',
                  padding: '12px 14px',
                  borderRadius: 'var(--r-field, 4px)',
                  fontSize: '14px',
                }}
              >
                {error}
              </div>
            )}

            {/* Warning Banner */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: mode === 'DISMISS' ? 'var(--badge-neutral-bg)' : 'var(--badge-success-bg)',
                border: `1px solid ${mode === 'DISMISS' ? 'var(--line)' : 'var(--badge-success-border)'}`,
                borderRadius: 'var(--r-field, 6px)',
                fontSize: '14px',
                lineHeight: 1.5,
                color: mode === 'DISMISS' ? 'var(--ink2)' : 'var(--badge-success-text)',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}><Icon as={mode === 'DISMISS' ? Wrench : CircleCheck} /></span>
              <div>{config.warningText}</div>
            </div>

            {/* Justification note */}
            <div>
              <label
                htmlFor="resolution-note"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginBottom: '6px',
                }}
              >
                Justification obligatoire de la décision <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
              </label>
              <textarea
                id="resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                disabled={isSubmitting}
                rows={4}
                placeholder="Expliquez la motivation de cet arbitrage (min. 3 caractères)..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <div
                style={{
                  fontSize: '12px',
                  color: isNoteValid ? 'var(--muted, #6b7280)' : 'var(--red-text, #bd0e26)',
                  marginTop: '4px',
                }}
              >
                Au moins 3 caractères requis ({resolutionNote.trim().length}/3)
              </div>
            </div>

            {/* Footer buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                paddingTop: '8px',
                borderTop: '1px solid var(--line, #dfe2e2)',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '10px 18px',
                  fontSize: '14px',
                  fontWeight: 500,
                  backgroundColor: 'var(--paper)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: 'var(--ink, #141414)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!isNoteValid || isSubmitting}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  backgroundColor: config.buttonBg,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--r-field, 4px)',
                  cursor: !isNoteValid || isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !isNoteValid || isSubmitting ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {isSubmitting ? 'Traitement en cours…' : config.submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>

    <ArbitrationConfirmModal
      isOpen={showConfirmModal}
      disputeNumber={disputeNumber}
      commandeId={commandeId}
      clientName={clientName}
      repairerName={repairerName}
      verdictLabel={verdictLabel}
      clientRefundCents={clientRefundCents}
      repairerPayoutCents={repairerPayoutCents}
      retainedCents={retainedCents}
      isSubmitting={isSubmitting}
      onConfirm={handleConfirmArbitration}
      onCancel={handleCancelConfirm}
    />
  </>
  );
}
