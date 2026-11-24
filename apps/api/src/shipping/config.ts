import { isStorageConfigured } from '../storage/gateway.js';

export type ShippingDriver = 'manual' | 'boxtal' | 'fake';

/**
 * The single reader of SHIPPING_DRIVER. Absent or unrecognised is `manual`: today's flat
 * 19 € and the operator's tracking form, byte-for-byte. `fake` is selected by the factory for
 * the test suite and never enables quoting on its own (spec §6.2).
 */
export function shippingDriver(): ShippingDriver {
  const v = process.env.SHIPPING_DRIVER;
  return v === 'boxtal' || v === 'fake' ? v : 'manual';
}

export function boxtalEnv() {
  return {
    v1Base: process.env.BOXTAL_V1_BASE ?? 'https://www.envoimoinscher.com/api/v1',
    v3Base: process.env.BOXTAL_V3_BASE ?? 'https://api.boxtal.com',
    v1Key: process.env.BOXTAL_V1_ACCESS_KEY ?? '',
    v1Secret: process.env.BOXTAL_V1_SECRET_KEY ?? '',
    v3Key: process.env.BOXTAL_V3_ACCESS_KEY ?? '',
    v3Secret: process.env.BOXTAL_V3_SECRET_KEY ?? '',
    webhookSecret: process.env.BOXTAL_WEBHOOK_SECRET ?? '',
  };
}

/** The second private bucket (spec §6.5). Created by hand through the Supabase MCP; PDF only. */
export function shippingLabelBucket(): string {
  return process.env.SHIPPING_LABEL_BUCKET ?? 'shipping-labels';
}

/**
 * True only when the driver is `boxtal` AND every credential is present AND storage is
 * configured. A half-configured integration reads as OFF - the same shape as
 * `arePaymentsEnabled()`, for the same reason: a quote we cannot order, or a label we cannot
 * store, is worse than the flat price.
 *
 * Surfaced to the app as `MeResponse.shippingQuotesEnabled`, so the parcel step renders only
 * when the server will answer it.
 */
export function isShippingQuotesEnabled(): boolean {
  if (shippingDriver() !== 'boxtal') return false;
  const e = boxtalEnv();
  if (!e.v1Key || !e.v1Secret || !e.v3Key || !e.v3Secret || !e.webhookSecret) return false;
  return isStorageConfigured();
}
