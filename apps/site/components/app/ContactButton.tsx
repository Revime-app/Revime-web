'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '../../lib/client/api';
import { useSession } from '../../lib/client/session';

/**
 * « Écrire un message » on a repairer's page, the app's direct contact (`POST /conversations`
 * with no demande). Signed out, it asks for the login first and comes back to this page.
 */
export function ContactButton({ repairerUserId, demandeId }: { repairerUserId: string; demandeId?: string }) {
  const { status, me } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me?.id === repairerUserId) return null;

  async function open() {
    if (status !== 'in') {
      router.push(`/connexion?suite=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<{ id: string }>('/conversations', { repairerUserId, demandeId: demandeId ?? null });
      router.push(`/messages?c=${c.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="ap-btn ap-btn--secondary" onClick={() => void open()} disabled={busy}>
        {busy ? 'Ouverture…' : 'Écrire un message'}
      </button>
      {error && <p className="ap-error" role="alert">{error}</p>}
    </>
  );
}
