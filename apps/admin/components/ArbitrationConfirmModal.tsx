'use client';

import { useEffect } from 'react';
import { formatDisputeRef } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { formatShortReference } from './CopyableReference';
import { Scale, TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface ArbitrationConfirmModalProps {
  isOpen: boolean;
  disputeNumber?: number | string | null;
  commandeId?: string | null;
  clientName?: string | null;
  repairerName?: string | null;
  verdictLabel: string;
  clientRefundCents: number;
  repairerPayoutCents: number;
  retainedCents?: number;
  isSubmitting?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ArbitrationConfirmModal({
  isOpen,
  disputeNumber,
  commandeId,
  clientName,
  repairerName,
  verdictLabel,
  clientRefundCents,
  repairerPayoutCents,
  retainedCents = 0,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: ArbitrationConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        onCancel();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) return null;

  const displayDisputeRef = disputeNumber
    ? typeof disputeNumber === 'number'
      ? formatDisputeRef(disputeNumber)
      : String(disputeNumber)
    : 'Litige';

  return (
    <div
      data-testid="arbitration-confirm-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '16px',
        backdropFilter: 'blur(3px)',
      }}
      onClick={() => {
        if (!isSubmitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="arbitration-confirm-modal-title"
        data-testid="arbitration-confirm-modal"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          width: '100%',
          maxWidth: '540px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-google-sans), Arial, sans-serif',
          border: '1px solid var(--line, #dfe2e2)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}><Icon as={Scale} /></span>
            <div>
              <h2
                id="arbitration-confirm-modal-title"
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 700,
                  color: 'var(--navy-deep-text, #1e293b)',
                }}
              >
                Confirmation de la décision d'arbitrage
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                {displayDisputeRef} {commandeId ? `• Commande ${formatShortReference(commandeId)}` : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-testid="arbitration-confirm-cancel-x"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Fermer la modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--muted, #6b7280)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body content */}
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: 'calc(80vh - 120px)',
            overflowY: 'auto',
          }}
        >
          {/* Parties recap */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              padding: '12px 14px',
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>CLIENT</div>
              <div
                data-testid="recap-client-name"
                style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-deep-text, #1e293b)', marginTop: '2px' }}
              >
                {clientName || 'Client'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>RÉPARATEUR</div>
              <div
                data-testid="recap-repairer-name"
                style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-deep-text, #1e293b)', marginTop: '2px' }}
              >
                {repairerName || 'Réparateur'}
              </div>
            </div>
          </div>

          {/* Verdict decision banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: 'var(--badge-info-bg)',
              border: '1px solid var(--badge-info-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--badge-info-text)' }}>
              Verdict sélectionné :
            </span>
            <span
              data-testid="recap-verdict-label"
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--badge-info-text)',
                padding: '4px 10px',
                backgroundColor: 'var(--paper)',
                borderRadius: '4px',
                border: '1px solid var(--badge-info-border)',
              }}
            >
              {verdictLabel}
            </span>
          </div>

          {/* Financial Breakdown Table */}
          <div
            data-testid="financial-breakdown-card"
            style={{
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--badge-neutral-bg)',
                borderBottom: '1px solid var(--line, #dfe2e2)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--navy-deep-text, #1e293b)',
              }}
            >
              Répartition financière de l'arbitrage
            </div>

            <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'var(--navy-deep-text, #1e293b)' }}>Montant remboursé au client :</span>
                <span
                  data-testid="breakdown-client-refund"
                  style={{
                    fontWeight: 700,
                    color: clientRefundCents > 0 ? 'var(--red-text, #bd0e26)' : 'var(--navy-deep-text, #1e293b)',
                  }}
                >
                  {formatEuros(clientRefundCents)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'var(--navy-deep-text, #1e293b)' }}>Montant versé au réparateur :</span>
                <span
                  data-testid="breakdown-repairer-payout"
                  style={{
                    fontWeight: 700,
                    color: repairerPayoutCents > 0 ? 'var(--badge-success-text)' : 'var(--navy-deep-text, #1e293b)',
                  }}
                >
                  {formatEuros(repairerPayoutCents)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                  borderTop: '1px dashed var(--line, #dfe2e2)',
                  paddingTop: '8px',
                }}
              >
                <span style={{ color: 'var(--muted, #6b7280)' }}>Conservé par Revime (livraison, protection, assurance) :</span>
                <span
                  data-testid="breakdown-retained"
                  style={{ fontWeight: 600, color: 'var(--muted, #6b7280)' }}
                >
                  {formatEuros(retainedCents)}
                </span>
              </div>
            </div>
          </div>

          {/* Irreversibility Warning Banner */}
          <div
            data-testid="irreversibility-warning"
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--red-soft, #feedf0)',
              border: '1px solid var(--badge-danger-border)',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '-2px' }}><Icon as={TriangleAlert} /></span>
            <div
              style={{
                fontSize: '12px',
                lineHeight: 1.5,
                color: 'var(--red-text, #bd0e26)',
                fontWeight: 600,
              }}
            >
              Attention : Cette décision d'arbitrage est définitive et déclenche immédiatement les mouvements de fonds bancaires.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--badge-neutral-bg)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            type="button"
            data-testid="arbitration-confirm-cancel-btn"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--navy-deep-text, #1e293b)',
              backgroundColor: 'var(--paper)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Annuler
          </button>

          <button
            type="button"
            data-testid="arbitration-confirm-submit-btn"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: 'var(--navy, #25324f)',
              border: 'none',
              borderRadius: 'var(--r-field, 4px)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isSubmitting ? 'Exécution du règlement…' : 'Confirmer l’arbitrage'}
          </button>
        </div>
      </div>
    </div>
  );
}
