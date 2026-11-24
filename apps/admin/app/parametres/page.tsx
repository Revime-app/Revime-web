'use client';

import { useEffect, useState } from 'react';
import { ADMIN_ROLE_LABEL, authErrorMessageFr } from '@revime/shared';
import { signOut, updateUser, useSession } from '../../lib/auth-client';
import { profileNameInput } from '../../lib/settings';
import { useAdminMe } from '../../components/AdminGate';
import { SecuritySection } from '../../components/SecuritySection';
import { ChangePasswordSection } from '../../components/ChangePasswordSection';
import { ChangeEmailSection } from '../../components/ChangeEmailSection';
import { ActiveSessionsCard } from '../../components/ActiveSessionsCard';

/**
 * « Paramètres »: the staff member's own account. Profil (name, the signed-in e-mail and
 * role), Sécurité (the second factor, formerly the « Sécurité » page) and the sign-out
 * button, which used to sit on the dashboard.
 *
 * Reachable by an unverified staff session (SECURITE_PATH), so it calls no admin route: the
 * name goes through Better Auth's own `update-user`, the role comes from the gate's admin/me.
 */
type SessionUser = { name?: string | null; email?: string; firstName?: string | null; lastName?: string | null };

export default function ParametresPage() {
  const me = useAdminMe();
  const { data: session, refetch } = useSession();
  const user = session?.user as SessionUser | undefined;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the fields once the session arrives. Accounts created before first/last names
  // existed only have `name`; it fills the first-name field rather than leaving it blank.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? (user.lastName ? '' : (user.name ?? '')));
    setLastName(user.lastName ?? '');
  }, [user?.firstName, user?.lastName, user?.name]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const parsed = profileNameInput(firstName, lastName);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await updateUser(parsed.data);
    setBusy(false);
    if (err) {
      setError(authErrorMessageFr(err.code, 'Enregistrement impossible.'));
      return;
    }
    setFirstName(parsed.data.firstName);
    setLastName(parsed.data.lastName);
    setSaved(true);
    await refetch();
  }

  return (
    <div className="page page--detail page--settings">
      <h1>Paramètres</h1>

      <div className="detail-grid">
        {/* Left Column: Profil Form & Sécurité */}
        <div data-testid="detail-grid-left">
          <section className="card settings__section" aria-labelledby="settings-profile">
            <h2 id="settings-profile" className="settings__title">Profil</h2>
            <form onSubmit={onSave}>
              <div className="settings__row">
                <div>
                  <label htmlFor="settings-first-name">Prénom</label>
                  <input
                    id="settings-first-name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setSaved(false);
                    }}
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="settings-last-name">Nom</label>
                  <input
                    id="settings-last-name"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setSaved(false);
                    }}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <p className="settings__hint">
                Ce nom apparaît auprès de l&apos;équipe (par exemple « Assigné à » sur les litiges) et sur votre
                compte Revime.
              </p>
              {error && <p role="alert">{error}</p>}
              {saved && (
                <p role="status" className="settings__saved">
                  Nom enregistré.
                </p>
              )}
              <div>
                <button type="submit" disabled={busy || !user}>
                  {busy ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </section>

          <ChangePasswordSection />

          <ChangeEmailSection />

          <section className="card settings__section" aria-labelledby="settings-security">
            <h2 id="settings-security" className="settings__title">Sécurité</h2>
            <SecuritySection />
          </section>
        </div>

        {/* Right Column: Account Info, Session & Active Sessions */}
        <div data-testid="detail-grid-right">
          <section className="card settings__section" aria-labelledby="settings-account">
            <h2 id="settings-account" className="settings__title">Compte</h2>
            <dl className="settings__facts" style={{ marginBottom: 0 }}>
              <dt>Connecté en tant que</dt>
              <dd>{user?.email ?? '—'}</dd>
              {me && (
                <>
                  <dt>Rôle dans l&apos;équipe</dt>
                  <dd>{ADMIN_ROLE_LABEL[me.role]}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="card settings__section" aria-labelledby="settings-session">
            <h2 id="settings-session" className="settings__title">Session</h2>
            <p>Vous serez redirigé vers l&apos;écran de connexion.</p>
            <button type="button" onClick={() => signOut()}>
              Se déconnecter
            </button>
          </section>

          <ActiveSessionsCard />
        </div>
      </div>
    </div>
  );
}
