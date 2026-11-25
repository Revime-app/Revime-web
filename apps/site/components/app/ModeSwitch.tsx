'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MeResponse } from '@revime/shared';
import { api, errorMessage } from '../../lib/client/api';
import { useModeSwitch } from '../../lib/client/mode';
import { useSession } from '../../lib/client/session';

/**
 * Client / Réparateur, the app's two modes, on the same account: switching here switches the app
 * too. An account that never repaired first says whether it is a professional or a particulier,
 * as the app's « Mode réparateur » screen asks (`PATCH /users/me/modes` with `kind`).
 */
export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, repairerEnabled, switching, error, switchTo } = useModeSwitch();
  const { refresh } = useSession();
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toPro() {
    if (mode === 'REPAIRER') return;
    if (!repairerEnabled) {
      setChoosing((v) => !v);
      return;
    }
    await switchTo('REPAIRER');
    router.push('/tableau-de-bord');
  }
  async function enable(kind: 'PRO' | 'INDIVIDUAL') {
    setBusy(true);
    setErr(null);
    try {
      await api.patch<MeResponse>('/users/me/modes', { repairerEnabled: true, activeMode: 'REPAIRER', kind });
      await refresh();
      router.push('/profil-pro?bienvenue=1');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'ap-mode ap-mode--compact' : 'ap-mode'}>
      <div className="ap-seg ap-seg--wide ap-seg--sm" role="radiogroup" aria-label="Mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'CLIENT'}
          aria-pressed={mode === 'CLIENT'}
          disabled={Boolean(switching)}
          onClick={async () => {
            setChoosing(false);
            await switchTo('CLIENT');
            if (mode !== 'CLIENT') router.push('/');
          }}
        >
          {switching === 'CLIENT' ? 'Changement…' : 'Client'}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'REPAIRER'}
          aria-pressed={mode === 'REPAIRER'}
          className={mode === 'REPAIRER' ? 'is-pro' : undefined}
          disabled={Boolean(switching)}
          onClick={() => void toPro()}
        >
          {switching === 'REPAIRER' ? 'Changement…' : 'Réparateur'}
        </button>
      </div>
      {choosing && (
        <div className="ap-mode__choose">
          <p>Vous réparez en tant que :</p>
          <button type="button" className="ap-btn ap-btn--pro ap-btn--sm ap-btn--block" disabled={busy} onClick={() => void enable('PRO')}>
            Professionnel (SIRET)
          </button>
          <button type="button" className="ap-btn ap-btn--secondary ap-btn--sm ap-btn--block" disabled={busy} onClick={() => void enable('INDIVIDUAL')}>
            Particulier
          </button>
          <small>Particulier : jusqu’à 10 missions ou 1 500 € sur 12 mois.</small>
        </div>
      )}
      {(error ?? err) && (
        <p className="ap-error" role="alert">
          {error ?? err}
        </p>
      )}
    </div>
  );
}
