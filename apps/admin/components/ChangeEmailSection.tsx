'use client';

import React, { useState } from 'react';
import { authErrorMessageFr } from '@revime/shared';
import { changeEmail } from '../lib/auth-client';

export type EmailValidationResult =
  | { ok: true; data: { newEmail: string; password: string } }
  | { ok: false; error: string };

/**
 * V7 A11 (U2b, Q6). The current password is asked, and now it IS checked: `POST /security/step-up`
 * verifies it and stamps this session, and the API refuses `/change-email` without that stamp from
 * the last 10 minutes (`auth.ts`). Before U2b nothing verified a password here, which is why the
 * field used to be absent. The new address must still be confirmed through the link sent to it.
 */
export function validateEmailChange(newEmail: string, password: string): EmailValidationResult {
  const trimmed = newEmail.trim();
  if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
    return { ok: false, error: 'Veuillez saisir une adresse e-mail valide.' };
  }
  if (!password) return { ok: false, error: 'Saisissez votre mot de passe actuel.' };
  return { ok: true, data: { newEmail: trimmed, password } };
}

/** The password first, then Better Auth's change. Exported so the order can be tested without a DOM. */
export async function submitEmailChange(
  input: { newEmail: string; password: string },
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetcher('/api/proxy/security/step-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: input.password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: body?.error?.message ?? 'Mot de passe non confirmé. Réessayez.' };
  }
  const { error: err } = await changeEmail({ newEmail: input.newEmail });
  if (err) return { ok: false, error: authErrorMessageFr(err.code, 'Changement d’e-mail impossible.') };
  return { ok: true };
}

export function ChangeEmailSection() {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);

    const validation = validateEmailChange(newEmail, password);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await submitEmailChange(validation.data);

      setBusy(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNewEmail('');
      setPassword('');
      setSaved(true);
    } catch (caught: unknown) {
      setBusy(false);
      setError((caught as Error)?.message || 'Erreur lors de la mise à jour de l’adresse e-mail.');
    }
  }

  return (
    <section
      className="card settings__section"
      aria-labelledby="settings-email"
      data-testid="change-email-section"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '16px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <h2
        id="settings-email"
        className="settings__title"
        style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--ink, #141414)',
          marginBottom: '12px',
        }}
      >
        Adresse e-mail
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label
            htmlFor="settings-new-email"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Nouvelle adresse e-mail
          </label>
          <input
            id="settings-new-email"
            data-testid="new-email-input"
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setSaved(false);
            }}
            autoComplete="email"
            required
            disabled={busy}
            placeholder="nouvel.email@revime.fr"
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

        <div>
          <label
            htmlFor="settings-email-password"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Mot de passe actuel
          </label>
          <input
            id="settings-email-password"
            data-testid="email-current-password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            Un lien de confirmation a été envoyé à la nouvelle adresse. L’adresse actuelle reste valable tant qu’il n’est pas ouvert.
          </p>
        )}

        <div>
          <button
            type="submit"
            data-testid="change-email-submit"
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
            {busy ? 'Modification...' : 'Changer l\'adresse e-mail'}
          </button>
        </div>
      </form>
    </section>
  );
}
