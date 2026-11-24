import { nextSignupStep, type MeResponse } from '@revime/shared';
import { ApiError } from './api';
import { routeForStep, type SignupStepRoute } from './signup-steps';

type Next = { next: SignupStepRoute | '/(tabs)' } | { error: string };

function nextAfter(me: MeResponse): SignupStepRoute | '/(tabs)' {
  const step = nextSignupStep(me);
  return step ? routeForStep(step) : '/(tabs)';
}

/**
 * V9 B1 (`DEC9-06` (2)). The username step's « Continuer »: saves the handle (even unchanged, which
 * confirms it), refreshes the session so every gate reads the new state, and names the next step.
 */
export async function submitUsername(
  username: string,
  deps: { patch: (path: string, body: unknown) => Promise<MeResponse>; refresh: () => Promise<void> },
): Promise<Next> {
  try {
    const me = await deps.patch('/users/me/username', { username: username.trim() });
    await deps.refresh();
    return { next: nextAfter(me) };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.fields?.username ?? e.message };
    return { error: "Impossible d'enregistrer votre nom d'utilisateur. Réessayez." };
  }
}

/**
 * V9 B1 (final review #1). The role step's choice, then a session refresh BEFORE leaving: the tab
 * gate reads `me`, and with the old one (no `onboardingCompletedAt`) it sent the user straight back to
 * the role step, forever. A failure is rethrown for the screen to show, and nothing is refreshed.
 */
export async function completeRoleStep(
  intent: { client: boolean; repairer: boolean; kind?: 'PRO' | 'INDIVIDUAL' },
  deps: { applyModes: (intent: { client: boolean; repairer: boolean; kind?: 'PRO' | 'INDIVIDUAL' }) => Promise<MeResponse>; refresh: () => Promise<void> },
): Promise<void> {
  await deps.applyModes(intent);
  await deps.refresh();
}

/**
 * V9 B1 (B1 (1)–(3)). The terms screen's « Continuer »: posts the dashboard's ACTIVE CGU version (the
 * server refuses a stale one) and lets the server stamp its active privacy version, then refreshes the
 * session; the tab gate takes it from there (phone check, then the app).
 */
export async function submitTerms(deps: {
  getStatus: () => Promise<{ cgu?: { version: string } }>;
  post: (path: string, body: unknown) => Promise<unknown>;
  refresh: () => Promise<void>;
}): Promise<Next> {
  try {
    const version = (await deps.getStatus()).cgu?.version;
    if (!version) return { error: "Impossible d'enregistrer votre accord. Réessayez." };
    await deps.post('/users/me/signup-acceptance', { cguVersion: version });
    await deps.refresh();
    return { next: '/(tabs)' };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Impossible d'enregistrer votre accord. Réessayez." };
  }
}
