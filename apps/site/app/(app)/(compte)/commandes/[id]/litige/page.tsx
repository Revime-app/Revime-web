'use client';

import { use, useEffect, useState } from 'react';
import { stripSupportPrefix, type DisputeAttachmentInput, type PartyDisputeDto } from '@revime/shared';
import { api, errorMessage } from '../../../../../../lib/client/api';
import { useRequireSession } from '../../../../../../lib/client/session';
import { useApi } from '../../../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../../../components/app/ui';
import { signDisputeFile } from '../../../../../../lib/client/dispute';

/** The app's open dispute (commande/[id]/litige/ouvert.tsx): the thread with REVIME, and a reply box. */
const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_REVIEW: 'En cours d’examen',
  RESOLVED_REFUNDED: 'Résolu : remboursement',
  RESOLVED_RELEASED: 'Résolu : paiement versé',
  RESOLVED_DISMISSED: 'Clos',
};

export default function LitigePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useRequireSession();
  const res = useApi<PartyDisputeDto>(me ? `/commandes/${id}/dispute` : null);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<DisputeAttachmentInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (res.data) void api.post(`/commandes/${id}/dispute/read`, {}).catch(() => undefined);
  }, [res.data, id]);

  if (!me || res.loading) return <Loader />;
  if (!res.data) return <p className="ap-error">{res.error ?? 'Litige introuvable.'}</p>;
  const d = res.data;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/commandes/${id}/dispute/messages`, { ...(body.trim() ? { body: body.trim() } : {}), ...(file ? { attachment: file } : {}) });
      setBody('');
      setFile(null);
      res.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-narrow">
      <PageTitle title={`Litige ${d.reference}`} back={`/commandes/${id}`} sub={`${STATUS[d.status] ?? d.status}${d.motifLabel ? ` · ${d.motifLabel}` : ''}`} />
      <ol className="ap-dthread">
        {d.messages.map((m) => (
          <li key={m.id} className={m.author === 'me' ? 'is-me' : 'is-revime'}>
            <span className="ap-dthread__who">{m.author === 'me' ? 'Vous' : 'REVIME'}</span>
            {m.body && <p>{stripSupportPrefix(m.body)}</p>}
            {m.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photoUrl} alt="Pièce jointe" />
            )}
            {m.document && (
              <a href={m.document.url} target="_blank" rel="noreferrer">
                {m.document.name ?? 'Document'}
              </a>
            )}
            <time>{fmt.format(new Date(m.createdAt))}</time>
          </li>
        ))}
      </ol>
      {d.canWrite ? (
        <form className="ap-form" onSubmit={send}>
          <label className="ap-field">
            <span>Votre message à REVIME</span>
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {file ? (
            <p className="ap-file">
              {file.name}{' '}
              <button type="button" className="ap-link" onClick={() => setFile(null)}>
                Retirer
              </button>
            </p>
          ) : (
            <label className="ap-link ap-filebtn">
              Joindre une photo ou un PDF
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setFile(await signDisputeFile(id, f));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Le fichier n'a pas pu être envoyé.");
                  }
                }}
              />
            </label>
          )}
          {error && <p className="ap-field__error">{error}</p>}
          <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy || (!body.trim() && !file)}>
            {busy ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>
      ) : (
        <p className="ap-hint">Ce litige est clos. Pour toute question, contactez le support depuis Paramètres.</p>
      )}
    </div>
  );
}
