'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DISPUTE_MOTIFS, motifsFor, openDisputeByPartySchema, type CommandeDto, type DisputeAttachmentInput, type DisputeMotif } from '@revime/shared';
import { api, errorMessage } from '../../../../../../../lib/client/api';
import { useRequireSession } from '../../../../../../../lib/client/session';
import { useApi } from '../../../../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../../../../components/app/ui';
import { signDisputeFile } from '../../../../../../../lib/client/dispute';

/** The app's « Signaler un problème » (commande/[id]/litige/nouveau.tsx): motif, description, up to 5 files. */
export default function NouveauLitigePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useRequireSession();
  const router = useRouter();
  const res = useApi<CommandeDto>(me ? `/commandes/${id}` : null);
  const [motif, setMotif] = useState<DisputeMotif | null>(null);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<DisputeAttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me || res.loading || !res.data) return <Loader />;
  const side = res.data.viewerRole;

  async function add(list: FileList | null) {
    if (!list) return;
    setUploading(true);
    setError(null);
    try {
      const next = [...files];
      for (const f of Array.from(list).slice(0, 5 - files.length)) next.push(await signDisputeFile(id, f));
      setFiles(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le fichier n'a pas pu être envoyé.");
    } finally {
      setUploading(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = openDisputeByPartySchema.safeParse({ motif, description: description.trim(), attachments: files });
    if (!parsed.success) {
      setError(motif ? parsed.error.issues[0]?.message ?? 'Vérifiez votre signalement.' : 'Choisissez un motif.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/commandes/${id}/dispute`, parsed.data);
      router.replace(`/commandes/${id}/litige`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-narrow">
      <PageTitle title="Signaler un problème" back={`/commandes/${id}`} sub={res.data.demandeTitle} />
      <p className="ap-muted">
        Le paiement reste bloqué pendant que l&apos;équipe REVIME examine la situation avec vous et {side === 'CLIENT' ? 'le réparateur' : 'le client'}.
      </p>
      <form className="ap-form" onSubmit={send}>
        <fieldset className="ap-reasons">
          <legend>Quel est le problème ?</legend>
          {motifsFor(side).map((m) => (
            <label key={m} className="ap-choice" data-active={motif === m || undefined}>
              <input type="radio" name="motif" checked={motif === m} onChange={() => setMotif(m)} />
              <span>
                <strong>{DISPUTE_MOTIFS[m].label}</strong>
                {DISPUTE_MOTIFS[m].subtitle && <small>{DISPUTE_MOTIFS[m].subtitle}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="ap-field">
          <span>Décrivez le problème</span>
          <textarea rows={5} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="20 caractères minimum" />
          <small className="ap-field__hint">{description.trim().length} / 1000</small>
        </label>
        <div className="ap-field">
          <span>Photos ou documents (facultatif, 5 au maximum)</span>
          {files.map((f, i) => (
            <p key={f.path} className="ap-file">
              {f.name ?? 'Fichier'}{' '}
              <button type="button" className="ap-link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </p>
          ))}
          {files.length < 5 && (
            <label className="ap-btn ap-btn--secondary ap-btn--block ap-filebtn">
              {uploading ? 'Envoi…' : 'Ajouter une photo ou un PDF'}
              <input type="file" accept="image/jpeg,image/png,application/pdf" multiple hidden onChange={(e) => void add(e.target.files)} />
            </label>
          )}
        </div>
        {error && <p className="ap-banner ap-banner--error">{error}</p>}
        <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy || uploading}>
          {busy ? 'Envoi…' : 'Envoyer le signalement'}
        </button>
      </form>
    </div>
  );
}
