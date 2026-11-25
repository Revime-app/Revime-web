'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CANCELLATION_REASON_LABEL, cancellationReasonSchema, createCancellationRequestSchema, type CancellationReason, type CommandeDto } from '@revime/shared';
import { api, errorMessage } from '../../../../../../lib/client/api';
import { useRequireSession } from '../../../../../../lib/client/session';
import { useApi } from '../../../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../../../components/app/ui';

/** The app's « Demander l'annulation » (commande/[id]/annulation.tsx): a reason, a comment, sent to REVIME. */
export default function AnnulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useRequireSession();
  const router = useRouter();
  const res = useApi<CommandeDto>(me ? `/commandes/${id}` : null);
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me || res.loading || !res.data) return <Loader />;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createCancellationRequestSchema.safeParse({ reason, ...(comment.trim() ? { comment: comment.trim() } : {}) });
    if (!parsed.success) {
      setError(reason ? parsed.error.issues[0]?.message ?? 'Vérifiez votre demande.' : 'Choisissez une raison.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/commandes/${id}/cancellation`, parsed.data);
      router.replace(`/commandes/${id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-narrow">
      <PageTitle title="Demander l'annulation" back={`/commandes/${id}`} sub={res.data.demandeTitle} />
      <p className="ap-muted">
        REVIME examine votre demande avec le réparateur. Pendant ce temps, la réparation est en pause. Si l&apos;annulation est
        acceptée, vous êtes remboursé selon les conditions de la Protection REVIME.
      </p>
      <form className="ap-form" onSubmit={send}>
        <fieldset className="ap-reasons">
          <legend>Pourquoi souhaitez-vous annuler ?</legend>
          {cancellationReasonSchema.options.map((r) => (
            <label key={r} className="ap-choice" data-active={reason === r || undefined}>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              <span>
                <strong>{CANCELLATION_REASON_LABEL[r]}</strong>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="ap-field">
          <span>Commentaire {reason === 'OTHER' ? '' : '(facultatif)'}</span>
          <textarea rows={4} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Expliquez en quelques mots" />
        </label>
        {error && <p className="ap-banner ap-banner--error">{error}</p>}
        <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy}>
          {busy ? 'Envoi…' : "Envoyer la demande d'annulation"}
        </button>
      </form>
    </div>
  );
}
