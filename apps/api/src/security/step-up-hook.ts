import { APIError } from 'better-auth/api';
import { STEP_UP_REQUIRED_MESSAGE_FR } from '@revime/shared';

/**
 * V7 A11 (U2b, Q6 / Q8). The dashboard's « Changer l'e-mail » is Better Auth's `/change-email`, which
 * asks for no password, so `auth.ts`'s before hook calls this. Always enforced: the dashboard deploys
 * with the API, so it can ask for the password the moment this ships.
 */
export async function assertChangeEmailSteppedUp(
  ctx: { path: string },
  sessionId: string | null,
  isSteppedUp: (sessionId: string) => Promise<boolean>,
): Promise<void> {
  if (ctx.path !== '/change-email') return;
  if (sessionId && (await isSteppedUp(sessionId))) return;
  throw new APIError('FORBIDDEN', { code: 'STEP_UP_REQUIRED', message: STEP_UP_REQUIRED_MESSAGE_FR });
}
