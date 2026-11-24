import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ShipmentLeg } from '@revime/shared';
import { shippingDriver } from './config.js';

/** One end of a leg, as the quote needs it. `kind` drives Boxtal's `particulier`/`entreprise`. */
export type Party = { postalCode: string; city: string; kind: 'RESIDENTIAL' | 'BUSINESS' };

/** One carrier service for one leg, as parsed from Boxtal's v1 quote. Prices in cents. */
export type LegOffer = {
  carrierCode: string;
  serviceCode: string;
  carrierLabel: string;
  serviceLabel: string;
  costExclTaxCents: number;
  costInclTaxCents: number;
  /**
   * Boxtal's premium for the declared value on THIS offer, tax-inclusive. NULL when the quote
   * carries no `<insurance>` block for the offer - which the sandbox probe showed means « this
   * service cannot insure that value », and that v3 then silently ignores `insured: true`
   * (spec « Amendment, 2026-09-04 »). `selectLegOffer` refuses such an offer when insurance is
   * requested; nothing downstream may treat null as 0.
   */
  insuranceInclTaxCents: number | null;
  collectionType: string; // DROPOFF_POINT | POST_OFFICE | HOME | COMPANY | …
  deliveryType: string; // PICKUP_POINT | HOME | COMPANY | …
  /** YYYY-MM-DD as Boxtal gives it; stored, never shown. */
  estimatedDeliveryDate: string | null;
};

export type QuoteLegInput = {
  /**
   * Which leg this is. The real driver ignores it (Boxtal sees only two addresses); the fake keys
   * its seeded offers on it, because `from.kind` cannot tell the legs apart when the réparateur is
   * not at the BUSINESS level - both legs are then RESIDENTIAL → RESIDENTIAL.
   */
  leg: ShipmentLeg;
  from: Party;
  to: Party;
  parcel: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number; valueCents: number };
  contentId: string;
  takingOverDate: string;
};

export type OrderAddress = {
  kind: 'RESIDENTIAL' | 'BUSINESS';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string | null;
  street: string;
  additionalInformation: string | null;
  city: string;
  postalCode: string;
};

export type CreateOrderInput = {
  externalId: string;
  shippingOfferCode: string;
  insured: boolean;
  takingOverDate: string;
  from: OrderAddress;
  to: OrderAddress;
  pickupPointCode: string | null;
  parcel: QuoteLegInput['parcel'];
  contentId: string;
  contentDescription: string;
};

export type OrderResult = {
  orderId: string;
  boxtalStatus: string;
  deliveryExclTaxCents: number;
  /**
   * What Boxtal actually applied. The probe saw 0 / null on an insured order whose service
   * could not insure the value, with a 200 - so the orchestration compares this with what the
   * client paid for and mails ops on a mismatch instead of trusting the request it sent.
   */
  insuranceExclTaxCents: number;
};

export type BoxtalDocument = { url: string; type: string; format: string };

export type PackageTracking = {
  status: string;
  isFinal: boolean;
  message: string | null;
  trackingNumber: string | null;
  trackingDateTime: string;
  packageTrackingUrl: string | null;
  history: { status: string; isFinal: boolean; message: string | null; trackingDateTime: string }[];
};

export type ParcelPointResult = {
  code: string;
  network: string;
  name: string;
  address: string;
  distanceM: number | null;
  openingHours: string[];
};

export type BoxtalWebhookEvent = {
  id: string;
  type: 'DOCUMENT_CREATED' | 'TRACKING_CHANGED' | string;
  shippingOrderId: string;
  shipmentExternalId: string | null;
  payload: { documents?: BoxtalDocument[]; trackings?: PackageTracking[] };
};

/** Network, timeout, 5xx: the quote route answers 503 and the app hides the option. */
export class ShippingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippingUnavailableError';
  }
}

/** Boxtal answered 4xx with a reason. `code` is its `errors[].code`, e.g. InvalidPaymentException. */
export class ShippingRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ShippingRefusedError';
  }
}

export interface ShippingGateway {
  /** ALL offers for one leg; selection is `selectLegOffer`'s job. */
  quoteLeg(input: QuoteLegInput): Promise<LegOffer[]>;
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  /** 'too_late' when Boxtal refuses because the carrier has the parcel (400 or 422, spec §3.2). */
  cancelOrder(orderId: string): Promise<'cancelled' | 'too_late'>;
  /** Empty until generated; Boxtal says up to five minutes. */
  getDocuments(orderId: string): Promise<BoxtalDocument[]>;
  /** Empty when Boxtal has no tracking yet. */
  getTracking(orderId: string): Promise<PackageTracking[]>;
  searchParcelPoints(input: { shippingOfferCode: string; postalCode: string; city: string }): Promise<ParcelPointResult[]>;
  /** Null on a missing or wrong signature. Pure local crypto; the fake verifies for real. */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): BoxtalWebhookEvent | null;
  /** The signed label URL. Size-capped; throws ShippingUnavailableError past the cap or on non-2xx. */
  fetchBytes(url: string, maxBytes: number): Promise<Buffer>;
}

/**
 * Shared by both drivers, like `verify()` in payments/gateway.ts: a faked signature check would
 * fake the only thing protecting the route. `x-bxt-signature` = HMAC-SHA256(raw body, secret)
 * encoded as LOWERCASE HEX - established by the sandbox probe on three real Boxtal bodies (spec
 * « Amendment, 2026-09-04 », item (d)), so base64 is deliberately NOT accepted. Constant-time
 * comparison; a header of the wrong length is a mismatch, never an exception.
 */
export function verifyBoxtalSignature(rawBody: Buffer, header: string | undefined, secret: string): BoxtalWebhookEvent | null {
  if (!header || !secret) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.trim().toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.id !== 'string' || typeof parsed.type !== 'string' || typeof parsed.shippingOrderId !== 'string') return null;
  return {
    id: parsed.id,
    type: parsed.type,
    shippingOrderId: parsed.shippingOrderId,
    shipmentExternalId: typeof parsed.shipmentExternalId === 'string' ? parsed.shipmentExternalId : null,
    payload: (parsed.payload ?? {}) as BoxtalWebhookEvent['payload'],
  };
}

/**
 * In-memory gateway for the unit tests. Fabricates NOTHING on its own: a test seeds the offers
 * it expects per leg. Records orders so « ordered exactly once » is assertable.
 */
export class FakeShippingGateway implements ShippingGateway {
  private readonly offersByLeg = new Map<ShipmentLeg | 'ANY', LegOffer[]>();
  private readonly created: (CreateOrderInput & { orderId: string })[] = [];
  private readonly cancelledIds: string[] = [];
  private readonly documents = new Map<string, BoxtalDocument[]>();
  private readonly tracking = new Map<string, PackageTracking[]>();
  private readonly failNext = new Set<keyof ShippingGateway>();
  private readonly secret = 'fake-boxtal-webhook-secret';

  /** Test-only. `leg` lets a test give the return leg a different cheapest carrier. */
  seedOffers(leg: ShipmentLeg | 'ANY', offers: LegOffer[]): void {
    this.offersByLeg.set(leg, offers);
  }
  /** Test-only. Resets AS IT FIRES, like the registry fake. */
  failNextOnce(method: keyof ShippingGateway): void {
    this.failNext.add(method);
  }
  /** Test-only. */
  orders(): readonly (CreateOrderInput & { orderId: string })[] {
    return this.created;
  }
  /** Test-only. */
  cancelled(): readonly string[] {
    return this.cancelledIds;
  }
  /** Test-only. Makes `getDocuments(orderId)` return a LABEL. */
  seedDocument(orderId: string, doc: BoxtalDocument = { url: `https://fake.boxtal.local/${orderId}.pdf`, type: 'LABEL', format: 'PDF_A4' }): void {
    this.documents.set(orderId, [doc]);
  }
  /** Test-only. */
  seedTracking(orderId: string, trackings: PackageTracking[]): void {
    this.tracking.set(orderId, trackings);
  }
  /** Test-only. A correctly signed body for `handleWebhook` tests - hex, like Boxtal's. */
  signedBody(event: BoxtalWebhookEvent): { raw: Buffer; signature: string } {
    const raw = Buffer.from(JSON.stringify(event));
    return { raw, signature: createHmac('sha256', this.secret).update(raw).digest('hex') };
  }

  private trip(method: keyof ShippingGateway): void {
    if (this.failNext.delete(method)) throw new ShippingUnavailableError(`fake ${method} failure for test`);
  }

  async quoteLeg(input: QuoteLegInput): Promise<LegOffer[]> {
    this.trip('quoteLeg');
    return this.offersByLeg.get(input.leg) ?? this.offersByLeg.get('ANY') ?? [];
  }

  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    this.trip('createOrder');
    const orderId = `fakeorder_${randomUUID()}`;
    this.created.push({ ...input, orderId });
    return { orderId, boxtalStatus: 'PENDING', deliveryExclTaxCents: 314, insuranceExclTaxCents: input.insured ? 612 : 0 };
  }

  async cancelOrder(orderId: string): Promise<'cancelled' | 'too_late'> {
    this.trip('cancelOrder');
    this.cancelledIds.push(orderId);
    return 'cancelled';
  }

  async getDocuments(orderId: string): Promise<BoxtalDocument[]> {
    this.trip('getDocuments');
    return this.documents.get(orderId) ?? [];
  }

  async getTracking(orderId: string): Promise<PackageTracking[]> {
    this.trip('getTracking');
    return this.tracking.get(orderId) ?? [];
  }

  async searchParcelPoints(): Promise<ParcelPointResult[]> {
    this.trip('searchParcelPoints');
    return [
      { code: '99439', network: 'MONR', name: 'Tabac de la Gare', address: '3 place Fixture, 69003 Lyon', distanceM: 354, openingHours: ['Lun–Sam 07:00–19:30'] },
      { code: '99440', network: 'MONR', name: 'Pressing du Centre', address: '8 rue Exemple, 69003 Lyon', distanceM: 910, openingHours: [] },
    ];
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): BoxtalWebhookEvent | null {
    return verifyBoxtalSignature(rawBody, signatureHeader, this.secret);
  }

  async fetchBytes(_url: string, _maxBytes: number): Promise<Buffer> {
    this.trip('fetchBytes');
    // A minimal, valid PDF header so a size or magic-number check has something real.
    return Buffer.from('%PDF-1.4\n%fake label\n%%EOF\n');
  }
}

let instance: ShippingGateway | undefined;

/**
 * `boxtal` selects the real driver (Task 8b), everything else the fake - the `STRIPE_DRIVER`
 * convention, and the safe direction: the fake orders nothing and pays nothing. `manual` also
 * gets the fake, and never calls it: every route checks `isShippingQuotesEnabled()` first.
 */
export function shippingGateway(): ShippingGateway {
  if (instance === undefined) {
    instance = shippingDriver() === 'boxtal' ? createBoxtalGateway() : new FakeShippingGateway();
  }
  return instance;
}

/** Test-only. The factory memoises, so a test changing SHIPPING_DRIVER must clear it. */
export function __resetShippingGateway(): void {
  instance = undefined;
}

// Resolved lazily to keep this module free of the real driver's import graph in tests.
let boxtalFactory: (() => ShippingGateway) | undefined;
export function __registerBoxtalGateway(factory: () => ShippingGateway): void {
  boxtalFactory = factory;
}
function createBoxtalGateway(): ShippingGateway {
  if (!boxtalFactory) throw new Error('Boxtal gateway not registered: import shipping/boxtal.gateway.js before selecting SHIPPING_DRIVER=boxtal');
  return boxtalFactory();
}
