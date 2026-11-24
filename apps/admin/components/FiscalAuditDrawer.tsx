'use client';

import React, { useEffect } from 'react';
import type { AdminUserFiscalAuditEntry } from '@revime/shared';

export interface FiscalAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  auditLogs: AdminUserFiscalAuditEntry[];
  userName: string;
}

function formatFieldLabel(fieldName: string): string {
  switch (fieldName) {
    case 'reminder':
      return 'Relance fiscale envoyée';
    case 'nif':
      return 'Numéro fiscal (NIF)';
    case 'hasNoNif':
      return "Déclaration sur l'honneur (pas de NIF)";
    case 'birthCity':
      return 'Ville de naissance';
    case 'birthCountry':
      return 'Pays de naissance';
    case 'addressLine':
      return 'Adresse postale';
    case 'postalCode':
      return 'Code postal';
    case 'city':
      return 'Ville';
    case 'taxResidence':
      return 'Résidence fiscale';
    case 'birthDate':
      return 'Date de naissance';
    case 'country':
      return 'Pays';
    case 'declaration':
      return 'Déclaration fiscale';
    default:
      return fieldName;
  }
}

/** `relance_1`, `relance_2_freeze_warning` (the last reminder), `relance_3`: what `FiscalService` records. */
function formatReminder(value: string): string {
  const match = /^relance_(\d+)(_freeze_warning)?$/.exec(value);
  if (!match) return value;
  return `Relance n°${match[1]}${match[2] ? ' (dernier rappel)' : ''}`;
}

function formatValueChange(fieldName: string, oldValue: string | null, newValue: string | null): string {
  if (fieldName === 'declaration' && newValue === 'initial_submission') {
    return 'Soumission initiale de la déclaration';
  }
  if (fieldName === 'reminder') {
    const from = oldValue ? formatReminder(oldValue) : 'Initiale';
    const to = newValue ? formatReminder(newValue) : 'Relance';
    return `${from} → ${to}`;
  }
  if (fieldName === 'hasNoNif') {
    const from = oldValue === 'true' ? 'Oui (sans NIF)' : oldValue === 'false' ? 'Non (avec NIF)' : oldValue ?? '—';
    const to = newValue === 'true' ? 'Oui (sans NIF)' : newValue === 'false' ? 'Non (avec NIF)' : newValue ?? '—';
    return `${from} → ${to}`;
  }
  return `${oldValue || '—'} → ${newValue || '—'}`;
}

export function FiscalAuditDrawer({
  isOpen,
  onClose,
  auditLogs,
  userName,
}: FiscalAuditDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        data-testid="fiscal-audit-drawer-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 1100,
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiscal-audit-drawer-title"
        data-testid="fiscal-audit-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '560px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 1101,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--line, #dfe2e2)',
          overflowY: 'auto',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--badge-neutral-bg)',
          }}
        >
          <div>
            <h2
              id="fiscal-audit-drawer-title"
              data-testid="fiscal-audit-drawer-title"
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                margin: 0,
              }}
            >
              Historique des modifications fiscales
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--muted, #64748b)',
                margin: '4px 0 0',
              }}
            >
              {userName ? `Modifications pour ${userName}` : "Journal d'audit des données fiscales"}
            </p>
          </div>
          <button
            type="button"
            data-testid="fiscal-audit-drawer-close-btn"
            onClick={onClose}
            aria-label="Fermer l'historique"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--muted, #64748b)',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '24px', flex: 1 }}>
          {auditLogs.length === 0 ? (
            <div
              data-testid="fiscal-audit-empty"
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--muted, #64748b)',
                fontSize: '14px',
                border: '1px dashed var(--line, #dfe2e2)',
                borderRadius: '8px',
              }}
            >
              Aucune modification enregistrée dans l'historique.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {auditLogs.map((log) => {
                const dateStr = new Date(log.changedAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isReminder = log.fieldName === 'reminder';

                return (
                  <div
                    key={log.id}
                    data-testid="fiscal-audit-log-item"
                    style={{
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: isReminder ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '14px',
                          color: 'var(--navy-text, #25324f)',
                        }}
                      >
                        {formatFieldLabel(log.fieldName)}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted, #64748b)',
                        }}
                      >
                        {dateStr}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--ink2)',
                      }}
                    >
                      {formatValueChange(log.fieldName, log.oldValue, log.newValue)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
