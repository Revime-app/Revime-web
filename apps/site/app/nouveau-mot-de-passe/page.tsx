'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authErrorMessageFr } from '@revime/shared';
import { authClient } from '../../lib/client/auth';
import { AuthShell } from '../../components/app/AuthShell';

function Reset() {
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(params.get('error') ? 'Ce lien n’est plus valable. Demandez-en un nouveau.' : null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Au moins 8 caractères.');
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    if (!token) return setError('Ce lien n’est plus valable. Demandez-en un nouveau.');
    setBusy(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (res.error) setError(authErrorMessageFr(res.error.code ?? '', 'Ce lien n’est plus valable. Demandez-en un nouveau.'));
    else setDone(true);
  }

  if (done) {
    return (
      <AuthShell title="Mot de passe changé">
        <div className="ap-published">
          <p>Vous pouvez vous connecter avec votre nouveau mot de passe, sur le site comme dans l’appli.</p>
          <Link href="/connexion" className="ap-btn ap-btn--primary">Se connecter</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Nouveau mot de passe">
      <form className="ap-form" onSubmit={submit}>
        <label className="ap-field">
          <span>Nouveau mot de passe</span>
          <small className="ap-field__hint">Au moins 8 caractères.</small>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="ap-field">
          <span>Confirmez</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="ap-error" role="alert">{error} {error.includes('lien') && <Link href="/mot-de-passe-oublie">Nouveau lien</Link>}</p>}
        <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy}>
          {busy ? 'Un instant…' : 'Enregistrer'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function NewPasswordPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
