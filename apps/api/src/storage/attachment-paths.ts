import { randomUUID } from 'node:crypto';
import type { DisputeSide } from '@revime/shared';
import { PHOTO_BUCKET, UUID } from './photo-paths.js';
import { isStorageConfigured, storageGateway } from './gateway.js';

export function attachmentBucket(): string {
  return process.env.ATTACHMENT_BUCKET ?? 'attachments';
}

const EXT_BY_ATTACHMENT_TYPE: Record<string, 'jpg' | 'png' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function attachmentExtension(contentType: string): 'jpg' | 'png' | 'pdf' {
  const ext = EXT_BY_ATTACHMENT_TYPE[contentType];
  if (!ext) throw new Error(`Unsupported attachment content type: ${contentType}`);
  return ext;
}

export function bucketFor(ext: string): string {
  return ext === 'pdf' ? attachmentBucket() : PHOTO_BUCKET;
}

export function conversationAttachmentPath(conversationId: string, contentType: string): string {
  return `conversations/${conversationId}/${randomUUID()}.${attachmentExtension(contentType)}`;
}

export function disputeAttachmentPath(
  commandeId: string,
  side: DisputeSide,
  contentType: string,
): string {
  const sideSlug = side === 'CLIENT' ? 'client' : 'reparateur';
  return `commandes/${commandeId}/litige/${sideSlug}/${randomUUID()}.${attachmentExtension(contentType)}`;
}

export function checkConversationAttachment(
  path: string,
  conversationId: string,
  kind: 'photo' | 'document',
): boolean {
  const extPattern = kind === 'photo' ? '(jpg|png)' : 'pdf';
  const regex = new RegExp(`^conversations/${conversationId}/${UUID}\\.${extPattern}$`);
  return regex.test(path);
}

export function checkDisputeAttachment(
  path: string,
  commandeId: string,
  side: DisputeSide,
  kind: 'photo' | 'document',
): boolean {
  const sideSlug = side === 'CLIENT' ? 'client' : 'reparateur';
  const extPattern = kind === 'photo' ? '(jpg|png)' : 'pdf';
  const regex = new RegExp(`^commandes/${commandeId}/litige/${sideSlug}/${UUID}\\.${extPattern}$`);
  return regex.test(path);
}

export function cleanDocumentName(name: string | undefined | null): string {
  if (!name) return 'document.pdf';
  const segments = name.split(/[/\\]/);
  const base = segments[segments.length - 1] ?? '';
  const trimmed = base.trim();
  if (!trimmed) return 'document.pdf';
  return trimmed.slice(0, 120);
}

export async function signAttachmentUrls(
  paths: { photo: string[]; document: string[] },
  ttlSeconds = 3600,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!isStorageConfigured()) return result;

  const [signedPhotos, signedDocs] = await Promise.all([
    paths.photo.length > 0
      ? storageGateway().createSignedReadUrls(paths.photo, ttlSeconds, PHOTO_BUCKET)
      : Promise.resolve(new Map<string, string>()),
    paths.document.length > 0
      ? storageGateway().createSignedReadUrls(paths.document, ttlSeconds, attachmentBucket())
      : Promise.resolve(new Map<string, string>()),
  ]);

  for (const [k, v] of signedPhotos) result.set(k, v);
  for (const [k, v] of signedDocs) result.set(k, v);
  return result;
}
