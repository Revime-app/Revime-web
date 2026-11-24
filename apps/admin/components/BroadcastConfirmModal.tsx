'use client';

import React, { useEffect } from 'react';
import { Bell, Mail, TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface BroadcastConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  totalRecipients: number;
  channels: { email: boolean; push: boolean };
  subject: string;
  body: string;
  targetSummary: string;
}

export function BroadcastConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  totalRecipients,
  channels,
  subject,
  body,
  targetSummary,
}: BroadcastConfirmModalProps) {
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
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '560px',
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <h2
            id="confirm-modal-title"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 6px 0',
              color: 'var(--ink, #141414)',
            }}
          >
            Confirmer l’envoi de la communication
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Vérifiez attentivement les paramètres de diffusion avant de déclencher l’envoi.
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--badge-warning-bg)',
              border: '1px solid var(--badge-warning-bg)',
              borderRadius: 'var(--r-field, 6px)',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--badge-warning-text)', marginBottom: '2px' }}>
              <Icon as={TriangleAlert} /> Action groupée irréversible
            </div>
            <div style={{ fontSize: '12px', color: 'var(--badge-warning-text)' }}>
              Une fois lancé, ce message sera transmis immédiatement via les passerelles d&apos;envoi (Resend et Expo Push).
            </div>
          </div>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr',
              gap: '12px 16px',
              fontSize: '13px',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Audience :</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: 'var(--ink, #141414)' }}>
              {targetSummary} ({totalRecipients} destinataire{totalRecipients > 1 ? 's' : ''})
            </dd>

            <dt style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Canaux :</dt>
            <dd style={{ margin: 0 }}>
              <span style={{ display: 'inline-flex', gap: '8px' }}>
                {channels.email && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--badge-info-bg)',
                      color: 'var(--navy-text, #25324f)',
                      border: '1px solid var(--badge-info-border)',
                    }}
                  >
                    <Icon as={Mail} /> E-mail
                  </span>
                )}
                {channels.push && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--badge-warning-bg)',
                      color: 'var(--badge-warning-text)',
                      border: '1px solid var(--badge-warning-border)',
                    }}
                  >
                    <Icon as={Bell} /> Push mobile
                  </span>
                )}
              </span>
            </dd>

            <dt style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Objet :</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: 'var(--ink, #141414)' }}>
              {subject}
            </dd>

            <dt style={{ color: 'var(--muted, #6b7280)', fontWeight: 500 }}>Extrait du corps :</dt>
            <dd
              style={{
                margin: 0,
                color: 'var(--ink, #141414)',
                backgroundColor: 'var(--badge-neutral-bg)',
                padding: '8px 10px',
                borderRadius: '4px',
                border: '1px solid var(--line)',
                whiteSpace: 'pre-wrap',
                maxHeight: '120px',
                overflowY: 'auto',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              {body}
            </dd>
          </dl>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: 'var(--badge-neutral-bg)',
          }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: 'var(--paper)',
              color: 'var(--ink, #141414)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r-field, 4px)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Envoi en cours…' : 'Confirmer et envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
