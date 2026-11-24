import { authErrorMessageFr } from '@revime/shared';

/**
 * V7 A11 / D3 (U2, Q8). The dashboard's sign-in and two-factor error text. A lock answers
 * `TOO_MANY_REQUESTS` with its end as `lockedUntil` in the error body; the dashboard deploys with
 * the API, so it can show that time, while an installed app build keeps the shared duration-free
 * sentence. Every other code goes through the shared mapping, as before.
 */
export function signInErrorMessageFr(
  err: { code?: string | null; lockedUntil?: unknown } | null | undefined,
  fallback: string,
): string {
  if (err?.code === 'TOO_MANY_REQUESTS' && typeof err.lockedUntil === 'string') {
    const until = new Date(err.lockedUntil);
    if (!Number.isNaN(until.getTime())) {
      const time = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      }).format(until);
      return `Trop de tentatives. Compte bloqué jusqu’à ${time}. Réessayez plus tard.`;
    }
  }
  return authErrorMessageFr(err?.code, fallback);
}
