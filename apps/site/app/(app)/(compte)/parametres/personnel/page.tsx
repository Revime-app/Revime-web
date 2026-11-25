'use client';

import { useEffect, useRef, useState } from 'react';
import { authClient } from '../../../../../lib/client/auth';
import { useRequireSession, useSession } from '../../../../../lib/client/session';
import { Loader, PageTitle } from '../../../../../components/app/ui';

/** The app's « Informations personnelles » (parametres/personnel.tsx): the legal first and last name. */
export default function PersonnelPage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current && me) {
      setFirst(me.firstName ?? '');
      setLast(me.lastName ?? '');
      seeded.current = true;
    }
  }, [me]);

  if (!me) return <Loader />;
  const changed = first.trim() !== (me.firstName ?? '') || last.trim() !== (me.lastName ?? '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed || saving) return;
    if (!first.trim() || !last.trim()) {
      setError('Le prénom et le nom sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Better Auth's typed client does not know the API's extra user fields.
      const update = authClient.updateUser as unknown as (input: Record<string, unknown>) => Promise<{ error: unknown }>;
      const res = await update({ firstName: first.trim(), lastName: last.trim(), name: `${first.trim()} ${last.trim()}` });
      if (res?.error) throw res.error;
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Informations personnelles" back="/parametres" />
      <p className="ap-muted">
        Ces informations correspondent à votre identité légale. Si vous les modifiez après vérification, une nouvelle
        vérification pourrait être nécessaire.
      </p>
      <form className="ap-form" onSubmit={save}>
        <label className="ap-field">
          <span>Prénom</span>
          <input
            value={first}
            onChange={(e) => {
              setFirst(e.target.value);
              setError(null);
              setSaved(false);
            }}
            placeholder="Votre prénom"
            autoComplete="given-name"
          />
        </label>
        <label className="ap-field">
          <span>Nom</span>
          <input
            value={last}
            onChange={(e) => {
              setLast(e.target.value);
              setError(null);
              setSaved(false);
            }}
            placeholder="Votre nom"
            autoComplete="family-name"
          />
        </label>
        {error && <p className="ap-field__error">{error}</p>}
        {saved && <p className="ap-ok">Modifications enregistrées.</p>}
        <button className="ap-btn ap-btn--primary ap-btn--block" disabled={!changed || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
      <p className="ap-hint">Votre nom et votre prénom restent privés. Les autres membres voient votre pseudo.</p>
    </div>
  );
}
