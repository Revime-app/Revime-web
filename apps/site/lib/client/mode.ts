'use client';

import { useState } from 'react';
import type { MeResponse } from '@revime/shared';
import { api, errorMessage } from './api';
import { useSession } from './session';

export type Mode = MeResponse['profile']['activeMode'];

/**
 * One account, two uses, as in the app's Paramètres (`handleModeSwitch`). The mode lives on the
 * server, so a switch here is also a switch in the app.
 *
 * Going back to CLIENT also sends `clientEnabled: true`, exactly as the app does: an account
 * created as réparateur has the flag off, and the API's publish gate reads it.
 */
export function modeBody(target: Mode) {
  return target === 'CLIENT' ? { activeMode: 'CLIENT' as const, clientEnabled: true } : { activeMode: 'REPAIRER' as const };
}

/** True when the server would refuse « publier une demande » to this account as it stands. */
export function needsClientMode(me: MeResponse | null): boolean {
  return Boolean(me && me.profile.activeMode === 'REPAIRER' && !me.profile.clientEnabled);
}

export function useModeSwitch() {
  const { me, refresh } = useSession();
  const [switching, setSwitching] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const switchTo = async (target: Mode) => {
    if (!me || switching || me.profile.activeMode === target) return;
    setError(null);
    setSwitching(target);
    try {
      await api.patch<MeResponse>('/users/me/modes', modeBody(target));
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSwitching(null);
    }
  };
  return { mode: (me?.profile.activeMode ?? 'CLIENT') as Mode, repairerEnabled: Boolean(me?.profile.repairerEnabled), switching, error, switchTo };
}
