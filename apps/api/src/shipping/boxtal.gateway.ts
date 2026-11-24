import { boxtalEnv } from './config.js';
import { buildCotationParams, parseCotationXml } from './boxtal-v1.js';
import { buildOrderBody, mapOrderResult, mapParcelPoint, mapTracking } from './boxtal-v3.js';
import {
  __registerBoxtalGateway,
  ShippingRefusedError,
  ShippingUnavailableError,
  verifyBoxtalSignature,
  type BoxtalDocument,
  type BoxtalWebhookEvent,
  type CreateOrderInput,
  type LegOffer,
  type OrderResult,
  type PackageTracking,
  type ParcelPointResult,
  type QuoteLegInput,
  type ShippingGateway,
} from './gateway.js';

const QUOTE_TIMEOUT_MS = 8000; // the spike measured 3 to 6 s per leg
const ORDER_TIMEOUT_MS = 10_000; // the probe measured ~0.8 to 1.2 s per v3 call

const basic = (k: string, s: string) => 'Basic ' + Buffer.from(`${k}:${s}`).toString('base64');

/**
 * The real driver (spec §6.4). Two APIs: v1 XML for quotes with its own key pair, v3 JSON for
 * everything else. Every non-2xx becomes a typed error; nothing raw crosses the module boundary.
 * Response shapes are the ones the sandbox returned on 2026-09-04 (mapped in boxtal-v3.ts).
 */
export class BoxtalShippingGateway implements ShippingGateway {
  private readonly env = boxtalEnv();

  private async v3<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
    let res: Response;
    try {
      res = await fetch(`${this.env.v3Base}${path}`, {
        method,
        headers: {
          Authorization: basic(this.env.v3Key, this.env.v3Secret),
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(ORDER_TIMEOUT_MS),
      });
    } catch (e) {
      throw new ShippingUnavailableError(`boxtal v3 ${method} ${path}: ${String(e)}`);
    }
    const textBody = await res.text();
    let json: T;
    try {
      json = (textBody ? JSON.parse(textBody) : {}) as T;
    } catch {
      throw new ShippingUnavailableError(`boxtal v3 ${path} -> ${res.status}, non-JSON body`);
    }
    if (res.status >= 500) throw new ShippingUnavailableError(`boxtal v3 ${path} -> ${res.status}`);
    if (res.status >= 400) {
      // 422 bodies: { errors: [{ code, parameters }] } - e.g. RequestValidationException with
      // parameters.field = shipment.pickupPointCode, or InvalidRequestException with null.
      const errors = (json as { errors?: { code?: string; parameters?: unknown }[] }).errors ?? [];
      const first = errors[0];
      throw new ShippingRefusedError(first?.code ?? `HTTP_${res.status}`, JSON.stringify(first?.parameters ?? textBody).slice(0, 500));
    }
    return { status: res.status, json };
  }

  async quoteLeg(input: QuoteLegInput): Promise<LegOffer[]> {
    let res: Response;
    try {
      res = await fetch(`${this.env.v1Base}/cotation?${buildCotationParams(input).toString()}`, {
        headers: { Authorization: basic(this.env.v1Key, this.env.v1Secret), Accept: 'application/xml' },
        signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
      });
    } catch (e) {
      throw new ShippingUnavailableError(`boxtal v1 cotation: ${String(e)}`);
    }
    if (!res.ok) throw new ShippingUnavailableError(`boxtal v1 cotation -> ${res.status}`);
    return parseCotationXml(await res.text());
  }

  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const { json } = await this.v3<{ content?: unknown }>('POST', '/shipping/v3.1/shipping-order', buildOrderBody(input));
    return mapOrderResult(json.content);
  }

  async cancelOrder(orderId: string): Promise<'cancelled' | 'too_late'> {
    try {
      await this.v3('DELETE', `/shipping/v3.1/shipping-order/${encodeURIComponent(orderId)}`);
      return 'cancelled';
    } catch (e) {
      // The probe saw 422 InvalidRequestException on a repeated cancel; the guide says 400 once
      // the carrier has the parcel. Both mean « too late » here.
      if (e instanceof ShippingRefusedError) return 'too_late';
      throw e;
    }
  }

  async getDocuments(orderId: string): Promise<BoxtalDocument[]> {
    try {
      const { json } = await this.v3<{ content?: Record<string, unknown>[] }>('GET', `/shipping/v3.1/shipping-order/${encodeURIComponent(orderId)}/shipping-document`);
      return (json.content ?? []).map((d) => ({ url: String(d.url ?? ''), type: String(d.type ?? ''), format: String(d.format ?? '') }));
    } catch (e) {
      if (e instanceof ShippingRefusedError && e.code === 'NoShippingDocumentException') return [];
      throw e;
    }
  }

  async getTracking(orderId: string): Promise<PackageTracking[]> {
    try {
      const { json } = await this.v3<{ content?: unknown[] }>('GET', `/shipping/v3.1/shipping-order/${encodeURIComponent(orderId)}/tracking`);
      return (json.content ?? []).map(mapTracking);
    } catch (e) {
      if (e instanceof ShippingRefusedError && e.code === 'NoPackageTrackingFoundException') return [];
      throw e;
    }
  }

  async searchParcelPoints(input: { shippingOfferCode: string; postalCode: string; city: string }): Promise<ParcelPointResult[]> {
    const q = new URLSearchParams({
      shippingOfferCode: input.shippingOfferCode,
      operationType: 'ARRIVAL',
      countryIsoCode: 'FR',
      postalCode: input.postalCode,
      city: input.city,
    });
    const { json } = await this.v3<{ content?: unknown[] }>('GET', `/shipping/v3.2/parcel-point-by-shipping-offer?${q}`);
    const fallbackNetwork = input.shippingOfferCode.split('-')[0] ?? '';
    return (json.content ?? []).slice(0, 15).map((p) => mapParcelPoint(p, fallbackNetwork));
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): BoxtalWebhookEvent | null {
    return verifyBoxtalSignature(rawBody, signatureHeader, this.env.webhookSecret);
  }

  async fetchBytes(url: string, maxBytes: number): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(ORDER_TIMEOUT_MS) });
    } catch (e) {
      throw new ShippingUnavailableError(`label fetch: ${String(e)}`);
    }
    if (!res.ok) throw new ShippingUnavailableError(`label fetch -> ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new ShippingUnavailableError(`label too large: ${buf.length} bytes`);
    return buf;
  }
}

__registerBoxtalGateway(() => new BoxtalShippingGateway());
