'use client';

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface ModerateOfferModalProps {
  isOpen: boolean;
  offerId: string;
  repairerName: string;
  demandeTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ModerateOfferModal({
  isOpen,
  offerId,
  repairerName,
  demandeTitle,
  onClose,
  onSuccess,
}: ModerateOfferModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const isReasonValid = reason.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/admin/offres/${offerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message || 'Une erreur est survenue lors du retrait de l\'offre.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
    } catch {
      setError('Erreur réseau. Impossible de contacter le serveur.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
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
        zIndex: 1050,
        padding: '16px',
      }}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderate-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="moderate-modal-title"
          style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: '0 0 16px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          Retirer l'offre pour motif de modération
        </h2>

        {/* Context callout */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
            marginBottom: '16px',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong style={{ color: 'var(--ink, #141414)' }}>Réparateur :</strong> {repairerName}
          </div>
          <div style={{ marginTop: '4px' }}>
            <strong style={{ color: 'var(--ink, #141414)' }}>Demande :</strong> {demandeTitle}
          </div>
        </div>

        {/* Warning alert */}
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            borderRadius: 'var(--r-field, 6px)',
            color: 'var(--red-text, #bd0e26)',
            fontSize: '13px',
            lineHeight: 1.4,
            marginBottom: '16px',
          }}
        >
          <Icon as={TriangleAlert} /> Le retrait d'une offre est une action administrative irréversible enregistrée dans le journal d'audit.
          L'offre sera marquée comme retirée.
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--badge-danger-bg)',
              border: '1px solid var(--badge-danger-border)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--badge-danger-text)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="moderate-reason-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Motif de modération <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span> (min. 3 caractères)
            </label>
            <textarea
              id="moderate-reason-input"
              rows={4}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif obligatoire (ex: Contenu non conforme, coordonnées privées, propos abusifs...)"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: 1.5,
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
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
              disabled={!isReasonValid || isSubmitting}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: !isReasonValid || isSubmitting ? 'var(--badge-danger-border)' : 'var(--red)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !isReasonValid || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting ? 'Retrait en cours...' : 'Confirmer le retrait'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
