'use client';

import React, { useEffect, useState } from 'react';
import { CopyableReference } from './CopyableReference';
import { formatEuros } from '../lib/money';

export interface GenerateShippingLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  commandeId: string;
  orderNumber?: string;
  clientName?: string;
  repairerName?: string;
  clientAddress?: string;
  repairerAddress?: string;
  weightGrams?: number;
  insuranceCents?: number;
  leg?: 'OUTBOUND' | 'RETURN';
  onSuccess?: () => void;
}

export function handleGenerateModalKeyDown(
  e: { key: string },
  submitting: boolean,
  onClose: () => void,
) {
  if (e.key === 'Escape' && !submitting) {
    onClose();
  }
}

export function GenerateShippingLabelModal({
  isOpen,
  onClose,
  commandeId,
  orderNumber,
  clientName,
  repairerName,
  clientAddress,
  repairerAddress,
  weightGrams: initialWeight = 500,
  insuranceCents = 0,
  leg = 'OUTBOUND',
  onSuccess,
}: GenerateShippingLabelModalProps) {
  const [carrier, setCarrier] = useState<'colissimo' | 'mondial_relay' | 'chronopost'>('colissimo');
  const [weightGrams, setWeightGrams] = useState<number>(initialWeight);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCarrier('colissimo');
      setWeightGrams(initialWeight || 500);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, initialWeight]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      handleGenerateModalKeyDown(e, submitting, onClose);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandeId) return;

    if (weightGrams <= 0) {
      setError('Le poids du colis doit être supérieur à 0 g.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(commandeId)}/shipments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leg,
          carrier,
          weightGrams: Number(weightGrams),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error?.message || data.message || "Erreur lors de la création de l'étiquette.");
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onSuccess?.();
      onClose();
    } catch {
      setError("Une erreur réseau est survenue.");
      setSubmitting(false);
    }
  };

  const senderName = leg === 'OUTBOUND' ? clientName : repairerName;
  const senderAddress = leg === 'OUTBOUND' ? clientAddress : repairerAddress;
  const recipientName = leg === 'OUTBOUND' ? repairerName : clientName;
  const recipientAddress = leg === 'OUTBOUND' ? repairerAddress : clientAddress;

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
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-shipping-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 12px)',
          border: '1px solid var(--line, #dfe2e2)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '540px',
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id="generate-shipping-modal-title"
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                fontFamily: 'var(--font-google-sans), Arial, sans-serif',
              }}
            >
              Générer l&#39;étiquette de transport
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: 'var(--muted, #6b7280)',
              }}
            >
              Trajet {leg === 'OUTBOUND' ? 'Aller (Client → Réparateur)' : 'Retour (Réparateur → Client)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer la boîte de dialogue"
            style={{
              background: 'none',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              fontSize: '20px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div
                role="alert"
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--red-soft, #feedf0)',
                  border: '1px solid var(--red-line, #f7c3ca)',
                  borderRadius: 'var(--r-field, 6px)',
                  color: 'var(--red-text, #bd0e26)',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            {/* Order recap */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle, #f8fafc)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 8px)',
                padding: '14px 16px',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Commande</span>
                <span style={{ fontWeight: 600 }}>
                  <CopyableReference prefix="CMD" value={commandeId} />
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #6b7280)' }}>Expéditeur</span>
                <span style={{ fontWeight: 500 }}>{senderName || '—'} {senderAddress ? `(${senderAddress})` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #6b7280)' }}>Destinataire</span>
                <span style={{ fontWeight: 500 }}>{recipientName || '—'} {recipientAddress ? `(${recipientAddress})` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted, #6b7280)' }}>Assurance transport</span>
                <span style={{ fontWeight: 500 }}>{insuranceCents > 0 ? formatEuros(insuranceCents) : 'Aucune'}</span>
              </div>
            </div>

            {/* Carrier selector */}
            <div>
              <label
                htmlFor="carrier-select"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--navy-text, #25324f)',
                }}
              >
                Transporteur
              </label>
              <select
                id="carrier-select"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value as any)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              >
                <option value="colissimo">Colissimo (La Poste - Domicile / Point retrait)</option>
                <option value="mondial_relay">Mondial Relay (Point relais)</option>
                <option value="chronopost">Chronopost (Express 24h)</option>
              </select>
            </div>

            {/* Weight input */}
            <div>
              <label
                htmlFor="weight-input"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--navy-text, #25324f)',
                }}
              >
                Poids du colis (en grammes)
              </label>
              <input
                id="weight-input"
                type="number"
                min="1"
                step="50"
                value={weightGrams}
                onChange={(e) => setWeightGrams(parseInt(e.target.value, 10) || 0)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--bg-subtle, #f8fafc)',
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
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: 'var(--r-field, 6px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--navy-text, #25324f)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: 'var(--r-field, 6px)',
                border: '1px solid var(--navy, #25324f)',
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {submitting ? 'Génération en cours…' : "Générer l'étiquette"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
