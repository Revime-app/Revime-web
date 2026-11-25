'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { MeResponse } from '@revime/shared';
import { api, ApiError } from './api';
import { authClient } from './auth';
import { DEMO, demoSignedIn, setDemoSignedIn } from './config';

type Status = 'loading' | 'in' | 'out';
type SessionValue = {
  me: MeResponse | null;
  status: Status;
  /** Reads `/users/me` again, after a sign-in. */
  refresh: () => Promise<MeResponse | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  me: null,
  status: 'loading',
  refresh: async () => null,
  signOut: async () => {},
});

export const useSession = () => useContext(SessionContext);

/**
 * The visitor may or may not be signed in: the site shows demandes, réparateurs and the publish
 * form to everyone, and asks for an account only for what is personal. `/users/me` answering 401
 * simply means « signed out ».
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    if (DEMO && !demoSignedIn()) {
      setMe(null);
      setStatus('out');
      return null;
    }
    try {
      const next = await api.get<MeResponse>('/users/me');
      setMe(next);
      setStatus('in');
      return next;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      setMe(null);
      setStatus('out');
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (DEMO) setDemoSignedIn(false);
    else await authClient.signOut();
    setMe(null);
    setStatus('out');
  }, []);

  return <SessionContext.Provider value={{ me, status, refresh, signOut }}>{children}</SessionContext.Provider>;
}

/** For the personal pages: a signed-out visitor goes to sign-in, then comes back here. */
export function useRequireSession(): MeResponse | null {
  const { me, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'out') router.replace(`/connexion?suite=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
  return me;
}
