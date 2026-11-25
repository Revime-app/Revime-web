'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MeResponse } from '@revime/shared';
import { api, errorMessage } from '../../../lib/client/api';
import { useRequireSession, useSession } from '../../../lib/client/session';
import { Loader, PageTitle } from '../../../components/app/ui';
import { RepairerKindPicker, type RepairerKind } from '../../../components/app/RepairerKindPicker';

/** The app's « Mode réparateur » (mode-reparateur.tsx): first switch into réparateur mode. */
export default function ModeReparateurPage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return <Loader />;

  async function choose(kind: RepairerKind) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch<MeResponse>('/users/me/modes', { repairerEnabled: true, activeMode: 'REPAIRER', kind });
      await refresh();
      router.replace('/statut-verification');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-narrow" data-mode="pro">
      <PageTitle title="Mode réparateur" back="/parametres" />
      <h2 className="ap-signup__prompt">Choisissez votre statut</h2>
      <p className="ap-muted">Votre mode client reste disponible. Vous pourrez basculer à tout moment depuis les paramètres.</p>
      <RepairerKindPicker onChoose={(k) => void choose(k)} disabled={busy} />
      {busy && <p className="ap-muted">Passage en mode réparateur…</p>}
      {error && <p className="ap-banner ap-banner--error">{error}</p>}
    </div>
  );
}
