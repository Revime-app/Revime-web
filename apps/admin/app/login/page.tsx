'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signInErrorMessageFr } from '../../lib/login-lock-message';
import { signIn, useSession } from '../../lib/auth-client';
import { TwoFactorStep } from './TwoFactorStep';

export type LoginViewState = 'loading' | 'redirecting' | 'two-factor' | 'form';

/**
 * Pure helper for the login screen view state (Bug B17).
 * Prevents showing the login form when already authenticated or while session is resolving.
 */
export function getLoginViewState(
  session: unknown,
  isPending: boolean,
  needsCode: boolean,
): LoginViewState {
  if (isPending) return 'loading';
  if (session) return 'redirecting';
  if (needsCode) return 'two-factor';
  return 'form';
}

/**
 * Evaluates session resolution and triggers replacement to dashboard if authenticated (Bug B17).
 * Exported pure helper allowing deterministic unit testing without full DOM environment.
 */
export function redirectIfAuthenticated(
  session: unknown,
  isPending: boolean,
  router: { replace: (url: string) => void },
): boolean {
  if (!isPending && Boolean(session)) {
    router.replace('/');
    return true;
  }
  return false;
}

/** Compact bicolour logo (CG-7). The tile class gives it a white ground in the dark theme. */
function LoginLogo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <span className="login-logo">
        <Image
          src="/brand/revime-logo-login.png"
          alt="REVIME"
          width={160}
          height={119}
          priority
          style={{ height: 'auto', maxWidth: 180, display: 'block' }}
        />
      </span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [needsCode, setNeedsCode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Bug B17: Redirect already authenticated operators directly to the dashboard
  useEffect(() => {
    redirectIfAuthenticated(session, isPending, router);
  }, [session, isPending, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: err } = await signIn.email({ email, password });
    setBusy(false);

    if (err) {
      // Translate the code, never the message. `err.message` is Better Auth's
      // English string and is always populated, so the French fallback below it
      // could never fire and the screen showed "Invalid email or password".
      // V7 U2: a lock carries its end time, which signInErrorMessageFr shows.
      setError(signInErrorMessageFr(err, 'Connexion impossible.'));
      return;
    }

    // CF4-41: an account with 2FA gets no session yet, only the challenge.
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setNeedsCode(true);
      return;
    }

    router.replace('/');
  }

  const viewState = getLoginViewState(session, isPending, needsCode);

  if (viewState === 'loading') {
    return (
      <div className="page" data-testid="login-loading" role="status" aria-live="polite">
        <p>Chargement...</p>
      </div>
    );
  }

  if (viewState === 'redirecting') {
    return (
      <div className="page" data-testid="login-redirecting" role="status" aria-live="polite">
        <p>Redirection vers le tableau de bord...</p>
      </div>
    );
  }

  if (viewState === 'two-factor') {
    return (
      <div className="page">
        <LoginLogo />
        <h1>Tableau de bord Revime</h1>
        <TwoFactorStep />
      </div>
    );
  }

  return (
    <div className="page">
      <LoginLogo />
      <h1>Tableau de bord Revime</h1>
      <p>Accès réservé à l&apos;équipe Revime.</p>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
