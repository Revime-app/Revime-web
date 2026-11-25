'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '../../lib/client/auth';
import { DEMO, setDemoSignedIn } from '../../lib/client/config';
import { useSession } from '../../lib/client/session';

/**
 * Sign-in with the app's account: password, or a code sent by e-mail. Used by /connexion and by
 * the sheet that opens when a visitor publishes. `onDone` runs once the session is readable.
 */
export function LoginForm({ onDone }: { onDone: () => void }) {
  const { refresh } = useSession();
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: { message?: string } | null }>, after: 'session' | 'code') {
    setBusy(true);
    setError(null);
    try {
      if (DEMO) {
        if (after === 'session') setDemoSignedIn(true);
      } else {
        const res = await action();
        if (res.error) {
          setError(res.error.message || 'Adresse ou mot de passe incorrect.');
          return;
        }
      }
      if (after === 'code') {
        setCodeSent(true);
        return;
      }
      const me = await refresh();
      if (me) onDone();
      else setError('Connexion refusée. Réessayez dans un instant.');
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (method === 'password') void run(() => authClient.signIn.email({ email: address, password }), 'session');
    else if (!codeSent) void run(() => authClient.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' }), 'code');
    else void run(() => authClient.signIn.emailOtp({ email: address, otp: code.trim() }), 'session');
  };

  const pick = (m: 'password' | 'code') => {
    setMethod(m);
    setError(null);
    setCodeSent(false);
  };

  return (
    <form className="ap-form" onSubmit={submit}>
      <div className="ap-seg" role="tablist" aria-label="Façon de se connecter">
        <button type="button" role="tab" aria-selected={method === 'password'} onClick={() => pick('password')}>
          Mot de passe
        </button>
        <button type="button" role="tab" aria-selected={method === 'code'} onClick={() => pick('code')}>
          Code par e-mail
        </button>
      </div>
      <label className="ap-field">
        <span>Adresse e-mail</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={codeSent}
        />
      </label>
      {method === 'password' && (
        <label className="ap-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {method === 'code' && codeSent && (
        <label className="ap-field">
          <span>Code reçu à {email.trim()}</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      )}
      {error && (
        <p className="ap-error" role="alert">
          {error}
        </p>
      )}
      <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy}>
        {busy
          ? 'Un instant…'
          : method === 'password'
            ? 'Se connecter'
            : codeSent
              ? 'Valider le code'
              : 'Recevoir un code'}
      </button>
      <p className="ap-hint">
        <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
      <p className="ap-hint">
        Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
      </p>
    </form>
  );
}
