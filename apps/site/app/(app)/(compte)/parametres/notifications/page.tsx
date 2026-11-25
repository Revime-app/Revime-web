'use client';

import { useState } from 'react';
import { api, errorMessage } from '../../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../../lib/client/session';
import { Loader, PageTitle } from '../../../../../components/app/ui';
import { SettingsSection, SettingsToggle } from '../../../../../components/app/Settings';

type Key = 'offers' | 'messages' | 'commandes' | 'marketing';

/** The app's « Notifications » (parametres/notifications.tsx): the same four preferences, same endpoint. */
export default function NotificationsPrefsPage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const [saving, setSaving] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return <Loader />;

  const values: Record<Key, boolean> = {
    offers: me.profile.notifyOffers ?? true,
    messages: me.profile.notifyMessages ?? true,
    commandes: me.profile.notifyCommandes ?? true,
    marketing: me.marketingConsent ?? false,
  };

  async function set(key: Key, next: boolean) {
    setSaving(key);
    setError(null);
    try {
      await api.patch('/users/me/notification-preferences', { [key]: next });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Notifications" back="/parametres" />
      <p className="ap-muted">
        Ces préférences valent pour le site, l’appli et les e-mails. Les notifications push s’activent dans l’appli
        REVIME, depuis les réglages de votre téléphone.
      </p>
      <SettingsSection title="Préférences">
        <SettingsToggle label="Offres" hint="Quand un réparateur répond à votre demande." checked={values.offers} disabled={saving === 'offers'} onChange={(v) => void set('offers', v)} />
        <SettingsToggle label="Messages" hint="Quand vous recevez un message." checked={values.messages} disabled={saving === 'messages'} onChange={(v) => void set('messages', v)} />
        <SettingsToggle
          label="Commandes et paiements"
          hint="Paiement, avancement de la réparation, livraison."
          checked={values.commandes}
          disabled={saving === 'commandes'}
          onChange={(v) => void set('commandes', v)}
        />
        <SettingsToggle
          label="Offres commerciales"
          hint="Nouveautés et offres de REVIME par e-mail et SMS."
          checked={values.marketing}
          disabled={saving === 'marketing'}
          onChange={(v) => void set('marketing', v)}
        />
      </SettingsSection>
      {error && (
        <p className="ap-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
