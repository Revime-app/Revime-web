'use client';

import { useState } from 'react';
import { useModeSwitch } from '../../lib/client/mode';

/**
 * Client / Réparateur, the app's two modes. The site has the client space today; the réparateur
 * space comes next. So choosing Réparateur here does not change the account's mode (that would
 * turn the app to réparateur for a site that cannot show it): it says where that space is. Coming
 * back to Client, from an account the app left in réparateur mode, does switch, because everything
 * the site shows works in client mode.
 */
export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, repairerEnabled, switching, error, switchTo } = useModeSwitch();
  const [info, setInfo] = useState(false);
  return (
    <div className={compact ? 'ap-mode ap-mode--compact' : 'ap-mode'}>
      <div className="ap-seg ap-seg--wide ap-seg--sm" role="radiogroup" aria-label="Mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'CLIENT'}
          aria-pressed={mode === 'CLIENT'}
          disabled={Boolean(switching)}
          onClick={() => {
            setInfo(false);
            void switchTo('CLIENT');
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
          onClick={() => setInfo((v) => !v)}
        >
          Réparateur
        </button>
      </div>
      {mode === 'REPAIRER' && (
        <p className="ap-mode__note">
          Votre compte est en mode réparateur dans l’appli. Ici, vous voyez votre espace client : touchez « Client » pour
          y passer partout.
        </p>
      )}
      {info && mode === 'CLIENT' && (
        <p className="ap-mode__note">
          {repairerEnabled
            ? 'L’espace réparateur arrive sur le site. En attendant, vos demandes près de chez vous, vos propositions et vos revenus sont dans l’appli, avec le même compte.'
            : 'Vous savez réparer ? Activez le mode réparateur dans l’appli REVIME (Profil, puis Paramètres). L’espace réparateur arrive ensuite sur le site.'}
        </p>
      )}
      {error && (
        <p className="ap-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
