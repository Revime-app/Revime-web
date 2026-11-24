'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/client/auth';
import { DEMO, HOME_PATH } from '../../lib/client/config';

/** Only paths on this site, so a crafted `?suite=` cannot send someone elsewhere after sign-in. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : HOME_PATH;
}

function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('suite'));
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: { message?: string } | null }>, onOk: () => void) {
    setBusy(true);
    setError(null);
    try {
      if (DEMO) {
        onOk();
        return;
      }
      const res = await action();
      if (res.error) setError(res.error.message || 'Identifiants incorrects.');
      else onOk();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'password') {
      void run(
        () => authClient.signIn.email({ email: email.trim(), password }),
        () => router.replace(next),
      );
    } else if (!codeSent) {
      void run(
        () => authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' }),
        () => setCodeSent(true),
      );
    } else {
      void run(
        () => authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() }),
        () => router.replace(next),
      );
    }
  };

  return (
    <div className="esp-auth">
      <div className="esp-auth__art" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/repair-toolbox.webp" alt="" />
        <p>
          Comparez les offres de réparateurs vérifiés.
          <br />
          Payez seulement quand c’est réparé.
        </p>
      </div>
      <main id="contenu" className="esp-auth__panel">
        <Link href="/" aria-label="REVIME, accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
        </Link>
        <h1>Connexion</h1>
        <p className="esp-muted">Le même compte que dans l’appli REVIME.</p>

        <div className="esp-chips" role="tablist">
          <button
            role="tab"
            aria-selected={method === 'password'}
            className={method === 'password' ? 'esp-chip is-on' : 'esp-chip'}
            onClick={() => {
              setMethod('password');
              setError(null);
            }}
          >
            Mot de passe
          </button>
          <button
            role="tab"
            aria-selected={method === 'code'}
            className={method === 'code' ? 'esp-chip is-on' : 'esp-chip'}
            onClick={() => {
              setMethod('code');
              setError(null);
            }}
          >
            Code par e-mail
          </button>
        </div>

        <form className="esp-form" onSubmit={submit}>
          <label className="esp-field">
            <span className="esp-label">Adresse e-mail</span>
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
            <label className="esp-field">
              <span className="esp-label">Mot de passe</span>
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
            <label className="esp-field">
              <span className="esp-label">Code reçu par e-mail</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
              />
            </label>
          )}
          {error && <p className="esp-error">{error}</p>}
          <button className="esp-btn esp-btn--primary esp-btn--block" disabled={busy}>
            {busy
              ? 'Un instant…'
              : method === 'password'
                ? 'Se connecter'
                : codeSent
                  ? 'Valider le code'
                  : 'Recevoir un code'}
          </button>
        </form>

        <p className="esp-muted esp-small">
          Pas encore de compte ? La création de compte arrive sur le site très bientôt. En attendant, elle se fait
          dans l’appli REVIME.
        </p>
      </main>
    </div>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
