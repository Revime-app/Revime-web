'use client';

import { useRef, useState } from 'react';
import type { MeResponse } from '@revime/shared';
import { api, ApiError } from '../../lib/client/api';
import { useSession } from '../../lib/client/session';
import { initials } from './ui';

/**
 * The app's « Photo de profil » and « Bannière » (profil-public/photo.tsx, banniere.tsx): sign, PUT the
 * bytes, then save the path. JPEG or PNG only, the formats the API signs.
 */
async function upload(kind: 'avatar' | 'banner', file: File): Promise<string> {
  const contentType = file.type;
  if (contentType !== 'image/jpeg' && contentType !== 'image/png') throw new Error('Format non supporté. Utilisez une image JPEG ou PNG.');
  if (file.size > 10 * 1024 * 1024) throw new Error("L'image ne doit pas dépasser 10 Mo.");
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(`/users/me/${kind}/sign`, { contentType });
  const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': contentType } });
  if (!res.ok) throw new Error(kind === 'avatar' ? "La photo n'a pas pu être envoyée." : "La bannière n'a pas pu être envoyée.");
  return path;
}

function usePicture(kind: 'avatar' | 'banner') {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const failed = kind === 'avatar' ? "La photo n'a pas pu être envoyée." : "La bannière n'a pas pu être envoyée.";
  async function set(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await upload(kind, file);
      await api.patch<MeResponse>(`/users/me/${kind}`, { path });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.fields?.path ?? e.message : e instanceof Error ? e.message : failed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.patch<MeResponse>(`/users/me/${kind}`, { path: null });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, input, set, remove };
}

export function AvatarEditor({ me }: { me: MeResponse }) {
  const p = usePicture('avatar');
  const url = me.avatarUrl ?? me.image ?? null;
  return (
    <section className="ap-box ap-pic">
      <h2>Photo de profil</h2>
      <div className="ap-pic__row">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ap-pic__av" src={url} alt="Votre photo de profil" />
        ) : (
          <span className="ap-pic__av ap-pic__av--empty" aria-hidden="true">
            {initials(me.name || me.username)}
          </span>
        )}
        <div className="ap-pic__actions">
          <label className="ap-btn ap-btn--primary ap-btn--sm">
            {p.busy ? 'Envoi…' : url ? 'Changer la photo' : 'Ajouter une photo'}
            <input ref={p.input} type="file" accept="image/jpeg,image/png" hidden disabled={p.busy} onChange={(e) => void p.set(e.target.files?.[0])} />
          </label>
          {url && (
            <button type="button" className="ap-link ap-link--muted" onClick={() => void p.remove()} disabled={p.busy}>
              Supprimer la photo
            </button>
          )}
        </div>
      </div>
      <p className="ap-hint">Une vraie photo de vous inspire confiance. JPEG ou PNG.</p>
      {p.error && <p className="ap-field__error">{p.error}</p>}
    </section>
  );
}

export function BannerEditor({ me }: { me: MeResponse }) {
  const p = usePicture('banner');
  const url = me.repairer?.bannerUrl ?? null;
  return (
    <section className="ap-box ap-pic">
      <h2>Bannière</h2>
      <div className="ap-pic__banner">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Votre bannière" />
        ) : (
          <span>Ajoutez une bannière : votre atelier, vos outils, une réparation réussie.</span>
        )}
      </div>
      <div className="ap-pic__actions ap-pic__actions--row">
        <label className="ap-btn ap-btn--primary ap-btn--sm">
          {p.busy ? 'Envoi…' : url ? 'Changer la bannière' : 'Ajouter une bannière'}
          <input ref={p.input} type="file" accept="image/jpeg,image/png" hidden disabled={p.busy} onChange={(e) => void p.set(e.target.files?.[0])} />
        </label>
        {url && (
          <button type="button" className="ap-link ap-link--muted" onClick={() => void p.remove()} disabled={p.busy}>
            Supprimer la bannière
          </button>
        )}
      </div>
      {p.error && <p className="ap-field__error">{p.error}</p>}
    </section>
  );
}
