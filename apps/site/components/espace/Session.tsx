'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { MeResponse } from '@revime/shared';
import { api, ApiError } from '../../lib/client/api';
import { authClient } from '../../lib/client/auth';
import { DEMO } from '../../lib/client/config';
import { Loader } from './ui';

type SessionValue = { me: MeResponse; signOut: () => Promise<void> };

const SessionContext = createContext<SessionValue | null>(null);

export function useMe(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useMe outside <RequireSession>');
  return value;
}

/**
 * The signed-in area's gate. It reads `/users/me` once; a 401 sends the visitor to /connexion with
 * the page he wanted, so he comes back to it after signing in.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MeResponse>('/users/me')
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace(`/connexion?suite=${encodeURIComponent(pathname)}`);
          return;
        }
        setFailed(e instanceof ApiError ? e.message : 'Connexion au service impossible pour le moment.');
      });
  }, [pathname, router]);

  if (failed) {
    return (
      <div className="esp-center">
        <p className="esp-error">{failed}</p>
        <button className="esp-btn esp-btn--secondary" onClick={() => location.reload()}>
          Réessayer
        </button>
      </div>
    );
  }
  if (!me) return <Loader full />;

  const signOut = async () => {
    if (!DEMO) await authClient.signOut();
    router.replace('/connexion');
  };

  return <SessionContext.Provider value={{ me, signOut }}>{children}</SessionContext.Provider>;
}
