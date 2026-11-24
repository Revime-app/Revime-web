'use client';

import React, { useEffect } from 'react';
import { formatEuros } from '../lib/money';
import { CopyableReference } from './CopyableReference';

export interface RefundBreakdownDetails {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
}

export interface RefundConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  submitting?: boolean;
  commandeId?: string;
  clientName?: string;
  repairerName?: string;
  breakdown: RefundBreakdownDetails;
  totalClientCents: number;
}

export function handleRefundModalKeyDown(
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

export function RefundConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  commandeId,
  clientName,
  repairerName,
  breakdown,
  totalClientCents,
}: RefundConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      handleRefundModalKeyDown(e, submitting, onClose);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

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
        aria-labelledby="refund-confirm-modal-title"
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
            id="refund-confirm-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            Confirmation du remboursement
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
        <div style={{ padding: '24px' }}>
          {/* Order reference and actors if available */}
          {(commandeId || clientName || repairerName) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                padding: '12px 16px',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                marginBottom: '16px',
              }}
            >
              {commandeId && (
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: 'var(--muted, #6b7280)',
                      fontWeight: 600,
                      marginBottom: '2px',
                    }}
                  >
                    Commande
                  </span>
                  <CopyableReference value={commandeId} prefix="CMD" />
                </div>
              )}
              {clientName && (
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: 'var(--muted, #6b7280)',
                      fontWeight: 600,
                      marginBottom: '2px',
                    }}
                  >
                    Client
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                    {clientName}
                  </span>
                </div>
              )}
              {repairerName && (
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: 'var(--muted, #6b7280)',
                      fontWeight: 600,
                      marginBottom: '2px',
                    }}
                  >
                    Réparateur
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                    {repairerName}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Itemized breakdown */}
          <div style={{ marginBottom: '16px' }}>
            <h3
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                color: 'var(--muted, #6b7280)',
                fontWeight: 600,
                margin: '0 0 10px 0',
                letterSpacing: '0.04em',
              }}
            >
              Détail du remboursement
            </h3>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '14px',
                color: 'var(--ink, #141414)',
              }}
            >
              <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Réparation remboursée :</span>
                <span style={{ fontWeight: 600 }}>{formatEuros(breakdown.repairCents)}</span>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Livraison remboursée :</span>
                <span style={{ fontWeight: 600 }}>{formatEuros(breakdown.shippingCents)}</span>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Frais de protection :</span>
                <span style={{ fontWeight: 600 }}>{formatEuros(breakdown.protectionCents)}</span>
              </li>
            </ul>
          </div>

          {/* Prominent total highlighted banner */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--badge-success-bg)',
              border: '1px solid var(--badge-success-border)',
              borderRadius: 'var(--r-field, 4px)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--badge-success-text)' }}>
              Total remboursé au client :
            </span>
            <strong style={{ fontSize: '18px', fontWeight: 700, color: 'var(--badge-success-text)' }}>
              {formatEuros(totalClientCents)}
            </strong>
          </div>

          {/* Warning notice */}
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--badge-danger-bg)',
              border: '1px solid var(--badge-danger-border)',
              borderRadius: 'var(--r-field, 4px)',
              fontSize: '13px',
              lineHeight: 1.5,
              color: 'var(--badge-danger-text)',
            }}
          >
            Attention : Ce montant sera immédiatement crédité sur la carte bancaire du client via Stripe. Cette opération est irréversible.
          </div>
        </div>

        {/* Footer / Action buttons */}
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
            type="button"
            onClick={onConfirm}
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
            {submitting ? 'Traitement…' : `Confirmer le remboursement de ${formatEuros(totalClientCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
