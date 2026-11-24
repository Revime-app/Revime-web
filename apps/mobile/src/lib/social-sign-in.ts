import { authErrorMessageFr } from '@revime/shared';
import { authClient } from './auth-client';
import { appleAuth } from './apple-auth';

/**
 * Three outcomes, not two.
 *
 * Cancellation is its own case because it must show NOTHING. Apple's sheet is
 * dismissible, and rendering « la connexion a échoué » after a deliberate
 * dismissal tells the user something broke when nothing did. Collapsing it into
 * an error with an empty string would work by accident and read as a bug.
 */
export type SocialResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; messageFr: string };

const cancelled: SocialResult = { ok: false, cancelled: true };
const failed = (messageFr: string): SocialResult => ({ ok: false, cancelled: false, messageFr });

export async function signInWithGoogle(): Promise<SocialResult> {
  try {
    // callbackURL must stay 'revime://': @better-auth/expo rewrites this value
    // only when it starts with '/', so it reaches the server verbatim and must
    // match trustedOrigins in apps/api/src/auth/auth.ts.
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: 'revime://',
    });
    if (error) {
      return failed(authErrorMessageFr(error.code, 'La connexion avec Google a échoué.'));
    }

    // 🛑 GOOGLE CANCELLATION IS INDISTINGUISHABLE FROM SUCCESS without this check.
    // The @better-auth/expo plugin (client.js ~:362-364) does
    // `if (result.type !== "success") return;` when the user dismisses the browser,
    // which returns WITHOUT error, so `signIn.social` resolves { ok: true }.
    // The HTTP call already succeeded with `redirect: true`, so the code above
    // happily returns `{ ok: true }` with NO session. Confirm a session actually
    // exists before claiming success.
    const cookie = authClient.getCookie();
    if (!cookie || cookie.trim().length === 0) {
      return cancelled;
    }

    return { ok: true };
  } catch {
    return failed('La connexion avec Google a échoué.');
  }
}

export async function signInWithApple(): Promise<SocialResult> {
  const mod = appleAuth();
  // Should be unreachable: the button is not rendered without this. Kept because
  // « gate what you render » and « gate what you call » are different guarantees.
  if (mod === null) {
    return failed("La connexion avec Apple n'est pas disponible sur cet appareil.");
  }

  try {
    const credential = await mod.signInAsync({
      requestedScopes: [
        mod.AppleAuthenticationScope.FULL_NAME,
        mod.AppleAuthenticationScope.EMAIL,
      ],
      // 🛑 NO NONCE, DELIBERATELY. Generating one needs a CSPRNG, and there is no
      // global `crypto` in Expo SDK 57 / RN 0.86 -- `crypto.randomUUID()`
      // TYPECHECKS and throws at runtime, which is a recorded incident in
      // apps/mobile/AGENTS.md. expo-crypto would be a second native dependency.
      // Safe to omit: Better Auth checks the nonce only when one is supplied
      // (apple.ts:168), and the token is still signature-verified against
      // Apple's JWKS with an audience check either way.
    });

    if (!credential.identityToken) {
      return failed("La connexion avec Apple n'a pas abouti. Veuillez réessayer.");
    }

    const { error } = await authClient.signIn.social({
      provider: 'apple',
      idToken: { token: credential.identityToken },
    });
    if (error) {
      return failed(authErrorMessageFr(error.code, 'La connexion avec Apple a échoué.'));
    }
    return { ok: true };
  } catch (error) {
    // The documented code for « user dismissed the sheet ».
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') {
      return cancelled;
    }
    return failed('La connexion avec Apple a échoué.');
  }
}
