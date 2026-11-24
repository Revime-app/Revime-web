'use client';

import React, { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface CancelConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  submitting?: boolean;
  commandeReference?: string;
  error?: string | null;
}

export function CancelConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  commandeReference,
  error = null,
}: CancelConfirmModalProps) {
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
      aria-labelledby="cancel-confirm-title"
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
            id="cancel-confirm-title"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--navy-text, #f61b39)',
              margin: 0,
            }}
          >
            Annuler la commande
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

          <p style={{ fontSize: '14px', color: 'var(--ink, #141414)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Êtes-vous certain de vouloir annuler la commande{' '}
            <strong>{commandeReference ? `#${commandeReference}` : ''}</strong> ?
          </p>

          <div
            style={{
              fontSize: '13px',
              color: 'var(--badge-danger-text)',
              backgroundColor: 'var(--badge-danger-bg)',
              padding: '12px 14px',
              borderRadius: '6px',
              border: '1px solid var(--badge-danger-border)',
              lineHeight: 1.4,
              marginBottom: '16px',
            }}
          >
            <Icon as={TriangleAlert} /> Cette commande impayée sera définitivement classée comme abandonnée. Cette opération est <strong>irréversible</strong>.
          </div>

          <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0, lineHeight: 1.4 }}>
            Remarque : cette action est réservée aux commandes qui n’ont pas fait l’objet d’un règlement bancaire Stripe.
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
            Retour
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: submitting ? 'var(--faint)' : 'var(--accent, #f61b39)',
              border: 'none',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Annulation…' : 'Confirmer l’annulation'}
          </button>
        </div>
      </div>
    </div>
  );
}
