'use client';

import { useState } from 'react';
import { signInErrorMessageFr } from '../../lib/login-lock-message';
import { twoFactor } from '../../lib/auth-client';
import { parseBackupCode, parseTotpCode } from '../../lib/two-factor';

/**
 * CF4-41. The second step of the password sign-in: the authenticator code, or a backup code.
 * Success creates the session that carries the second-factor proof, then a full navigation
 * lets the gate re-read `admin/me`.
 */
export function TwoFactorStep() {
  const [useBackup, setUseBackup] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = useBackup ? parseBackupCode(value) : parseTotpCode(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = useBackup
      ? await twoFactor.verifyBackupCode({ code: parsed.code })
      : await twoFactor.verifyTotp({ code: parsed.code });
    setBusy(false);
    if (err) {
      // V7 D3: three wrong codes lock a staff account, and the answer carries the lock's end.
      setError(signInErrorMessageFr(err, 'Code incorrect.'));
      return;
    }
    window.location.assign('/');
  }

  const inputId = useBackup ? 'backup-code' : 'totp-code';
  return (
    <form onSubmit={onSubmit}>
      <h2>Double authentification</h2>
      <div>
        <label htmlFor={inputId}>
          {useBackup ? 'Code de secours' : 'Code de votre application d\'authentification'}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode={useBackup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          required
          autoFocus
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Vérification...' : 'Valider'}
      </button>
      <button
        type="button"
        onClick={() => {
          setUseBackup(!useBackup);
          setValue('');
          setError(null);
        }}
      >
        {useBackup ? 'Utiliser mon application' : 'Utiliser un code de secours'}
      </button>
    </form>
  );
}
