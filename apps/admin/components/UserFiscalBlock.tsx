'use client';

import React, { useState } from 'react';
import type { AdminUserFiscalData } from '@revime/shared';
import { FiscalAuditDrawer } from './FiscalAuditDrawer';

export interface UserFiscalBlockProps {
  userId: string;
  userName: string;
  fiscal: AdminUserFiscalData;
  /** Called after a reminder went out, so the page reloads the count and the history. */
  onRefresh: () => void;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <strong style={{ color: 'var(--navy-text, #25324f)' }}>{label} : </strong>
      {children}
    </div>
  );
}

function MissingBadge({ text = 'Manquant' }: { text?: string }) {
  return (
    <span
      data-testid="badge-missing"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: 'var(--badge-danger-bg)',
        color: 'var(--badge-danger-text)',
        border: '1px solid var(--badge-danger-border)',
      }}
    >
      {text}
    </span>
  );
}

export function UserFiscalBlock({ userId, userName, fiscal, onRefresh }: UserFiscalBlockProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRemind = async () => {
    if (fiscal.isComplete || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const r = await fetch(`/api/proxy/admin/users/${userId}/fiscal/remind`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const data = await r.json();

      if (!r.ok) {
        setError(data.error?.message || 'Erreur lors de la relance.');
        return;
      }

      setSuccess('Relance envoyée avec succès.');
      onRefresh();
    } catch {
      setError('Impossible de joindre le serveur.');
    } finally {
      setBusy(false);
    }
  };

  const birthPlace = [fiscal.birthCity, fiscal.birthCountry].filter(Boolean).join(', ');

  return (
    <>
      <div
        className="card"
        data-testid="user-fiscal-block"
        style={{ marginBottom: '1.5rem' }}
      >
        {/* Header with Title and Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--navy-text, #25324f)' }}>
            Informations fiscales
          </h2>
          <span
            data-testid="fiscal-status-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor: fiscal.isComplete ? 'var(--badge-success-bg)' : 'var(--badge-danger-bg)',
              color: fiscal.isComplete ? 'var(--badge-success-text)' : 'var(--badge-danger-text)',
              border: `1px solid ${fiscal.isComplete ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: fiscal.isComplete ? 'var(--badge-success-text)' : 'var(--badge-danger-text)',
              }}
            />
            {fiscal.isComplete ? 'Complet' : 'Incomplet'}
          </span>
        </div>

        {/* Fiscal Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
          <FieldRow label="Nom, prénom">
            {fiscal.legalName ?? <MissingBadge />}
          </FieldRow>

          <FieldRow label="Date de naissance">
            {fiscal.birthDate ?? <MissingBadge />}
          </FieldRow>

          <FieldRow label="Adresse">
            {fiscal.address ?? <MissingBadge />}
          </FieldRow>

          <FieldRow label="Numéro fiscal (NIF)">
            {fiscal.nif ? (
              fiscal.nif
            ) : fiscal.hasNoNif ? (
              <span style={{ color: 'var(--badge-danger-text)', fontWeight: 500 }}>
                Non renseigné (case « pas de NIF »)
              </span>
            ) : (
              <MissingBadge />
            )}
          </FieldRow>

          <FieldRow label="Lieu de naissance">
            {birthPlace || (fiscal.hasNoNif ? <MissingBadge /> : '—')}
          </FieldRow>

          <FieldRow label="SIRET / TVA">
            {fiscal.siret || fiscal.vatNumber
              ? `${fiscal.siret || '—'} / ${fiscal.vatNumber || '—'}`
              : '— (particulier)'}
          </FieldRow>

          <FieldRow label="IBAN (Stripe Connect)">
            {fiscal.maskedIban ?? 'Non renseigné'}
          </FieldRow>
        </div>

        <p
          data-testid="fiscal-declared-note"
          style={{ fontSize: '12px', color: 'var(--muted, #64748b)', margin: '12px 0 0' }}
        >
          Nom et date de naissance déclarés par le réparateur : ils ne sont pas comparés à Stripe Identity.
        </p>

        {/* Feedback messages */}
        {error && (
          <p
            role="alert"
            data-testid="fiscal-remind-error"
            style={{ color: 'var(--badge-danger-text)', marginTop: '1rem', marginBottom: 0, fontSize: '13px' }}
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            data-testid="fiscal-remind-success"
            style={{ color: 'var(--badge-success-text)', marginTop: '1rem', marginBottom: 0, fontSize: '13px' }}
          >
            {success}
          </p>
        )}

        {/* Action Buttons */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--line, #dfe2e2)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            {/* Primary Action Button: ZERO BLACK BUTTONS RULE - strictly Navy var(--navy) */}
            <button
              type="button"
              data-testid="fiscal-remind-btn"
              onClick={handleRemind}
              disabled={fiscal.isComplete || busy}
              style={{
                backgroundColor: 'var(--navy, #25324F)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '9px 16px',
                fontWeight: 500,
                fontSize: '14px',
                cursor: fiscal.isComplete || busy ? 'not-allowed' : 'pointer',
                opacity: fiscal.isComplete || busy ? 0.6 : 1,
                transition: 'background-color 0.15s ease',
              }}
            >
              {busy ? 'Envoi en cours...' : 'Relancer pour infos fiscales'}
            </button>

            {/* Secondary Action Button: Paper with border */}
            <button
              type="button"
              data-testid="fiscal-history-btn"
              onClick={() => setDrawerOpen(true)}
              style={{
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--navy-text, #25324F)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '6px',
                padding: '9px 16px',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Historique des modifications
            </button>
          </div>

          {/* Subtitle with reminder count and date */}
          <p
            data-testid="fiscal-reminder-count-label"
            style={{
              fontSize: '12px',
              color: 'var(--muted, #64748b)',
              margin: '8px 0 0',
            }}
          >
            {fiscal.reminderCount > 0
              ? `Relances envoyées : ${fiscal.reminderCount}${fiscal.lastReminderAt ? ` (${new Date(fiscal.lastReminderAt).toLocaleDateString('fr-FR')})` : ''}`
              : 'Aucune relance envoyée'}
            {fiscal.isComplete && ' · Dossier fiscal complet'}
          </p>
        </div>
      </div>

      {/* Slide-over Audit Drawer */}
      <FiscalAuditDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        auditLogs={fiscal.auditLogs}
        userName={userName}
      />
    </>
  );
}
