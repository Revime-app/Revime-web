import { attachmentBucket } from './attachment-paths.js';
import { PHOTO_BUCKET } from './photo-paths.js';
import { businessDocumentBucket } from '../business/document-bucket.js';
import { shippingLabelBucket } from '../shipping/config.js';

/**
 * The private Supabase Storage buckets the API writes to. Until 25/11/2026 they were created by
 * hand; on the deployment from the copy (new Supabase project) the API makes sure they exist at
 * start-up: it lists the buckets and creates only the missing ones, all PRIVATE (every read goes
 * through a short-lived signed URL). Idempotent, never throws, logs what it did.
 * Supabase accepts the new `sb_secret_…` keys in `Authorization` when it equals `apikey`.
 */
// Same value as LEGAL_DOCUMENT_BUCKET (legal/legal-documents.service.ts), not imported to keep
// this start-up helper free of the database layer.
const LEGAL_DOCUMENT_BUCKET = 'legal-documents';

export function requiredBuckets(): string[] {
  return [...new Set([PHOTO_BUCKET, attachmentBucket(), businessDocumentBucket(), LEGAL_DOCUMENT_BUCKET, shippingLabelBucket()])];
}

export async function ensureStorageBuckets(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.STORAGE_DRIVER !== 'supabase' || !url || !key) return [];
  const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };
  const created: string[] = [];
  try {
    const res = await fetchImpl(`${url}/storage/v1/bucket`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[storage] could not list buckets: HTTP ${res.status}`);
      return [];
    }
    const existing = new Set(((await res.json()) as { id?: string; name?: string }[]).map((b) => b.id ?? b.name));
    for (const name of requiredBuckets()) {
      if (existing.has(name)) continue;
      const r = await fetchImpl(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: name, name, public: false }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) created.push(name);
      else console.warn(`[storage] bucket ${name} not created: HTTP ${r.status}`);
    }
    console.log(`[storage] buckets ok${created.length ? ` (created: ${created.join(', ')})` : ''}`);
  } catch (e) {
    console.warn('[storage] could not check the buckets:', String(e));
  }
  return created;
}
