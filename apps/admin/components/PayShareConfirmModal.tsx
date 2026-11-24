'use client';

import React, { useEffect } from 'react';
import { formatEuros } from '../lib/money';

export interface PayShareConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  submitting?: boolean;
  shareOwedCents: number;
  repairerName?: string;
  commandeReference?: string;
  error?: string | null;
}

export function PayShareConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  shareOwedCents,
  repairerName,
  commandeReference,
  error = null,
}: PayShareConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-share-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(37, 50, 79, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 20px 25px -5px rgba(37, 50, 79, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            id="pay-share-confirm-title"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              margin: 0,
            }}
          >
            Payer la part réparateur
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {error && (
            <div
              role="alert"
              style={{
                backgroundColor: 'var(--badge-danger-bg)',
                border: '1px solid var(--badge-danger-border)',
                color: 'var(--badge-danger-text)',
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <p style={{ fontSize: '14px', color: 'var(--ink, #141414)', lineHeight: 1.5, margin: '0 0 16px' }}>
            Confirmez-vous le versement de la part restant due au réparateur pour la commande{' '}
            <strong>{commandeReference ? `#${commandeReference}` : ''}</strong> ?
          </p>

          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--badge-neutral-bg)',
              borderRadius: '6px',
              border: '1px solid var(--line, #dfe2e2)',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Montant à virer :</span>
              <strong style={{ color: 'var(--navy-text, #25324f)', fontSize: '15px' }}>
                {formatEuros(shareOwedCents)}
              </strong>
            </div>
            {repairerName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #6b7280)' }}>Bénéficiaire :</span>
                <span style={{ color: 'var(--ink, #141414)', fontWeight: 600 }}>{repairerName}</span>
              </div>
            )}
          </div>

          <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0, lineHeight: 1.4 }}>
            Un virement Stripe Connect Transfer sera initié à destination du compte bancaire configuré du réparateur.
          </p>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'var(--badge-neutral-bg)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--on-accent, #ffffff)',
              backgroundColor: submitting ? 'var(--faint)' : 'var(--navy, #25324f)',
              border: 'none',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Virement en cours…' : 'Confirmer le versement'}
          </button>
        </div>
      </div>
    </div>
  );
}
