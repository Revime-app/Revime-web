import { STEP_UP_COPY, type GoogleStepUpStartResponse } from '@revime/shared';
import { api as realApi, ApiError } from './api';
import { authClient as realAuthClient } from './auth-client';
import { appleAuth as realAppleAuth } from './apple-auth';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (1), `DEC9-09` (1), (8)). « Reconnectez-vous avec Apple / Google »
 * for the step-up sheet. The server decides: it checks the Apple token is this account's, or that the
 * Google link carried this session's nonce (final review, Important 1), then stamps the session.
 *
 * Three outcomes, as `social-sign-in.ts`: a cancel shows nothing; a failure carries its French text.
 */
export type ProviderStepUpResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled: false; messageFr: string };

type Api = { post: (path: string, body: unknown) => Promise<unknown> };
type LinkSocial = (opts: {
  provider: 'google';
  callbackURL: string;
  errorCallbackURL: string;
  additionalData: { stepUpNonce: string };
}) => Promise<{ error?: unknown } | null | undefined>;
type AppleModule = NonNullable<ReturnType<typeof realAppleAuth>>;

const cancelled: ProviderStepUpResult = { ok: false, cancelled: true };
const failed = (messageFr: string): ProviderStepUpResult => ({ ok: false, cancelled: false, messageFr });
const messageOf = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export async function confirmWithApple(
  deps: { api?: Api; appleAuth?: () => AppleModule | null } = {},
): Promise<ProviderStepUpResult> {
  const api = deps.api ?? realApi;
  const mod = (deps.appleAuth ?? realAppleAuth)();
  if (mod === null) return failed('La connexion avec Apple n’est pas disponible sur cet appareil.');

  let credential: { identityToken?: string | null; authorizationCode?: string | null };
  try {
    // No name or e-mail: this is a confirmation, not a sign-up.
    credential = await mod.signInAsync({ requestedScopes: [] });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return cancelled;
    return failed('La confirmation avec Apple a échoué.');
  }
  if (!credential.identityToken) return failed('La confirmation avec Apple a échoué.');

  try {
    await api.post('/security/step-up/apple', {
      identityToken: credential.identityToken,
      ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
    });
    return { ok: true };
  } catch (err) {
    return failed(messageOf(err, 'La confirmation avec Apple a échoué.'));
  }
}

/**
 * Better Auth's `linkSocial` re-runs Google sign-in for the signed-in user in the browser and refreshes
 * this account's Google row; another Google e-mail is refused there. `@better-auth/expo` returns the
 * same way for a refusal and a closed page, so the confirm call is what tells them apart from success.
 * 🛑 No `prompt` and no offline access (`DEC9-09` (9)).
 * The start's nonce rides in `additionalData`: the server confirms only the session that started
 * (final review, Important 1). A start without one (an older API) never opens the browser.
 */
export async function confirmWithGoogle(deps: { api?: Api; authClient?: { linkSocial: LinkSocial } } = {}): Promise<ProviderStepUpResult> {
  const api = deps.api ?? realApi;
  const client = deps.authClient ?? (realAuthClient as unknown as { linkSocial: LinkSocial });
  let nonce: string | null;
  try {
    const started = (await api.post('/security/step-up/google/start', {})) as Partial<GoogleStepUpStartResponse> | null | undefined;
    nonce = typeof started?.nonce === 'string' && started.nonce.length > 0 ? started.nonce : null;
  } catch (err) {
    return failed(messageOf(err, STEP_UP_COPY.googleNotConfirmed));
  }
  if (nonce === null) return failed(STEP_UP_COPY.googleNotConfirmed);
  try {
    const result = await client.linkSocial({
      provider: 'google',
      callbackURL: 'revime://',
      errorCallbackURL: 'revime://',
      additionalData: { stepUpNonce: nonce },
    });
    if (result?.error) return failed(STEP_UP_COPY.googleNotConfirmed);
  } catch {
    return failed(STEP_UP_COPY.googleNotConfirmed);
  }
  try {
    await api.post('/security/step-up/google/confirm', {});
    return { ok: true };
  } catch (err) {
    return failed(messageOf(err, STEP_UP_COPY.googleNotConfirmed));
  }
}
