import { AppException } from '../common/app-exception.js';

/**
 * The single reader of `MESSAGING_ENABLED`, so no two call sites can disagree
 * about whether messaging is on.
 *
 * **It ships ABSENT and therefore OFF**, and that is the whole safety argument for
 * this piece. Messaging is the first place in this project where any account can
 * send arbitrary text to another, and the client is actively using production - he
 * authored « Écran cassé » from build 4 on 2026-08-15. The flag lets the server
 * half land and be verified against the deployed API while staying dark until a
 * build carries the screens and piece 2 gives an operator somewhere to act.
 *
 * Compared against the literal `'true'` so a stray `'1'`, `'TRUE'`, an empty string
 * or an unset variable all fail safe to off. An enabled-unless-disabled reading
 * would be the exact defect the flag exists to prevent.
 */
export function isMessagingEnabled(): boolean {
  return process.env.MESSAGING_ENABLED === 'true';
}

/**
 * `UNPROCESSABLE_ENTITY` (422) rather than 403, matching how the payment routes
 * refuse when their flag is absent: 403 means "you may not", and this means "this
 * feature is not on yet", which is a different sentence to a user.
 */
export function assertMessagingEnabled(): void {
  if (isMessagingEnabled()) return;
  throw new AppException('UNPROCESSABLE_ENTITY', "La messagerie n'est pas encore disponible.");
}
