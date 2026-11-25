'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '../../lib/client/auth';
import { AuthShell } from '../../components/app/AuthShell';

/** As in the app: the same answer whether or not the address has an account. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
      });
    } catch {
      /* never revealed, like the app */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <AuthShell title="Mot de passe oublié" lede="Recevez un lien par e-mail pour en choisir un nouveau.">
      {sent ? (
        <div className="ap-published">
          <p>Si un compte existe pour {email.trim()}, un e-mail vient de partir avec un lien valable 1 heure. Pensez à regarder dans les indésirables.</p>
          <Link href="/connexion" className="ap-btn ap-btn--secondary">Retour à la connexion</Link>
        </div>
      ) : (
        <form className="ap-form" onSubmit={submit}>
          <label className="ap-field">
            <span>Adresse e-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy}>
            {busy ? 'Envoi…' : 'Recevoir le lien'}
          </button>
          <p className="ap-hint">
            <Link href="/connexion">Retour à la connexion</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
