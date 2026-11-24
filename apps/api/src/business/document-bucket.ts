import { attachmentBucket } from '../storage/attachment-paths.js';

/**
 * V7 A4 (`DEC7-07`). Business verification documents (registration proof, RC Pro) get their own
 * private bucket, configured in Supabase for `application/pdf`, `image/jpeg` and `image/png` up to
 * 10 MB, the same set `BusinessService.signDocumentUpload` accepts.
 *
 * They used to go to `attachments`, which is PDF-only at the Supabase level because conversation
 * attachments route images to the photo bucket (`bucketFor`). So every JPEG or PNG the app offered
 * was refused by storage with a 400 (the client's 13 KB PNG, 2026-10-27 20:58:57 UTC). Widening
 * `attachments` instead would have changed what conversation uploads may store.
 *
 * 🛑 The bucket must exist in Supabase BEFORE this code is deployed, or every upload is refused
 * and the dashboard cannot sign a document.
 */
export function businessDocumentBucket(): string {
  return process.env.BUSINESS_DOCUMENT_BUCKET ?? 'business-documents';
}

/**
 * Where the documents submitted before V7 A4 are stored (three PDFs in production on 2026-10-28).
 * Read-only: the dashboard falls back to it for a path the new bucket does not hold, so those
 * documents stay readable without being moved.
 */
export function legacyBusinessDocumentBucket(): string {
  return attachmentBucket();
}
