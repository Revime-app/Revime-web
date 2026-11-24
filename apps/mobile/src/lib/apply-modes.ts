import type { MeResponse } from '@revime/shared';
import { api } from './api';

/**
 * Applies mode selections to an existing user account.
 *
 * The API rejects:
 * - activeMode: 'REPAIRER' unless repairerEnabled is true (422)
 * - disabling both modes (422)
 *
 * Both failures return French messages in ApiError.message.
 *
 * On failure, the caller should show a French retry banner and keep the user
 * where they are. The account exists and defaults to client mode, so the
 * failure is recoverable. Never sign the user out to "clean up".
 *
 * @param intent - The desired mode configuration
 * @returns Updated user profile
 */
export async function applyModes(intent: {
  client: boolean;
  repairer: boolean;
  kind?: 'PRO' | 'INDIVIDUAL';
}): Promise<MeResponse> {
  return api.patch<MeResponse>('/users/me/modes', {
    clientEnabled: intent.client,
    repairerEnabled: intent.repairer,
    activeMode: intent.client ? 'CLIENT' : 'REPAIRER',
    ...(intent.kind ? { kind: intent.kind } : {}),
  });
}
