'use client';

import React, { useState } from 'react';

interface SendUserEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName?: string | null;
  onSend: (data: { subject: string; message: string }) => Promise<void>;
  busy?: boolean;
}

export function SendUserEmailModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  onSend,
  busy = false,
}: SendUserEmailModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (trimmedSubject.length < 3) {
      setError("L'objet doit comporter au moins 3 caractères.");
      return;
    }
    if (trimmedSubject.length > 200) {
      setError("L'objet ne peut pas dépasser 200 caractères.");
      return;
    }
    if (trimmedMessage.length < 5) {
      setError('Le message doit comporter au moins 5 caractères.');
      return;
    }
    if (trimmedMessage.length > 5000) {
      setError('Le message ne peut pas dépasser 5000 caractères.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSend({ subject: trimmedSubject, message: trimmedMessage });
      setSubject('');
      setMessage('');
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'envoi de l'e-mail.");
    } finally {
      setSubmitting(false);
    }
  }

  const isFormDisabled = busy || submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-email-modal-title"
      data-testid="send-user-email-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
          maxWidth: '540px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
        }}
      >
        <h2
          id="send-email-modal-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--navy-text, #25324f)',
          }}
        >
          Envoyer un e-mail à l&apos;utilisateur
        </h2>

        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Destinataire : <strong style={{ color: 'var(--ink, #141414)' }}>{userName ? `${userName} (${userEmail})` : userEmail}</strong>
        </p>

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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="email-subject-input"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
            >
              Objet de l&apos;e-mail :
            </label>
            <input
              id="email-subject-input"
              data-testid="email-subject-input"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Information importante concernant votre compte"
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

          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="email-message-input"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
            >
              Message :
            </label>
            <textarea
              id="email-message-input"
              data-testid="email-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Rédigez votre message ici..."
              rows={6}
              disabled={isFormDisabled}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
              {message.length}/5000 caractères
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              data-testid="cancel-send-email"
              onClick={onClose}
              disabled={isFormDisabled}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--ink, #141414)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: isFormDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              data-testid="submit-send-email"
              disabled={isFormDisabled || subject.trim().length < 3 || message.trim().length < 5}
              style={{
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor:
                  isFormDisabled || subject.trim().length < 3 || message.trim().length < 5
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  isFormDisabled || subject.trim().length < 3 || message.trim().length < 5
                    ? 0.6
                    : 1,
              }}
            >
              {submitting ? 'Envoi en cours...' : "Envoyer l'e-mail"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
