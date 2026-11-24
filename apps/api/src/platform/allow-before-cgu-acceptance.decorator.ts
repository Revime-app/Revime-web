import { SetMetadata } from '@nestjs/common';

export const ALLOW_BEFORE_CGU_ACCEPTANCE = 'allowBeforeCguAcceptance';

/**
 * V7 D5 (U9b, `DEC7-24` Q11). A route a signed-in user may still call while a forced CGU
 * re-acceptance is pending: reading his account (`GET /users/me`, so the app knows what to ask),
 * accepting, and leaving (account deletion and the step-up it needs). Signing out is a Better Auth
 * route and is never gated; the dashboard's `/admin` routes are exempt by path in the guard.
 */
export const AllowBeforeCguAcceptance = () => SetMetadata(ALLOW_BEFORE_CGU_ACCEPTANCE, true);
