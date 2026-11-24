import { z } from 'zod';
import type { MeResponse } from './user.schemas.js';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`…`06`). How an account was created, recorded once when its
 * first login row is created and never changed by a later linked provider.
 */
export const signupMethodSchema = z.enum(['APPLE', 'GOOGLE', 'EMAIL']);
export type SignupMethod = z.infer<typeof signupMethodSchema>;

/** The completion steps an account can still owe, in the order the client asked for them. */
export type SignupStep = 'USERNAME' | 'ROLE' | 'TERMS';

export function isSocialMethod(method: SignupMethod | null | undefined): boolean {
  return method === 'APPLE' || method === 'GOOGLE';
}

/**
 * The next step an account owes, read from server state only, so the app can re-check it on every
 * `/users/me` load and a slow server right after sign-in can never skip one (`FND9-017`).
 *
 * - USERNAME: Apple / Google accounts whose generated handle was never confirmed (e-mail accounts
 *   chose theirs on the form).
 * - ROLE: no client / repairer choice applied yet (`onboardingCompletedAt`, the existing stamp).
 * - TERMS: no recorded CGU acceptance, whatever the method (`DEC9-04` (1)).
 *
 * No `me` means unknown, not new: no step, so the caller never redirects on a failed read.
 */
export function nextSignupStep(
  me: Pick<MeResponse, 'signupMethod' | 'usernameConfirmedAt' | 'cguVersion' | 'profile'> | null | undefined,
): SignupStep | null {
  if (me === null || me === undefined) return null;
  if (isSocialMethod(me.signupMethod ?? null) && (me.usernameConfirmedAt ?? null) === null) return 'USERNAME';
  if ((me.profile?.onboardingCompletedAt ?? null) === null) return 'ROLE';
  if ((me.cguVersion ?? null) === null) return 'TERMS';
  return null;
}

/**
 * The terms screen's title (`DEC9-05` (3), refined in the plan): the mockup's « Dernière étape » while
 * an Apple / Google sign-up is being completed, « Avant de continuer » for any other account.
 */
export function termsTitle(me: Pick<MeResponse, 'signupMethod'>): 'Dernière étape' | 'Avant de continuer' {
  return isSocialMethod(me.signupMethod ?? null) ? 'Dernière étape' : 'Avant de continuer';
}

// Copy, verbatim from the client's mockup (V9 §2) or the owner's decisions (`DEC9-05`, `DEC9-06`).
export const SIGNUP_TERMS_SUBTITLE = "Avant de continuer, merci d'accepter nos conditions.";
export const SIGNUP_TERMS_HINT = "Le bouton s'active quand les 2 cases sont cochées.";
export const SIGNUP_CONNECTED_WITH = 'Connecté avec';
export const CGU_BOX_LABEL = "J'accepte les Conditions générales d'utilisation";
export const PRIVACY_BOX_LABEL = "J'accepte la Politique de confidentialité";
export const CGU_ACCEPTANCE_REQUIRED_TEXT = "Acceptez les Conditions générales d'utilisation pour continuer.";
/** Plan copy (owner reviews before the build). */
export const USERNAME_STEP_TITLE = "Choisissez votre nom d'utilisateur";
export const USERNAME_STEP_HINT =
  "C'est ce que les autres utilisateurs voient. Votre nom et votre prénom restent privés.";
