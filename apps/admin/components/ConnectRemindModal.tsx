'use client';

import React, { useEffect } from 'react';
import { CONNECT_STATUS_LABEL, type AdminIncompleteConnectAccount } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { Info, Mail } from 'lucide-react';
import { Icon } from './Icon';

export interface ConnectRemindModalProps {
  isOpen: boolean;
  account: AdminIncompleteConnectAccount | null;
  onClose: () => void;
  onConfirm: (account: AdminIncompleteConnectAccount) => Promise<void> | void;
  loading?: boolean;
}

export function ConnectRemindModal({
  isOpen,
  account,
  onClose,
  onConfirm,
  loading = false,
}: ConnectRemindModalProps) {
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

  if (!isOpen || !account) return null;

  return (
    <div
      data-testid="connect-remind-modal-backdrop"
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
        aria-labelledby="connect-remind-modal-title"
        data-testid="connect-remind-modal"
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
              <Icon as={Mail} />
            </span>
            <h3
              id="connect-remind-modal-title"
              data-testid="connect-remind-modal-title"
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
              }}
            >
              Envoyer un rappel Stripe Connect
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
            Une notification in-app ainsi qu'un e-mail de rappel seront envoyés au réparateur pour l'inviter à compléter les informations requises sur son compte Stripe Connect.
          </p>

          {/* Account & Pending funds summary */}
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
              <span style={{ color: 'var(--muted, #6b7280)' }}>Réparateur :</span>
              <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {account.repairerName} ({account.repairerEmail})
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Compte Stripe :</span>
              <span style={{ fontFamily: 'monospace, monospace', fontSize: '12px', color: 'var(--ink, #141414)' }}>
                {account.stripeAccountId ?? 'Aucun compte'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Statut actuel :</span>
              <span style={{ fontWeight: 600, color: 'var(--navy-text, #25324f)' }}>
                {account.status === null ? 'Non créé' : CONNECT_STATUS_LABEL[account.status]}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted, #6b7280)' }}>Fonds en attente :</span>
              <span style={{ fontWeight: 700, color: 'var(--badge-warning-text)', fontSize: '14px' }}>
                {formatEuros(account.pendingPayoutsTotalCents)} ({account.pendingPayoutsCount} commande{account.pendingPayoutsCount > 1 ? 's' : ''})
              </span>
            </div>

            {account.disabledReason && (
              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--badge-warning-bg)',
                  border: '1px solid var(--badge-warning-border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: 'var(--badge-warning-text)',
                }}
              >
                <strong>Motif de blocage :</strong> {account.disabledReason}
              </div>
            )}
          </div>

          {/* Notice info */}
          <div
            style={{
              backgroundColor: 'var(--badge-success-bg)',
              border: '1px solid var(--badge-success-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '12px',
              color: 'var(--badge-success-text)',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
              <Icon as={Info} />
            </span>
            <span>
              L'e-mail contiendra un lien direct sécurisé vers le tableau de bord Stripe afin de téléverser les justificatifs d'identité ou bancaires manquants.
            </span>
          </div>
        </div>

        {/* Footer */}
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
            data-testid="connect-remind-modal-cancel-btn"
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
            data-testid="connect-remind-modal-confirm-btn"
            onClick={() => onConfirm(account)}
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
            {loading ? 'Envoi en cours…' : 'Envoyer la notification'}
          </button>
        </div>
      </div>
    </div>
  );
}
