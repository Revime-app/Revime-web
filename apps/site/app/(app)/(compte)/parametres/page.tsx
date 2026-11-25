'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useModeSwitch } from '../../../../lib/client/mode';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../../../lib/documents';
import { Loader, PageTitle } from '../../../../components/app/ui';
import { SettingsRow, SettingsSection } from '../../../../components/app/Settings';

/**
 * The app's Paramètres (apps/mobile/app/parametres/index.tsx), same sections in the same order:
 * Compte (4 screens), Mode, Confidentialité, Informations légales, then Déconnexion and
 * Supprimer mon compte.
 */
export default function ParametresPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const { mode, repairerEnabled, switching, error, switchTo } = useModeSwitch();
  const router = useRouter();
  const [confirmOut, setConfirmOut] = useState(false);
  if (!me) return <Loader />;

  const legal = PUBLIC_DOCUMENTS.filter((d) => !/confidentialit/i.test(d.label));

  async function toMode(target: 'CLIENT' | 'REPAIRER') {
    if (switching || mode === target) return;
    // First time in réparateur mode: the app's « Mode réparateur » screen asks Particulier or Professionnel.
    if (target === 'REPAIRER' && !repairerEnabled) {
      router.push('/mode-reparateur');
      return;
    }
    await switchTo(target);
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Paramètres" back="/profil" />

      <SettingsSection title="Compte">
        <SettingsRow label="Informations du compte" href="/parametres/compte" />
        <SettingsRow label="Informations personnelles" href="/parametres/personnel" />
        <SettingsRow label="Sécurité" href="/parametres/securite" />
        <SettingsRow label="Notifications" href="/parametres/notifications" />
      </SettingsSection>

      <SettingsSection title="Mode">
        <SettingsRow
          label="Mode client"
          value={switching === 'CLIENT' ? 'Changement…' : mode === 'CLIENT' ? 'Actif' : null}
          onClick={mode === 'CLIENT' || switching ? null : () => void toMode('CLIENT')}
        />
        <SettingsRow
          label="Mode réparateur"
          value={switching === 'REPAIRER' ? 'Changement…' : mode === 'REPAIRER' ? 'Actif' : null}
          onClick={mode === 'REPAIRER' || switching ? null : () => void toMode('REPAIRER')}
        />
      </SettingsSection>
      {error && (
        <p className="ap-field__error" role="alert">
          {error}
        </p>
      )}
      <p className="ap-hint ap-settings__note">
        Le mode client vous permet de publier des demandes et de recevoir des offres. Le mode réparateur vous permet
        de répondre aux demandes et de gérer vos réparations. Le mode est le même sur le site et dans l’appli.
      </p>

      <SettingsSection title="Confidentialité">
        <SettingsRow label="Politique de confidentialité" href="/parametres/confidentialite" />
      </SettingsSection>

      <SettingsSection title="Informations légales">
        {legal.map((d) => (
          <SettingsRow key={d.slug} label={d.label} href={`/${d.slug}`} />
        ))}
      </SettingsSection>

      <SettingsSection title="Aide">
        <SettingsRow label="Contacter le support" value={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} external />
      </SettingsSection>

      <SettingsSection title={null}>
        {confirmOut ? (
          <div className="ap-set__confirm">
            <p>Voulez-vous vraiment vous déconnecter ?</p>
            <div>
              <button type="button" className="ap-btn ap-btn--secondary ap-btn--sm" onClick={() => setConfirmOut(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="ap-btn ap-btn--danger ap-btn--sm"
                onClick={async () => {
                  await signOut();
                  router.push('/');
                }}
              >
                Déconnexion
              </button>
            </div>
          </div>
        ) : (
          <SettingsRow label="Déconnexion" destructive onClick={() => setConfirmOut(true)} />
        )}
        <SettingsRow label="Supprimer mon compte" destructive href="/parametres/supprimer" />
      </SettingsSection>
    </div>
  );
}
