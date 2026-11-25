'use client';

import { useState } from 'react';
import { usernameSchema } from '@revime/shared';
import { api, ApiError } from '../../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../../lib/client/session';
import { Loader, PageTitle } from '../../../../../components/app/ui';
import { SettingsRow, SettingsSection } from '../../../../../components/app/Settings';

/** The app's « Informations du compte » (parametres/compte.tsx): e-mail, téléphone, pseudo, vérification. */
export default function ComptePage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!me) return <Loader />;

  const level = me.profile.verificationLevel;
  const verificationLabel =
    level === 'BUSINESS' ? 'Entreprise vérifiée' : level === 'IDENTITY' ? 'Identité vérifiée' : level === 'BASIC' ? 'Basique' : 'Aucune';

  async function save() {
    if (draft === null || saving) return;
    const parsed = usernameSchema.safeParse(draft.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Pseudo invalide.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch('/users/me/username', { username: parsed.data });
      await refresh();
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.fields?.username ?? e.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Informations du compte" back="/parametres" />

      <SettingsSection title="Coordonnées">
        <SettingsRow
          label="E-mail"
          hint={me.emailVerified ? 'Vérifié' : 'Non vérifié · Cliquez pour vérifier'}
          value={me.email}
          href={me.emailVerified ? undefined : '/verification?suite=/parametres/compte'}
        />
        <SettingsRow
          label="Téléphone"
          hint={me.phone ? (me.phoneVerified ? 'Vérifié' : 'Non vérifié · Cliquez pour vérifier') : null}
          value={me.phone ?? 'Non renseigné'}
          href={me.phoneVerified ? undefined : '/verification?suite=/parametres/compte'}
        />
      </SettingsSection>
      <p className="ap-hint ap-settings__note">
        Pour changer d’adresse e-mail, contactez le support : votre adresse sert à vous identifier et à sécuriser vos
        paiements.
      </p>

      <SettingsSection title="Identifiant">
        {draft === null ? (
          <SettingsRow label="Pseudo" hint={saved ? 'Enregistré' : 'Visible par les autres membres'} value={`@${me.username}`} onClick={() => setDraft(me.username)} />
        ) : (
          <form
            className="ap-set__edit"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="ap-field">
              <span>Pseudo</span>
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                placeholder="Votre pseudo"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                aria-invalid={error ? true : undefined}
              />
              {error && <em className="ap-field__error">{error}</em>}
            </label>
            <div className="ap-set__actions">
              <button
                type="button"
                className="ap-btn ap-btn--secondary"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                disabled={saving}
              >
                Annuler
              </button>
              <button className="ap-btn ap-btn--primary" disabled={saving || draft.trim() === me.username}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </SettingsSection>

      <SettingsSection title="Vérification">
        <SettingsRow label="Niveau de vérification" value={verificationLabel} />
      </SettingsSection>
    </div>
  );
}
