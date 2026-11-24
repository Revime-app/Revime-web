'use client';

import React, { useEffect } from 'react';
import type { AdminPayoutListItem } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { CreditCard, Info } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutRetryModalProps {
  isOpen: boolean;
  item: AdminPayoutListItem | null;
  onClose: () => void;
  onConfirm: (item: AdminPayoutListItem) => Promise<void> | void;
  loading?: boolean;
}

export function PayoutRetryModal({
  isOpen,
  item,
  onClose,
  onConfirm,
  loading = false,
}: PayoutRetryModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !item) return null;

  return (
    <div
      data-testid="payout-retry-modal-backdrop"
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
        if (!loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-retry-modal-title"
        data-testid="payout-retry-modal"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }} aria-hidden="true">
              <Icon as={CreditCard} />
            </span>
            <h3
              id="payout-retry-modal-title"
              data-testid="payout-retry-modal-title"
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
              }}
            >
              Réessayer le virement réparateur
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer la boîte de dialogue"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--muted, #6b7280)',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            fontSize: '13.5px',
          }}
        >
          <p style={{ margin: 0, color: 'var(--ink, #141414)', lineHeight: 1.5 }}>
            Vous vous apprêtez à relancer le transfert de fonds Stripe vers le compte connecté du réparateur pour la commande{' '}
            <strong style={{ color: 'var(--navy-text, #25324f)' }}>{item.orderNumber}</strong>.
          </p>

          {/* Details recap card */}
          <div
            style={{
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Montant du versement :</span>
              <span style={{ fontWeight: 700, color: 'var(--ink, #141414)', fontSize: '15px' }}>
                {formatEuros(item.amountCents)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Réparateur :</span>
              <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {item.repairerName}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Compte Stripe destinataire :</span>
              <span style={{ fontFamily: 'monospace, monospace', fontSize: '12px', color: 'var(--ink, #141414)' }}>
                {item.stripeAccountId || 'Aucun compte lié'}
              </span>
            </div>

            {item.failureReason && (
              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--badge-danger-bg)',
                  border: '1px solid var(--badge-danger-border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: 'var(--badge-danger-text)',
                }}
              >
                <strong>Dernier échec :</strong> {item.failureReason}
              </div>
            )}
          </div>

          {/* Idempotency & safety notice */}
          <div
            style={{
              backgroundColor: 'var(--badge-info-bg)',
              border: '1px solid var(--badge-info-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '12px',
              color: 'var(--badge-info-text)',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
              <Icon as={Info} />
            </span>
            <span>
              <strong>Garantie d'idempotence :</strong> Le transfert utilise une clé d'idempotence unique liée à la commande. Stripe garantit qu'aucun double virement ne sera exécuté.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderTop: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            data-testid="payout-retry-modal-cancel-btn"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Annuler
          </button>

          <button
            type="button"
            data-testid="payout-retry-modal-confirm-btn"
            onClick={() => onConfirm(item)}
            disabled={loading}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--navy, #25324f)',
              backgroundColor: loading ? 'var(--faint)' : 'var(--navy, #25324f)',
              color: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {loading ? 'Virement en cours…' : 'Confirmer le virement'}
          </button>
        </div>
      </div>
    </div>
  );
}
