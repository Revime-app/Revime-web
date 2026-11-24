'use client';

import React, { useState } from 'react';
import { authErrorMessageFr } from '@revime/shared';
import { changePassword } from '../lib/auth-client';

export type PasswordValidationResult =
  | { ok: true; data: { currentPassword: string; newPassword: string } }
  | { ok: false; error: string };

export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): PasswordValidationResult {
  if (!currentPassword || currentPassword.trim().length === 0) {
    return { ok: false, error: 'Veuillez saisir votre mot de passe actuel.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Les mots de passe ne correspondent pas.' };
  }
  return {
    ok: true,
    data: {
      currentPassword,
      newPassword,
    },
  };
}

export function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);

    const validation = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { error: err } = await changePassword({
        currentPassword: validation.data.currentPassword,
        newPassword: validation.data.newPassword,
        revokeOtherSessions,
      });

      setBusy(false);

      if (err) {
        setError(authErrorMessageFr(err.code, 'Modification du mot de passe impossible.'));
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (caught: unknown) {
      setBusy(false);
      setError((caught as Error)?.message || 'Erreur lors du changement de mot de passe.');
    }
  }

  return (
    <section
      className="card settings__section"
      aria-labelledby="settings-password"
      data-testid="change-password-section"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '16px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <h2
        id="settings-password"
        className="settings__title"
        style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--ink, #141414)',
          marginBottom: '12px',
        }}
      >
        Mot de passe
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label
            htmlFor="settings-current-password"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Mot de passe actuel
          </label>
          <input
            id="settings-current-password"
            data-testid="current-password-input"
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setSaved(false);
            }}
            autoComplete="current-password"
            required
            disabled={busy}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line, #dfe2e2)',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div className="settings__row">
          <div>
            <label
              htmlFor="settings-new-password"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
            >
              Nouveau mot de passe
            </label>
            <input
              id="settings-new-password"
              data-testid="new-password-input"
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setSaved(false);
              }}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={busy}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
            <p className="settings__hint" style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Minimum 8 caractères.
            </p>
          </div>

          <div>
            <label
              htmlFor="settings-confirm-password"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
            >
              Confirmer le mot de passe
            </label>
            <input
              id="settings-confirm-password"
              data-testid="confirm-password-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setSaved(false);
              }}
              autoComplete="new-password"
              required
              disabled={busy}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <input
            id="settings-revoke-others"
            data-testid="revoke-other-sessions-checkbox"
            type="checkbox"
            checked={revokeOtherSessions}
            onChange={(e) => setRevokeOtherSessions(e.target.checked)}
            disabled={busy}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label
            htmlFor="settings-revoke-others"
            style={{ fontSize: '13px', color: 'var(--ink, #141414)', cursor: 'pointer' }}
          >
            Déconnecter les autres appareils
          </label>
        </div>

        {error && (
          <p
            role="alert"
            style={{
              color: 'var(--red, #f61b39)',
              fontSize: '13px',
              backgroundColor: 'var(--badge-danger-bg)',
              padding: '8px 12px',
              borderRadius: '8px',
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {saved && (
          <p
            role="status"
            className="settings__saved"
            style={{
              color: 'var(--green, #0e8345)',
              fontSize: '13px',
              backgroundColor: 'var(--badge-success-bg)',
              padding: '8px 12px',
              borderRadius: '8px',
              margin: 0,
              fontWeight: 500,
            }}
          >
            Mot de passe modifié avec succès.
          </p>
        )}

        <div>
          <button
            type="submit"
            data-testid="change-password-submit"
            disabled={busy}
            style={{
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Modification...' : 'Modifier le mot de passe'}
          </button>
        </div>
      </form>
    </section>
  );
}
