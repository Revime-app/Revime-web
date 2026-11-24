import { nextSignupStep, type MeResponse, type SignupStep } from '@revime/shared';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`, `DEC9-05` (2)). The completion steps after an Apple /
 * Google sign-up (and the terms screen for any account with no recorded acceptance), as routes.
 */
export type SignupStepRoute = '/(auth)/nom-utilisateur' | '/(auth)/roles?apply=1' | '/(auth)/conditions';

export function routeForStep(step: SignupStep): SignupStepRoute {
  if (step === 'USERNAME') return '/(auth)/nom-utilisateur';
  if (step === 'ROLE') return '/(auth)/roles?apply=1';
  return '/(auth)/conditions';
}

/**
 * V9 B1 (final review #2): signed in, done loading, and still no `me` means the read failed (a cold
 * server right after sign-in). The tab layout retries while this is true, because the gate cannot
 * send anyone to an owed step without `me`, and nothing else re-reads it.
 */
export function shouldRetryMe(input: { session: unknown; loading: boolean; me: unknown }): boolean {
  return Boolean(input.session) && !input.loading && (input.me ?? null) === null;
}

type GateMe = Pick<
  MeResponse,
  'signupMethod' | 'usernameConfirmedAt' | 'cguVersion' | 'profile' | 'emailVerified' | 'phoneVerified'
>;

/**
 * The tab layout's decision, extracted so it is testable. It runs on every `me` load, which is what
 * stops a slow server right after sign-in from skipping a step (`FND9-017`): the steps come before
 * the existing phone check, as the owner ordered them (`DEC9-05` (2)). Unknown `me` waits.
 */
export function tabGateTarget(input: {
  session: unknown;
  me: GateMe | null | undefined;
}): '/(auth)/login' | SignupStepRoute | '/verification' | null {
  if (!input.session) return '/(auth)/login';
  const me = input.me ?? null;
  if (me === null) return null;
  const step = nextSignupStep(me);
  if (step) return routeForStep(step);
  if (!me.emailVerified || !me.phoneVerified) return '/verification';
  return null;
}
