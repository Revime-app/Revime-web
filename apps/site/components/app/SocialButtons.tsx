'use client';

import { useState } from 'react';
import { authClient } from '../../lib/client/auth';

/**
 * « Continuer avec Google / Apple ». The app signs in natively with an id token; the web needs the
 * redirect flow, which the API only serves once its provider is set up for the site's address
 * (Google: the redirect URI in the Google Cloud console; Apple: a Services ID and its secret, which
 * the API does not configure today). So each button shows only when its flag is set at build time,
 * never a button that would fail.
 */
const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === '1';
const APPLE = process.env.NEXT_PUBLIC_APPLE_SIGNIN === '1';

export function SocialButtons({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  if (!GOOGLE && !APPLE) return null;

  async function go(provider: 'google' | 'apple') {
    setError(null);
    const res = await authClient.signIn.social({ provider, callbackURL: next, newUserCallbackURL: '/verification' });
    if (res?.error) setError('Ce mode de connexion n’est pas disponible pour le moment.');
  }

  return (
    <div className="ap-social">
      {GOOGLE && (
        <button type="button" className="ap-btn ap-btn--secondary ap-btn--block" onClick={() => void go('google')}>
          Continuer avec Google
        </button>
      )}
      {APPLE && (
        <button type="button" className="ap-btn ap-btn--dark ap-btn--block" onClick={() => void go('apple')}>
          Continuer avec Apple
        </button>
      )}
      {error && <p className="ap-error" role="alert">{error}</p>}
      <p className="ap-social__or">ou avec votre e-mail</p>
    </div>
  );
}
