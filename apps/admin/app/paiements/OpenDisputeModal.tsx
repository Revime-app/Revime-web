'use client';

import { useEffect, useState } from 'react';
import { CopyableReference } from '../../components/CopyableReference';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface OpenDisputeModalProps {
  isOpen: boolean;
  commandeId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function OpenDisputeModal({
  isOpen,
  commandeId,
  onClose,
  onSuccess,
}: OpenDisputeModalProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [initiator, setInitiator] = useState<'ADMIN' | 'CLIENT' | 'REPAIRER'>('ADMIN');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDescription('');
      setInitiator('ADMIN');
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

  if (!isOpen || !commandeId) return null;

  const isReasonValid = reason.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(commandeId)}/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: reason.trim(),
          description: description.trim() ? description.trim() : undefined,
          initiator,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
        setError(body?.message || body?.error?.message || "Une erreur est survenue lors de l'ouverture du litige.");
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
        aria-labelledby="open-dispute-modal-title"
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
          id="open-dispute-modal-title"
          style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: '0 0 12px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          Ouvrir un litige
        </h2>

        <div
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
            <CopyableReference value={commandeId} prefix="CMD" />
          </div>
        </div>

        <div
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--amber-soft, #fef0c7)',
            border: '1px solid var(--badge-warning-border)',
            borderRadius: 'var(--r-field, 6px)',
            color: 'var(--amber-deep, #b45309)',
            fontSize: '13px',
            lineHeight: 1.4,
            marginBottom: '16px',
          }}
        >
          <Icon as={TriangleAlert} /> L&apos;ouverture d&apos;un litige bloque le versement des fonds au réparateur et notifie les deux parties.
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--red-soft, #feedf0)',
              border: '1px solid var(--badge-danger-border)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--red-text, #bd0e26)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              htmlFor="dispute-initiator-select"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Rôle du demandeur <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
            </label>
            <select
              id="dispute-initiator-select"
              value={initiator}
              onChange={(e) => setInitiator(e.target.value as 'ADMIN' | 'CLIENT' | 'REPAIRER')}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper)',
              }}
            >
              <option value="ADMIN">Administrateur (ADMIN)</option>
              <option value="CLIENT">Client (CLIENT)</option>
              <option value="REPAIRER">Réparateur (REPAIRER)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="dispute-reason-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Motif du litige <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span> (min. 3 caractères)
            </label>
            <input
              id="dispute-reason-input"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Non-conformité, Colis perdu, Non-respect des délais..."
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="dispute-description-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Description détaillée (facultatif)
            </label>
            <textarea
              id="dispute-description-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Précisions sur les constats, échanges et justifications..."
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                lineHeight: 1.4,
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
                backgroundColor: !isReasonValid || isSubmitting ? 'var(--badge-danger-border)' : 'var(--red-deep, #bd0e26)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !isReasonValid || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting ? 'Création en cours...' : 'Ouvrir le litige'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
