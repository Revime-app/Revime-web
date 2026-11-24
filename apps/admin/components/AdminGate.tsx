'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { AdminMe } from '@revime/shared';
import { signOut, useSession } from '../lib/auth-client';
import { gateRoute, SECURITE_PATH } from '../lib/two-factor';
import { GateLoading } from './GateLoading';

/**
 * FOUR states, not three.
 *
 * 🛑 `unreachable` is the addition. Until now any failure to reach the API rendered
 * « Votre compte ne dispose pas des autorisations nécessaires » - telling a legitimate
 * admin he is not one, which after an idle period is the LIKELIEST first screen, because
 * the API's cold start has measured 22 s to 5 m 56 s.
 */
export type GateState = 'checking' | 'allowed' | 'denied' | 'unreachable';

const GateContext = createContext<GateState>('checking');
export const useAdminGate = (): GateState => useContext(GateContext);

/** CF4-40 / CF4-41. The operator's role, permissions and session proof, from `GET admin/me`. */
const MeContext = createContext<AdminMe | null>(null);
export const useAdminMe = (): AdminMe | null => useContext(MeContext);

/**
 * ONE gate for the whole dashboard, mounted in the layout.
 *
 * It replaces a per-page useEffect that would have called /admin/ping once per page per
 * client-side navigation across ~11 eventual pages.
 *
 * CF4-N: it probes `admin/me`, the one admin route a staff session reaches before its second
 * factor. An unverified session is sent to « Paramètres » (SECURITE_PATH, gateRoute); the API refuses it every
 * other admin route regardless.
 *
 * 🛑 KEEP `r.ok` - do NOT change this to `status === 403`. Unauthenticated is **401**
 * here, because a global guard from BetterAuthModule.forRoot() runs before
 * AdminRoleGuard. A 403-only check would send a signed-out operator to the dashboard.
 * The distinction that matters is refused-by-the-API versus never-reached-the-API, which
 * is why the transport failure is a separate state rather than a different status code.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [gate, setGate] = useState<GateState>('checking');
  const [me, setMe] = useState<AdminMe | null>(null);

  useEffect(() => {
    if (pathname === '/invitation') return;
    if (pathname === '/login') {
      // Bug B17: An already authenticated operator visiting /login is redirected to the dashboard
      if (!isPending && session) {
        router.replace('/');
      }
      return;
    }
    if (isPending) return;

    if (!session) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    fetch('/api/proxy/admin/me')
      .then(async (r) => {
        if (cancelled) return;
        const body = r.ok ? ((await r.json()) as AdminMe) : null;
        if (cancelled) return;
        setMe(body);
        const route = gateRoute(body, pathname);
        if (route === 'securite') {
          router.replace(SECURITE_PATH);
          return;
        }
        setGate(route === 'allow' ? 'allowed' : 'denied');
      })
      .catch(() => {
        // A network failure is NOT a refusal. This is the whole reason for the state.
        if (!cancelled) setGate('unreachable');
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, isPending, session, router]);

  // The login and invitation screens have no gate: they are reachable by a signed-out visitor.
  // Without this early return, the gate would redirect to /login when there is no
  // session, and /login and /invitation live inside this layout, so the dashboard becomes
  // unreachable with no way back in.
  if (pathname === '/login' || pathname === '/invitation') return <>{children}</>;

  if (isPending || gate === 'checking') {
    // Sign-out is offered here too, but the stylesheet only reveals it after a delay (ISS-133): on a
    // cold instance an operator can sit on this screen for minutes, and piece A shipped this state
    // as a dead end.
    return <GateLoading onSignOut={() => signOut()} />;
  }

  if (gate === 'unreachable') {
    return (
      <div className="page">
        <h1>Service momentanément indisponible.</h1>
        <p>
          Le serveur n&apos;a pas répondu. Il peut être en cours de démarrage, ce qui prend parfois
          plusieurs minutes. Rechargez la page dans un instant.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    );
  }

  if (gate === 'denied') {
    return (
      <div className="page">
        <h1>Accès réservé à l&apos;équipe Revime.</h1>
        <p>Votre compte ne dispose pas des autorisations nécessaires.</p>
        <button type="button" onClick={() => signOut()}>
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <GateContext.Provider value={gate}>
      <MeContext.Provider value={me}>{children}</MeContext.Provider>
    </GateContext.Provider>
  );
}
