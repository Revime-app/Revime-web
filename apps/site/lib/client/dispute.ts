'use client';

import type { DisputeAttachmentInput } from '@revime/shared';
import { api } from './api';

/** Signs, uploads and describes one dispute attachment (JPEG, PNG or PDF), as the app does. */
export async function signDisputeFile(commandeId: string, file: File): Promise<DisputeAttachmentInput> {
  const ok = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!ok.includes(file.type)) throw new Error('Seuls les formats JPEG, PNG et PDF sont acceptés.');
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(`/commandes/${commandeId}/dispute/attachments/sign`, {
    contentType: file.type,
  });
  const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
  if (!res.ok) throw new Error("Le fichier n'a pas pu être envoyé.");
  return { kind: file.type === 'application/pdf' ? 'document' : 'photo', path, name: file.name.slice(0, 120), sizeBytes: file.size };
}
