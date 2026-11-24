import type { QueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { authClient } from './auth-client';
import { clearBadge, unregisterPush } from './push';

/**
 * `CF-47` extraction, 2026-08-30. The four-step sign-out handler shared between
 * `profil.tsx`'s fallback escape hatch and `parametres/index.tsx`'s normal path.
 *
 * 🛑 **THE FOUR-STEP ORDER IS LOAD-BEARING.** This function was written to fix a real
 * silent failure and a redirect ping-pong (see the comment history in `profil.tsx:120-151`
 * at `7ab0220`). Each step is guarded on purpose: a failure at any one must not strand
 * the user in the state they are trying to escape.
 *
 * 0. **Best-effort push unregister** (`CF-44`). Needs the cookie step 1 revokes, so it goes first.
 *    Swallowed inside `unregisterPush`: the token is unique alone, so the next account's
 *    registration on this phone reassigns it anyway (push spec §3.1).
 * 1. **Best-effort revoke.** A server that will not accept this cookie cannot revoke it,
 *    and that must not strand the user. Deliberately swallowed; the local wipe is what
 *    actually signs them out.
 * 2. **Unconditional local wipe.** Without this a surviving cookie signs the user straight
 *    back in on the next launch. Wipes both `revime_cookie` and `revime_session_data`
 *    (authClient's `storagePrefix` is 'revime').
 * 3. **Guarded query clear.** The QueryClient outlives the session, and keys like
 *    `['demandes','mine']` are not user-scoped, so without this the next account to sign in
 *    sees the previous account's data. Guarded because a throw here used to cost the
 *    navigation, and stale cache is a far smaller problem than a stuck screen.
 * 4. **Navigate to login.** Must be `/(auth)/login` specifically - a screen that reads NO
 *    session state and therefore cannot bounce. `(tabs)/_layout.tsx` points here too for
 *    the same reason.
 *
 * **Why a navigation callback rather than a router:** `useRouter()` from `expo-router` returns
 * an object whose type is internal to the package and awkward to extract. Taking a callback
 * makes the function testable (though apps/mobile has no test runner as of 2026-08-30) and
 * keeps it independent of any one screen's imports.
 *
 * **This does NOT exist to be tested - apps/mobile has no test harness.** It was extracted to
 * prevent a future fix from landing in one of the two duplicates and missing the other. The
 * extraction makes it testABLE, which is not the same as tested. Do not claim otherwise in a
 * comment.
 */
export async function signOutAndLeave(deps: {
  queryClient: QueryClient;
  router: { canDismiss(): boolean; dismissAll(): void; replace(href: string): void };
}): Promise<void> {
  const { queryClient, router } = deps;

  // 0. Push token off this account, while the cookie still exists. Best-effort by contract,
  //    and BOUNDED: `unregisterPush` swallows errors but an `await` still waits on latency, and
  //    `api.ts` sets no timeout - so a dead-but-connected network would otherwise hold the user
  //    here for the platform's socket timeout. Three seconds, then sign-out proceeds regardless.
  //    Also clear the app icon badge (CF4-35).
  void clearBadge();
  await Promise.race([unregisterPush(), new Promise<void>((r) => setTimeout(r, 3000))]);

  // 1. Best-effort revoke. A server that will not accept this cookie cannot revoke it, and
  //    that must not strand the user in the state they are trying to escape.
  try {
    await authClient.signOut();
  } catch {
    // Deliberately swallowed; the local wipe below is what actually signs the user out.
  }

  // 2. Unconditional local wipe. `storagePrefix` is 'revime' (see auth-client.ts), so these
  //    are its keys. This is what makes sign-out real even when step 1 failed: without it a
  //    surviving cookie signs the user straight back in on the next launch.
  await Promise.all(
    ['revime_cookie', 'revime_session_data'].map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => undefined),
    ),
  );

  // 3. Wipe every cached query. The QueryClient outlives the session, and keys like
  //    ['demandes','mine'] are not user-scoped, so without this the next account to sign in
  //    on this device sees the previous account's data. Guarded because a throw here used to
  //    cost the navigation, and stale cache is a far smaller problem than a stuck screen.
  try {
    queryClient.clear();
  } catch {
    // Nothing to do; the next sign-in refetches anyway.
  }

  // 4. Clear the entire navigation stack so (tabs) does not remain mounted underneath,
  //    then land on a screen that reads NO session state and therefore cannot bounce.
  //    CF5-20: plain `replace` left (tabs) alive in the flat root Stack; its session guard
  //    re-fired on iOS Keychain modal dismiss and pushed a duplicate empty login screen.
  if (router.canDismiss()) router.dismissAll();
  router.replace('/(auth)/login');
}
