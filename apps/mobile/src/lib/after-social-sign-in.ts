import { needsModeChoice, nextSignupStep } from '@revime/shared';
import type { MeResponse } from '@revime/shared';
import { api } from './api';
import { applyModes } from './apply-modes';
import { routeForStep, type SignupStepRoute } from './signup-steps';

/**
 * Where to go right after an Apple / Google sign-in.
 *
 * V9 B1 (`DEC9-04`, `FND9-017`): the first completion step the account owes (username, role, terms),
 * else the tabs. When the user picked « Client » / « Réparateur » BEFORE tapping the social button
 * (the sign-up screen passes it as `preselected`), that choice is applied here, so he is not asked a
 * second time. A failed read falls back to the tabs: the tab layout re-reads the steps on every
 * `/users/me` load (`tabGateTarget`), so a slow server can no longer skip one.
 */
export async function afterSocialSignIn(preselected?: {
  client: boolean;
  repairer: boolean;
  kind?: 'PRO' | 'INDIVIDUAL';
}): Promise<'/(tabs)' | SignupStepRoute> {
  try {
    let me = await api.get<MeResponse>('/users/me');
    if (preselected && needsModeChoice(me)) {
      await applyModes(preselected);
      me = await api.get<MeResponse>('/users/me');
    }
    const step = nextSignupStep(me);
    return step ? routeForStep(step) : '/(tabs)';
  } catch {
    return '/(tabs)';
  }
}
