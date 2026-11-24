import { ShippingUnavailableError, type CreateOrderInput, type OrderResult, type PackageTracking, type ParcelPointResult } from './gateway.js';

/**
 * Pure mappers for Boxtal's v3 JSON, kept apart from the HTTP driver so they are tested against
 * the responses the sandbox actually returned on 2026-09-04 (test/fixtures/boxtal/*.json) rather
 * than against the field names the plan first guessed.
 */

type Node = Record<string, unknown>;
const obj = (v: unknown): Node => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Node) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** `{ value: 6.69, currency: 'EUR' }` → 669; anything else (null on an uninsured order) → 0. */
export const moneyToCents = (money: unknown): number => {
  const v = obj(money).value;
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : 0;
};

/** The request body `POST /shipping/v3.1/shipping-order` accepted in the sandbox (probe items a, b, c, f). */
export function buildOrderBody(input: CreateOrderInput): Record<string, unknown> {
  const address = (a: CreateOrderInput['from']) => ({
    type: a.kind,
    contact: {
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone,
      ...(a.company ? { company: a.company } : {}),
    },
    location: { street: a.street, city: a.city, postalCode: a.postalCode, countryIsoCode: 'FR' },
    ...(a.additionalInformation ? { additionalInformation: a.additionalInformation } : {}),
  });
  return {
    insured: input.insured,
    labelType: 'PDF_A4',
    shippingOfferCode: input.shippingOfferCode,
    expectedTakingOverDate: input.takingOverDate,
    shipment: {
      externalId: input.externalId,
      fromAddress: address(input.from),
      toAddress: address(input.to),
      ...(input.pickupPointCode ? { pickupPointCode: input.pickupPointCode } : {}),
      packages: [
        {
          type: 'PARCEL',
          externalId: input.externalId,
          weight: input.parcel.weightGrams / 1000,
          length: input.parcel.lengthCm,
          width: input.parcel.widthCm,
          height: input.parcel.heightCm,
          value: { value: input.parcel.valueCents / 100, currency: 'EUR' },
          content: { id: input.contentId, description: input.contentDescription },
        },
      ],
    },
  };
}

/** `content` of the order response. Throws without an id: an order we cannot name cannot be tracked or cancelled. */
export function mapOrderResult(content: unknown): OrderResult {
  const c = obj(content);
  const id = str(c.id);
  if (!id) throw new ShippingUnavailableError('order response without content.id');
  return {
    orderId: id,
    boxtalStatus: str(c.status) ?? 'UNKNOWN',
    deliveryExclTaxCents: moneyToCents(c.deliveryPriceExclTax),
    insuranceExclTaxCents: moneyToCents(c.insurancePriceExclTax),
  };
}

export function mapTracking(t: unknown): PackageTracking {
  const n = obj(t);
  const hist = Array.isArray(n.history) ? n.history.map(obj) : [];
  return {
    status: str(n.status) ?? '',
    isFinal: Boolean(n.isFinal),
    message: str(n.message),
    trackingNumber: str(n.trackingNumber),
    trackingDateTime: str(n.trackingDateTime) ?? '',
    packageTrackingUrl: str(n.packageTrackingUrl),
    history: hist.map((h) => ({
      status: str(h.status) ?? '',
      isFinal: Boolean(h.isFinal),
      message: str(h.message),
      trackingDateTime: str(h.trackingDateTime) ?? '',
    })),
  };
}

const DAY_FR: Record<string, string> = {
  MONDAY: 'Lun',
  TUESDAY: 'Mar',
  WEDNESDAY: 'Mer',
  THURSDAY: 'Jeu',
  FRIDAY: 'Ven',
  SATURDAY: 'Sam',
  SUNDAY: 'Dim',
};

/**
 * One item of `GET /shipping/v3.2/parcel-point-by-shipping-offer`'s `content[]`, as captured:
 * `{ distanceFromSearchLocation, parcelPoint: { code, name, compatibleNetworks[], location{street,
 * city, postalCode, …}, openingDays{ MONDAY: [{openingTime, closingTime}], … } } }`. The network is
 * the prefix of the first compatible network (`MONR_NETWORK` → `MONR`), or the offer's own carrier.
 */
export function mapParcelPoint(item: unknown, fallbackNetwork: string): ParcelPointResult {
  const it = obj(item);
  const pp = obj(it.parcelPoint);
  const loc = obj(pp.location);
  const nets = Array.isArray(pp.compatibleNetworks) ? pp.compatibleNetworks.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const network = nets[0]?.split('_')[0] || fallbackNetwork;
  const cityLine = [str(loc.postalCode), str(loc.city)].filter(Boolean).join(' ');
  const address = [str(loc.street), cityLine.length > 0 ? cityLine : null].filter(Boolean).join(', ');
  const days = obj(pp.openingDays);
  const openingHours = Object.keys(DAY_FR).flatMap((day) => {
    const periods = Array.isArray(days[day]) ? days[day].map(obj) : [];
    const spans = periods.map((p) => `${str(p.openingTime) ?? '?'}–${str(p.closingTime) ?? '?'}`);
    return spans.length > 0 ? [`${DAY_FR[day]} ${spans.join(' / ')}`] : [];
  });
  const distance = it.distanceFromSearchLocation;
  return {
    code: str(pp.code) ?? '',
    network,
    name: str(pp.name) ?? '',
    address,
    distanceM: typeof distance === 'number' && Number.isFinite(distance) ? Math.round(distance) : null,
    openingHours,
  };
}
