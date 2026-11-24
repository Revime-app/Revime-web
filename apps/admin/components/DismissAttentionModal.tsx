'use client';

import React, { useEffect, useState } from 'react';
import { ATTENTION_REASON_LABEL, type AttentionReason } from '@revime/shared';
import { CopyableReference } from './CopyableReference';

export interface DismissAttentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  submitting?: boolean;
  commandeId?: string;
  demandeTitle?: string;
  clientName?: string;
  repairerName?: string;
  reasons?: AttentionReason[];
}

export function handleDismissModalKeyDown(
  e: { key: string },
  submitting: boolean,
  onClose: () => void,
) {
  if (e.key === 'Escape' && !submitting) {
    onClose();
  }
}

export function handleBackdropClick(
  submitting: boolean,
  onClose: () => void,
) {
  if (!submitting) {
    onClose();
  }
}

export function DismissAttentionModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  commandeId,
  demandeTitle,
  clientName,
  repairerName,
  reasons = [],
}: DismissAttentionModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      handleDismissModalKeyDown(e, submitting, onClose);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Un motif de classement est requis.');
      return;
    }
    if (trimmed.length < 3) {
      setError('Le motif doit comporter au moins 3 caractères.');
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
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
      onClick={() => handleBackdropClick(submitting, onClose)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dismiss-attention-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          width: '100%',
          maxWidth: '540px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
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
            backgroundColor: 'var(--paper, #ffffff)',
          }}
        >
          <h2
            id="dismiss-attention-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            Marquer comme traité
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--muted, #6b7280)', lineHeight: 1.5 }}>
              Cette action retire la commande de la liste de surveillance. L&apos;intervention sera consignée dans le journal d&apos;audit.
            </p>

            {/* Commande Context */}
            {(commandeId || demandeTitle || clientName || repairerName) && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                {commandeId && (
                  <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Commande :</span>
                    <CopyableReference value={commandeId} prefix="CMD" />
                  </div>
                )}
                {demandeTitle && (
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Demande :</span>{' '}
                    <strong style={{ color: 'var(--ink, #141414)' }}>{demandeTitle}</strong>
                  </div>
                )}
                {(clientName || repairerName) && (
                  <div style={{ color: 'var(--muted, #6b7280)' }}>
                    {clientName && <span>Client : <strong style={{ color: 'var(--ink, #141414)' }}>{clientName}</strong></span>}
                    {clientName && repairerName && <span> • </span>}
                    {repairerName && <span>Réparateur : <strong style={{ color: 'var(--ink, #141414)' }}>{repairerName}</strong></span>}
                  </div>
                )}
                {reasons.length > 0 && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {reasons.map((r) => (
                      <span
                        key={r}
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'var(--red-soft, #feedf0)',
                          color: 'var(--red-text, #bd0e26)',
                          border: '1px solid var(--badge-danger-border)',
                        }}
                      >
                        {ATTENTION_REASON_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason field */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="dismiss-reason-input"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginBottom: '6px',
                }}
              >
                Motif du classement <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
              </label>
              <textarea
                id="dismiss-reason-input"
                name="reason"
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                placeholder="Précisez la raison du classement (ex : anomalie vérifiée et régularisée avec le réparateur)..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: error ? '1px solid var(--red-deep, #bd0e26)' : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              {error && (
                <p
                  role="alert"
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '12px',
                    color: 'var(--red-text, #bd0e26)',
                    fontWeight: 500,
                  }}
                >
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
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
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: 'var(--r-field, 4px)',
                border: 'none',
                backgroundColor: submitting ? 'var(--faint)' : 'var(--navy, #25324f)',
                color: '#ffffff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {submitting ? 'Traitement…' : 'Confirmer le classement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
