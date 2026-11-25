import { boxtalEnv, shippingDriver } from './config.js';

/**
 * Boxtal tells the API when a label is ready (DOCUMENT_CREATED) and when a parcel moves
 * (TRACKING_CHANGED), through two webhook subscriptions made with the SAME v3 application whose
 * keys are set (Boxtal only sends an application the events of its own orders). The secret is
 * ours: we choose it (BOXTAL_WEBHOOK_SECRET) and Boxtal signs each call with it.
 *
 * Before 25/11/2026 the subscriptions were created by hand with a script kept outside the repo.
 * On the deployment from the copy, the API makes sure they exist at start-up: it lists the
 * account's subscriptions and creates only the missing ones, for `${PUBLIC_API_URL}/api/v1/shipping/webhook`.
 * Idempotent, never throws (a Boxtal outage must not stop the API), logs what it did.
 * API reference: Boxtal v3 « Managing event subscriptions » (POST/GET /shipping/v3.1/subscription).
 */
export const BOXTAL_EVENTS = ['DOCUMENT_CREATED', 'TRACKING_CHANGED'] as const;

type Sub = { eventType?: string; callbackUrl?: string };

export async function ensureBoxtalSubscriptions(fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const env = boxtalEnv();
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, '');
  if (shippingDriver() !== 'boxtal' || !env.v3Key || !env.v3Secret || !env.webhookSecret || !base) return [];
  const callbackUrl = `${base}/api/v1/shipping/webhook`;
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${env.v3Key}:${env.v3Secret}`).toString('base64'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const created: string[] = [];
  try {
    const res = await fetchImpl(`${env.v3Base}/shipping/v3.1/subscription`, { headers, signal: AbortSignal.timeout(10_000) });
    const body: unknown = res.ok ? await res.json() : [];
    const list: Sub[] = Array.isArray(body) ? body : Array.isArray((body as { content?: unknown })?.content) ? (body as { content: Sub[] }).content : [];
    for (const eventType of BOXTAL_EVENTS) {
      if (list.some((s) => s.eventType === eventType && s.callbackUrl === callbackUrl)) continue;
      const r = await fetchImpl(`${env.v3Base}/shipping/v3.1/subscription`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ eventType, callbackUrl, webhookSecret: env.webhookSecret }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) created.push(eventType);
      else console.warn(`[boxtal] subscription ${eventType} refused: HTTP ${r.status}`);
    }
    console.log(`[boxtal] subscriptions ok for ${callbackUrl}${created.length ? ` (created: ${created.join(', ')})` : ''}`);
  } catch (e) {
    console.warn('[boxtal] could not check the webhook subscriptions:', String(e));
  }
  return created;
}
