import * as WebBrowser from 'expo-web-browser';
import type { useRouter } from 'expo-router';

/**
 * The one Stripe web hand-off. Extracted from THREE verbatim copies -
 * `profil.tsx`'s `handleStartIdentity` and `handleConfigureVirements`, and
 * `identite/retour.tsx`'s `handleRetry` - which `CF-10`'s gate sheet and `CF-55`'s
 * « Commencer » would have made five.
 *
 * 🛑 Deliberately NOT a hook that owns the mutation. The call sites POST different
 * endpoints (`/identity/session`, `/connect/onboarding`) and set differently-worded
 * French errors, so a shared hook would have to own both. Only the identical half is
 * here; each caller keeps its own mutation and its own error state.
 *
 * `'revime://'` is the app's scheme, and the returned URL is mapped back onto a router
 * path so Stripe's redirect lands on `/identite/retour` or `/connect/retour`.
 *
 * The scheme is stripped as `revime:` plus ANY number of slashes, not a literal
 * `'revime://'`: Android can hand back `revime:///connect/retour`, and removing only two
 * slashes left `//connect/retour`, which is not a route.
 */
export async function openStripeHandoff(
  url: string,
  router: ReturnType<typeof useRouter>,
): Promise<void> {
  const result = await WebBrowser.openAuthSessionAsync(url, 'revime://');
  if (result.type === 'success') {
    router.push(result.url.replace(/^revime:\/*/, '/') as never);
  }
}
