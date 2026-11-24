'use client';

import React, { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

interface DeleteUserDoubleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  onConfirm: (reason: string) => Promise<void>;
  busy?: boolean;
  initialStep?: 1 | 2;
}

export function DeleteUserDoubleConfirmModal({
  isOpen,
  onClose,
  userName,
  userEmail,
  onConfirm,
  busy = false,
  initialStep = 1,
}: DeleteUserDoubleConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [reason, setReason] = useState('');
  const [confirmationWord, setConfirmationWord] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleClose() {
    setStep(1);
    setReason('');
    setConfirmationWord('');
    setError(null);
    onClose();
  }

  async function handleFinalSubmit() {
    if (confirmationWord !== 'SUPPRIMER') {
      setError('Veuillez saisir SUPPRIMER pour confirmer.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la suppression du compte.');
    } finally {
      setSubmitting(false);
    }
  }

  const isFormDisabled = busy || submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-modal-title"
      data-testid="delete-user-double-confirm-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--line, #dfe2e2)',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '20px' }}><Icon as={TriangleAlert} /></span>
          <h2
            id="delete-user-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--red, #f61b39)',
            }}
          >
            {step === 1 ? 'Suppression de compte (Étape 1/2)' : 'Confirmation finale (Étape 2/2)'}
          </h2>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--badge-danger-bg)',
              color: 'var(--red, #f61b39)',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--ink, #141414)', margin: '0 0 12px 0' }}>
              Vous êtes sur le point d&apos;initier la suppression du compte de{' '}
              <strong>{userName || userEmail}</strong> ({userEmail}).
            </p>
            <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: '0 0 16px 0' }}>
              Cette action est <strong>irréversible</strong>. Les données personnelles seront effacées conformément aux exigences RGPD.
            </p>

            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="delete-reason-input"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
              >
                Motif de suppression (obligatoire) :
              </label>
              <input
                id="delete-reason-input"
                data-testid="delete-reason-input"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Demande de suppression RGPD, Fraude avérée..."
                disabled={isFormDisabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={isFormDisabled}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--ink, #141414)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  cursor: isFormDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                data-testid="continue-delete-step2"
                onClick={() => {
                  if (reason.trim().length < 3) {
                    setError('Indiquez un motif d’au moins 3 caractères.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                disabled={isFormDisabled || reason.trim().length < 3}
                style={{
                  backgroundColor: 'var(--red, #f61b39)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isFormDisabled || reason.trim().length < 3 ? 'not-allowed' : 'pointer',
                  opacity: isFormDisabled || reason.trim().length < 3 ? 0.6 : 1,
                }}
              >
                Continuer vers la confirmation
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div
              style={{
                backgroundColor: 'var(--badge-danger-bg)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: 'var(--badge-danger-text)',
              }}
            >
              <strong>Motif enregistré :</strong> {reason}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ink, #141414)', marginBottom: '12px' }}>
              Pour confirmer la suppression définitive et immédiate de ce compte, veuillez saisir le mot{' '}
              <strong style={{ color: 'var(--red, #f61b39)' }}>SUPPRIMER</strong> ci-dessous :
            </p>

            <div style={{ marginBottom: '18px' }}>
              <input
                id="confirmation-word-input"
                data-testid="confirmation-word-input"
                type="text"
                value={confirmationWord}
                onChange={(e) => setConfirmationWord(e.target.value)}
                placeholder="Tapez SUPPRIMER"
                disabled={isFormDisabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isFormDisabled}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--ink, #141414)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  cursor: isFormDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                Retour
              </button>
              <button
                type="button"
                data-testid="confirm-final-delete"
                onClick={handleFinalSubmit}
                disabled={isFormDisabled || confirmationWord !== 'SUPPRIMER'}
                style={{
                  backgroundColor: 'var(--red, #f61b39)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isFormDisabled || confirmationWord !== 'SUPPRIMER' ? 'not-allowed' : 'pointer',
                  opacity: isFormDisabled || confirmationWord !== 'SUPPRIMER' ? 0.6 : 1,
                }}
              >
                {submitting ? 'Suppression...' : 'Confirmer la suppression définitive'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
