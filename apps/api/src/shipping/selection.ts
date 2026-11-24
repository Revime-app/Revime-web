import { PARCEL_POINT_NETWORKS, type ParcelOption } from '@revime/shared';
import type { LegOffer } from './gateway.js';

const DROP_OFF = new Set(['DROPOFF_POINT', 'POST_OFFICE']);
const DOOR = new Set(['HOME', 'COMPANY']);
const SEARCHABLE = new Set<string>(PARCEL_POINT_NETWORKS);

export type SelectionOptions = {
  /**
   * Spec « Amendment, 2026-09-04 »: when the client chose insurance, only an offer whose quote
   * carries a positive premium for the declared value may be selected - Boxtal silently ignores
   * `insured` on the others, and we would be charging for cover that was never bought.
   */
  insured?: boolean;
};

/**
 * Spec §6.3, deterministic and server-side. Keep drop-off collections only (the sender always
 * drops the parcel off - Q2); RELAY keeps pickup-point deliveries on a network whose relay list
 * we can search; HOME keeps door deliveries. Cheapest tax-inclusive wins; ties break on the
 * earliest delivery date, then the service code, so the same XML always yields the same offer.
 */
export function selectLegOffer(offers: readonly LegOffer[], option: ParcelOption, opts: SelectionOptions = {}): LegOffer | null {
  const kept = offers.filter((o) => {
    if (!DROP_OFF.has(o.collectionType)) return false;
    if (opts.insured && !(o.insuranceInclTaxCents !== null && o.insuranceInclTaxCents > 0)) return false;
    return option === 'RELAY'
      ? o.deliveryType === 'PICKUP_POINT' && SEARCHABLE.has(o.carrierCode)
      : DOOR.has(o.deliveryType);
  });
  if (kept.length === 0) return null;
  return [...kept].sort(
    (a, b) =>
      a.costInclTaxCents - b.costInclTaxCents ||
      (a.estimatedDeliveryDate ?? '9999').localeCompare(b.estimatedDeliveryDate ?? '9999') ||
      a.serviceCode.localeCompare(b.serviceCode),
  )[0]!;
}
