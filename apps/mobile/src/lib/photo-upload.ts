import { api } from './api';
import { generateUUID } from './uuid';

/**
 * A module-level UUID that prefixes storage keys for one wizard session.
 *
 * **LIFECYCLE:** Generated on wizard mount, reset on unmount AND after successful
 * submission. Expo Router keeps tab screens mounted, so without the submission reset
 * one app launch would be one prefix rather than one wizard session - that would
 * break the cleanup job's per-draft reasoning (it expects "one abandoned wizard is
 * one prefix") and make every published photo share a prefix with the next draft.
 *
 * **WHAT THIS PROTECTS AGAINST:** Abandoned drafts leaving orphaned storage objects.
 * The cleanup job (apps/api/src/cron/cron.service.ts:purgeOrphanPhotos) deletes any
 * object older than 24h that has no matching DemandePhoto row. The prefix groups one
 * session's picks so the job can reason about them together.
 *
 * **WHAT THIS DOES NOT RISK:** Published photos are nearly always safe. The job checks
 * EVERY object against the DemandePhoto table (apps/api/src/storage/photo-orphans.ts:shouldPurge)
 * and a published photo has a row, so it is kept. It never deletes by prefix alone.
 * The narrow window: a publish landing inside the batch remove() call in purgeOrphanPhotos
 * could attach an object being deleted at that instant, because the cron reads its
 * referenced-set before the remove. Mitigated by the 24h floor - a fresh upload is never
 * in the delete set.
 */
let draftId: string | null = null;

export function initDraftId(): string {
  draftId = generateUUID();
  return draftId;
}

export function currentDraftId(): string {
  if (!draftId) throw new Error('Draft ID not initialized');
  return draftId;
}

export function resetDraftId(): void {
  draftId = null;
}

/**
 * Sign, then PUT the bytes straight to storage. Our API is never in the byte path -- it is
 * on Render's free plan and its cold start was measured between 22s and 5m56s.
 *
 * 🛑 THE BYTE PATH ITSELF MOVED TO `putSignedBytes` BELOW, WITH `CF-23`. This comment stays here
 * because it is the record of WHY that function is written the way it is, and because a reader
 * arriving at the demande upload should meet it. Everything from here to the end of this block
 * describes `putSignedBytes`, not the three lines directly under it.
 *
 * 🛑 THE BLOB MUST CARRY ITS OWN `type`, AND AN EXPLICIT `content-type` HEADER IS NOT ENOUGH.
 *
 * Measured on device 2026-08-21, build 5, from Supabase's own logs: every upload answered
 * **400** with `{"error":"invalid_mime_type","message":"mime type application/octet-stream is
 * not supported","code":"InvalidMimeType"}`. The bytes were fine -- 110 KB and 799 KB arrived
 * -- so this was never a failed read. Only the MIME was wrong, and the bucket allows exactly
 * `image/jpeg` and `image/png`.
 *
 * The cause is in React Native, not in our code or in Supabase. For a **Blob** request body,
 * `RCTBlobManager.mm:284-288` derives the request's Content-Type from the BLOB'S OWN `type`
 * and falls back to `application/octet-stream` when it is empty:
 *
 *     NSString *contentType = @"application/octet-stream";
 *     NSString *blobType = [RCTConvert NSString:RCTNilIfNull(blob[@"type"])];
 *     if (blobType != nil && blobType.length > 0) { contentType = blob[@"type"]; }
 *
 * And the blob produced by `fetch(file://...)` has an EMPTY type, because
 * `RCTBlobManager.mm:308` sets it from `[response MIMEType]` and a local-file response carries
 * none. So the header we set here never decided the wire value.
 *
 * `new Blob([raw], { type })` fixes it at the source: `BlobManager.js:105` stores `options.type`
 * on the blob, so the native side has a real MIME to send. The explicit header is KEPT because
 * the two guard different paths -- `RCTNetworking.mm:357` only overrides Content-Type when the
 * request's own is empty, so with both in place the wire carries `contentType` whichever branch
 * runs.
 *
 * VERIFIED AGAINST LIVE SUPABASE (from Node, so the contract not the platform): the same signed
 * URL answers **200** with `content-type: image/png` and **400 / 137 bytes** with the header
 * absent or empty -- and 137 bytes is byte-for-byte what the device received. Do not "simplify"
 * this back to a bare `.blob()`; there is no test here to catch it (`apps/mobile` has only a
 * `typecheck` script) and the failure is a generic French string on a tile.
 */
export async function uploadPhoto(localUri: string, contentType: string): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    '/demandes/photos/sign',
    { draftId: currentDraftId(), contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}

/**
 * The byte path, shared by demande photos and by `CF-23`'s avatars.
 *
 * 🛑 EXTRACTED RATHER THAN COPIED, AND THAT IS THE WHOLE POINT OF THIS FUNCTION. Everything the
 * long comment above proves - that the Blob must carry its own `type`, that the explicit header is
 * not enough on its own, and that both are needed because they guard different branches of
 * `RCTNetworking.mm` - is invisible in the three lines below. A second copy written for avatars
 * would have looked correct, typechecked, and uploaded every photo as
 * `application/octet-stream` for the bucket to reject with a 400. There is no test here to catch
 * that: `apps/mobile` has only a `typecheck` script.
 *
 * So there is exactly one place these bytes are sent, deliberately. Read the comment on
 * `uploadPhoto` before changing anything in it.
 */
async function putSignedBytes(
  uploadUrl: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  const raw = await (await fetch(localUri)).blob();
  const blob = new Blob([raw], { type: contentType });
  const res = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'content-type': contentType } });
  // The status is the whole diagnosis when this fails; the callers show a generic French line, so
  // keep it in the message for the next reader of a log or a stack.
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text().catch(() => '')}`);
}

/**
 * `CF-23`. Uploads a profile photo and returns the storage path to PATCH onto the profile.
 *
 * A sibling of `uploadPhoto` rather than a parameter on it, for two reasons that are both about
 * what the two calls MEAN. It signs a different route - `/users/me/avatar/sign`, because the
 * demande one calls `assertClientEnabled` and refuses a réparateur-only account - and it sends no
 * `draftId`, because an avatar belongs to no wizard and there is no draft lifecycle to join. A
 * shared function with an `isAvatar` flag would have to branch on both.
 *
 * Returns the path only. Committing it is `PATCH /users/me/avatar`, kept separate so an upload that
 * succeeds and a profile that fails to save are distinguishable states.
 */
export async function uploadAvatar(localUri: string, contentType: string): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    '/users/me/avatar/sign',
    { contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}

/**
 * `CF-24`. Uploads a réparateur's fiche-publique banner and returns the storage path to PATCH.
 *
 * A THIRD sibling rather than a parameter on either of the others, and the reason has not weakened
 * now that there are three: the routes differ in AUTHORISATION, not merely in destination.
 * `/users/me/banner/sign` refuses an account without réparateur mode, `/users/me/avatar/sign`
 * refuses nobody, and `/demandes/photos/sign` refuses a réparateur-only account - three different
 * answers to « who may call this ». A shared function with a `kind` argument would read as though
 * they were interchangeable, and its one branch would sit in the file whose whole point is that
 * there is exactly ONE place these bytes are sent.
 *
 * Returns the path only. Committing it is `PATCH /users/me/banner`, kept separate so an upload that
 * succeeds and a profile that fails to save are distinguishable states.
 */
export async function uploadBanner(localUri: string, contentType: string): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    '/users/me/banner/sign',
    { contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}

/**
 * CF3-11. Uploads a photo attachment for a chat conversation.
 * Signs the upload URL via POST /conversations/:id/photos/sign, puts bytes,
 * and returns the storage path for sendMessage.
 */
export async function uploadChatPhoto(
  conversationId: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    `/conversations/${conversationId}/photos/sign`,
    { contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}

/**
 * CF4-34. Uploads an attachment (photo or document PDF) for a chat conversation.
 * Signs the upload URL via POST /conversations/:id/attachments/sign, puts bytes,
 * and returns the storage path for sendMessage.
 */
export async function uploadChatAttachment(
  conversationId: string,
  localUri: string,
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf',
): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    `/conversations/${conversationId}/attachments/sign`,
    { contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}

/**
 * CF4-31/34. Uploads an attachment for a dispute space or dispute opening form.
 * Signs the upload URL via POST /commandes/:id/dispute/attachments/sign, puts bytes,
 * and returns the storage path.
 */
export async function uploadDisputeAttachment(
  commandeId: string,
  localUri: string,
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf',
): Promise<string> {
  const { path, uploadUrl } = await api.post<{ path: string; uploadUrl: string }>(
    `/commandes/${commandeId}/dispute/attachments/sign`,
    { contentType },
  );
  await putSignedBytes(uploadUrl, localUri, contentType);
  return path;
}
