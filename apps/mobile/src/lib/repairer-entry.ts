import type { useRouter } from 'expo-router';
import { enterSignedInApp } from '@revime/shared';

/**
 * CF4-09. Where a freshly-onboarded account lands: the tabs first, then, for a
 * réparateur, straight into the verification journey.
 *
 * Through `enterSignedInApp` (CF4-47) so the whole auth stack is gone, not just its
 * top screen, before the second push - « Retour » from `/statut-verification` must
 * land on the tabs, and a swipe back from the tabs must not reach a signup or
 * verification screen that no longer applies.
 *
 * Takes a boolean, not `me`: `useSessionContext().refresh()` returns
 * `Promise<void>` and does not hand back the refreshed profile, so a caller
 * that needs the just-fetched `repairerEnabled` reads it from its own `me`
 * after awaiting `refresh()` and passes the boolean it already knows.
 */
export function routeAfterOnboarding(
  router: ReturnType<typeof useRouter>,
  isRepairer: boolean,
): void {
  enterSignedInApp(router, '/(tabs)', isRepairer ? '/statut-verification' : undefined);
}
