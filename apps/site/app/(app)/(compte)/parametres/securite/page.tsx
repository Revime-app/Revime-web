'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authClient } from '../../../../../lib/client/auth';
import { useRequireSession } from '../../../../../lib/client/session';
import { Loader, PageTitle } from '../../../../../components/app/ui';
import { SettingsRow, SettingsSection } from '../../../../../components/app/Settings';

/** The app's « Sécurité » (parametres/securite.tsx): mot de passe, sessions, suppression. */
export default function SecuritePage() {
  const me = useRequireSession();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    authClient
      .listAccounts()
      .then((r) => setHasPassword((r.data ?? []).some((a: { providerId?: string }) => a.providerId === 'credential')))
      .catch(() => setHasPassword(true));
  }, [me]);

  if (!me) return <Loader />;

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !current.trim() || !next.trim()) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword: current.trim(),
        newPassword: next.trim(),
        revokeOtherSessions: true,
      });
      if (err) {
        const code = (err as { code?: string }).code ?? '';
        if (code === 'CREDENTIAL_ACCOUNT_NOT_FOUND') setHasPassword(false);
        else if (code === 'INVALID_PASSWORD') setError('Le mot de passe actuel est incorrect.');
        else if (code === 'PASSWORD_TOO_SHORT') setError('Le mot de passe est trop court.');
        else if (code === 'PASSWORD_TOO_LONG') setError('Le mot de passe est trop long.');
        else setError('Une erreur est survenue.');
      } else {
        setSuccess(true);
        setCurrent('');
        setNext('');
      }
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  async function revokeOthers() {
    setRevoking(true);
    setRevoked(null);
    try {
      await authClient.revokeOtherSessions();
      setRevoked('Les autres appareils ont été déconnectés.');
    } catch {
      setRevoked('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Sécurité" back="/parametres" />

      {hasPassword === null ? (
        <Loader />
      ) : hasPassword ? (
        <SettingsSection title="Mot de passe">
          <form className="ap-set__edit" onSubmit={change}>
            <label className="ap-field">
              <span>Mot de passe actuel</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Votre mot de passe actuel" />
            </label>
            <label className="ap-field">
              <span>Nouveau mot de passe</span>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Votre nouveau mot de passe" />
              <small className="ap-field__hint">Au moins 8 caractères. Vos autres appareils seront déconnectés.</small>
            </label>
            {error && <p className="ap-field__error">{error}</p>}
            {success && <p className="ap-ok">Mot de passe modifié.</p>}
            <button className="ap-btn ap-btn--primary ap-btn--block" disabled={saving || !current || !next}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </SettingsSection>
      ) : (
        <SettingsSection title="Mot de passe">
          <div className="ap-set__text">
            <p>
              Votre compte n’a pas de mot de passe : vous vous connectez avec Apple ou Google. Pour en créer un,{' '}
              <Link href="/mot-de-passe-oublie">recevez un lien de réinitialisation</Link> à l’adresse {me.email}.
            </p>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Sessions">
        <SettingsRow
          label="Déconnecter les autres appareils"
          hint={revoked}
          value={revoking ? 'En cours…' : null}
          onClick={revoking ? null : () => void revokeOthers()}
        />
      </SettingsSection>

      <SettingsSection title="Compte">
        <SettingsRow label="Supprimer mon compte" destructive href="/parametres/supprimer" />
      </SettingsSection>
    </div>
  );
}
