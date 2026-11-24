import { z } from 'zod';
import type { CommandeStep } from './commande.schemas.js';
import type { NotificationType } from './notification.schemas.js';

/**
 * Livraison Boxtal, spec §5.1. Five presets with a weight and a box, prefilled from the
 * demande's category (Q1). Every value stays editable; « autre » starts empty.
 */
export const PARCEL_PRESETS = {
  PHONE: { label: 'Téléphone', weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8 },
  TABLET: { label: 'Tablette', weightGrams: 1000, lengthCm: 30, widthCm: 22, heightCm: 6 },
  LAPTOP: { label: 'Ordinateur portable', weightGrams: 3000, lengthCm: 40, widthCm: 30, heightCm: 10 },
  APPLIANCE: { label: 'Petit appareil', weightGrams: 5000, lengthCm: 40, widthCm: 30, heightCm: 30 },
  OTHER: { label: 'Autre', weightGrams: null, lengthCm: null, widthCm: null, heightCm: null },
} as const;
export type ParcelPresetKey = keyof typeof PARCEL_PRESETS;

/** Child slug first, then the root slug, then OTHER. Slugs are the taxonomy's own. */
const PRESET_BY_SLUG: Record<string, ParcelPresetKey> = {
  smartphone: 'PHONE',
  tablette: 'TABLET',
  ordinateur: 'LAPTOP',
  console: 'LAPTOP',
  'petit-electromenager': 'APPLIANCE',
  electromenager: 'APPLIANCE',
};

export function presetForCategory(slug: string, parentSlug: string | null): ParcelPresetKey {
  return PRESET_BY_SLUG[slug] ?? (parentSlug ? PRESET_BY_SLUG[parentSlug] : undefined) ?? 'OTHER';
}

/**
 * Deliberately LOOSE (spec §5.1): Boxtal's own per-carrier limits decide what ships, and an
 * option with no offer is simply absent from the quote. Integers only - grams and centimetres.
 */
export const parcelDetailsSchema = z.object({
  weightGrams: z.number().int().min(100, { message: 'Poids : entre 0,1 et 30 kg.' }).max(30_000, { message: 'Poids : entre 0,1 et 30 kg.' }),
  lengthCm: z.number().int().min(1, { message: 'Dimensions : entre 1 et 150 cm.' }).max(150, { message: 'Dimensions : entre 1 et 150 cm.' }),
  widthCm: z.number().int().min(1, { message: 'Dimensions : entre 1 et 150 cm.' }).max(150, { message: 'Dimensions : entre 1 et 150 cm.' }),
  heightCm: z.number().int().min(1, { message: 'Dimensions : entre 1 et 150 cm.' }).max(150, { message: 'Dimensions : entre 1 et 150 cm.' }),
  valueCents: z.number().int().min(100, { message: 'Valeur : entre 1 € et 5 000 €.' }).max(500_000, { message: 'Valeur : entre 1 € et 5 000 €.' }),
});
export type ParcelDetails = z.infer<typeof parcelDetailsSchema>;

/** Boxtal prices insurance above 1 000 € on quotation only (spec §3.4), so the toggle stops here. */
export const INSURABLE_VALUE_MAX_CENTS = 100_000;

export const parcelOptionSchema = z.enum(['RELAY', 'HOME'], { message: 'Option de livraison invalide.' });
export type ParcelOption = z.infer<typeof parcelOptionSchema>;

export const shippingQuoteRequestSchema = z.object({ parcel: parcelDetailsSchema });
export type ShippingQuoteRequest = z.infer<typeof shippingQuoteRequestSchema>;

/** One leg's carrier and its share of the delivery price the client pays (V7 A9). */
export type ShippingLegPrice = { carrierLabel: string; cents: number };
export type ShippingLegPrices = Record<ShipmentLeg, ShippingLegPrice>;

/**
 * V7 A9 (U8, `DEC7-23` Q1): splits the pair's shown price between the two legs in proportion to
 * each leg's cost incl. tax. The pair price is grossed up and rounded ONCE (`grossUpForStripe`),
 * and grossing each leg up on its own would add up to as much as 10 cents more than what is
 * charged, so the split never re-prices: aller = round(total × aller ÷ (aller + retour)), retour =
 * the rest, and the two always add up to `totalCents`. Throws on anything but non-negative
 * integers, like `grossUpForStripe`.
 */
export function splitShippingByLeg(
  totalCents: number,
  legs: Record<ShipmentLeg, { carrierLabel: string; costInclTaxCents: number }>,
): ShippingLegPrices {
  const out = legs.OUTBOUND.costInclTaxCents;
  const ret = legs.RETURN.costInclTaxCents;
  for (const n of [totalCents, out, ret]) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid shipping amount: ${String(n)}`);
  }
  const outboundCents = out + ret === 0 ? 0 : Math.round((totalCents * out) / (out + ret));
  return {
    OUTBOUND: { carrierLabel: legs.OUTBOUND.carrierLabel, cents: outboundCents },
    RETURN: { carrierLabel: legs.RETURN.carrierLabel, cents: totalCents - outboundCents },
  };
}

/** One carrier pair and its price: both legs, grossed up and rounded (spec §5.2). */
export type ShippingQuotePriceDto = {
  shippingCents: number;
  carrierLabels: { OUTBOUND: string; RETURN: string };
  /**
   * V7 A9: `shippingCents` split per leg (`splitShippingByLeg`). Optional so an app reading an
   * API older than U8 keeps the single « aller-retour » line.
   */
  legPrices?: ShippingLegPrices;
};

/**
 * One delivery option (« Point relais » or « À domicile ») as the payment screen shows it.
 *
 * TWO variants, because insurance is per offer AND per declared value (spec « Amendment,
 * 2026-09-04 »): the cheapest suitable pair may not be able to insure the object, and Boxtal
 * silently ignores `insured` on such an order. So the uninsured price is the cheapest pair, and
 * `insured` is the cheapest pair whose BOTH legs carry a premium for this value - possibly a
 * dearer carrier - with that premium. `insured` is null when the value exceeds
 * INSURABLE_VALUE_MAX_CENTS or when no pair can insure it: the toggle is then not shown, and
 * the server never sells a premium it cannot buy.
 */
export type ShippingQuoteOptionDto = ShippingQuotePriceDto & {
  insured: (ShippingQuotePriceDto & { insuranceCents: number }) | null;
};

export type ShippingQuoteDto = {
  id: string;
  /** ISO string. Guards the START of a checkout only; the price is locked on the row after that. */
  expiresAt: string;
  /** An option is ABSENT when Boxtal returned no usable offer for it. */
  options: Partial<Record<ParcelOption, ShippingQuoteOptionDto>>;
};

export type ShipmentLeg = 'OUTBOUND' | 'RETURN';
export type ShipmentStatus = 'PENDING' | 'ORDERED' | 'LABEL_READY' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'FAILED';

export type ShipmentEventDto = {
  /** Boxtal's status value, stored as text. */
  status: string;
  /** French label from `trackingStatusLabel`, or the raw value when unknown. */
  label: string;
  /** ISO string. */
  occurredAt: string;
};

export type ShipmentDto = {
  leg: ShipmentLeg;
  status: ShipmentStatus;
  carrierLabel: string;
  /** True once the PDF is stored - the « Télécharger l'étiquette » button's condition. */
  labelReady: boolean;
  trackingUrl: string | null;
  latestStatus: string | null;
  events: ShipmentEventDto[];
};

/** The relay where THIS party collects. `network` is Boxtal's network code (MONR, CHRP, …). */
export const parcelPointSchema = z.object({
  code: z.string().trim().min(1, { message: 'Point relais requis.' }).max(40, { message: 'Point relais invalide.' }),
  network: z.string().trim().min(1, { message: 'Point relais invalide.' }).max(40, { message: 'Point relais invalide.' }),
  name: z.string().trim().min(1, { message: 'Point relais invalide.' }).max(120, { message: 'Point relais invalide.' }),
  address: z.string().trim().min(1, { message: 'Point relais invalide.' }).max(200, { message: 'Point relais invalide.' }),
});
export type ParcelPointInput = z.infer<typeof parcelPointSchema>;

export type ParcelPointDto = ParcelPointInput & {
  distanceM: number | null;
  /** One line per day as Boxtal returns them, joined by the server; may be empty. */
  openingHours: string[];
};

/** The relay networks with a searchable point list on Boxtal's v3.2 API (spec §6.3). */
export const PARCEL_POINT_NETWORKS = ['MONR', 'CHRP', 'POFR', 'COPR', 'UPSE'] as const;

/** Boxtal's PackageTrackingStatusEnum, verbatim, in the order its spec lists them (spec §3.2). */
export const BOXTAL_TRACKING_STATUSES = [
  'ANNOUNCED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED_ATTEMPT',
  'REACHED_DELIVERY_PICKUP_POINT',
  'DELIVERED',
  'RETURNED',
  'EXCEPTION',
] as const;
export type BoxtalTrackingStatus = (typeof BOXTAL_TRACKING_STATUSES)[number];

export type TrackingEffect = {
  /** New shipment status, or null to leave it. Never moves DELIVERED backwards (the service enforces). */
  shipment: ShipmentStatus | null;
  notify: NotificationType | null;
  /** True for every status after ANNOUNCED: the first such event advances the sending step (Q3). */
  isScan: boolean;
  opsMail: boolean;
};

const IGNORE: TrackingEffect = { shipment: null, notify: null, isScan: false, opsMail: false };

/** Spec §5.3's table. Total over BOXTAL_TRACKING_STATUSES; `trackingEffectFor` handles the rest. */
export const TRACKING_STATUS_EFFECT: Record<BoxtalTrackingStatus, TrackingEffect> = {
  ANNOUNCED: { shipment: 'LABEL_READY', notify: null, isScan: false, opsMail: false },
  SHIPPED: { shipment: 'IN_TRANSIT', notify: 'PARCEL_SHIPPED', isScan: true, opsMail: false },
  IN_TRANSIT: { shipment: 'IN_TRANSIT', notify: null, isScan: true, opsMail: false },
  OUT_FOR_DELIVERY: { shipment: 'IN_TRANSIT', notify: 'PARCEL_OUT_FOR_DELIVERY', isScan: true, opsMail: false },
  FAILED_ATTEMPT: { shipment: 'IN_TRANSIT', notify: 'PARCEL_INCIDENT', isScan: true, opsMail: false },
  REACHED_DELIVERY_PICKUP_POINT: { shipment: 'IN_TRANSIT', notify: 'PARCEL_AT_PICKUP_POINT', isScan: true, opsMail: false },
  DELIVERED: { shipment: 'DELIVERED', notify: 'PARCEL_DELIVERED', isScan: true, opsMail: false },
  RETURNED: { shipment: 'IN_TRANSIT', notify: 'PARCEL_INCIDENT', isScan: true, opsMail: true },
  EXCEPTION: { shipment: 'IN_TRANSIT', notify: 'PARCEL_INCIDENT', isScan: true, opsMail: true },
};

export function trackingEffectFor(status: string): TrackingEffect {
  return (TRACKING_STATUS_EFFECT as Record<string, TrackingEffect>)[status] ?? IGNORE;
}

/** French labels for the timeline. Unknown values render their raw code. */
export const TRACKING_STATUS_LABEL: Record<BoxtalTrackingStatus, string> = {
  ANNOUNCED: 'Étiquette créée',
  SHIPPED: 'Pris en charge par le transporteur',
  IN_TRANSIT: 'En cours d’acheminement',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  FAILED_ATTEMPT: 'Tentative de livraison échouée',
  REACHED_DELIVERY_PICKUP_POINT: 'Disponible en point relais',
  DELIVERED: 'Livré',
  RETURNED: 'Retourné à l’expéditeur',
  EXCEPTION: 'Incident de livraison',
};

export function trackingStatusLabel(status: string): string {
  return (TRACKING_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

/**
 * The two steps a carrier's first scan may advance (Q3). Receiving steps are deliberately ABSENT:
 * a scan at a relay point is not the object in someone's hands, and those steps protect the money.
 */
export const SCAN_ADVANCES: Record<ShipmentLeg, CommandeStep> = {
  OUTBOUND: 'PARCEL_SENT',
  RETURN: 'RETURN_SENT',
};
