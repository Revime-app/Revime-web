import { XMLParser } from 'fast-xml-parser';
import { v1ContentCode } from './content-codes.js';
import { ShippingUnavailableError, type LegOffer, type QuoteLegInput } from './gateway.js';

/**
 * Boxtal's XML API v1 - « officiellement dépréciée », and the ONLY quote endpoint (spec §3.3):
 * v3 has none and its guide points here. Parameter names are the probe's, exercised against the
 * sandbox on 2026-09-04 (six 200s, fixtures under test/fixtures/boxtal).
 *
 * `adresse` is a fixed placeholder: a quote runs BEFORE payment, when we hold postal codes only,
 * and Boxtal prices by postal code. The order (v3) carries the real street.
 */
export function buildCotationParams(input: QuoteLegInput): URLSearchParams {
  const kind = (k: 'RESIDENTIAL' | 'BUSINESS') => (k === 'BUSINESS' ? 'entreprise' : 'particulier');
  return new URLSearchParams({
    'expediteur.pays': 'FR',
    'expediteur.code_postal': input.from.postalCode,
    'expediteur.ville': input.from.city,
    'expediteur.type': kind(input.from.kind),
    'expediteur.adresse': '1 rue',
    'destinataire.pays': 'FR',
    'destinataire.code_postal': input.to.postalCode,
    'destinataire.ville': input.to.city,
    'destinataire.type': kind(input.to.kind),
    'destinataire.adresse': '1 rue',
    'colis_1.poids': (input.parcel.weightGrams / 1000).toFixed(3),
    'colis_1.longueur': String(input.parcel.lengthCm),
    'colis_1.largeur': String(input.parcel.widthCm),
    'colis_1.hauteur': String(input.parcel.heightCm),
    code_contenu: v1ContentCode(input.contentId),
    collecte: input.takingOverDate,
    delai: 'aucun',
    'colis.valeur': String(Math.round(input.parcel.valueCents / 100)),
    'assurance.selection': 'true',
  });
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

type Node = Record<string, unknown>;
const obj = (v: unknown): Node => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Node) : {});
const text = (v: unknown): string | null => {
  if (typeof v === 'string') return v.length > 0 ? v : null;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && '#text' in (v as Node)) return text((v as Node)['#text']);
  return null;
};
/** « 3.78 » or « 3,78 » → 378. Throws on garbage: a wrong price is money. */
const cents = (v: unknown, what: string): number => {
  const s = text(v);
  if (s === null) throw new ShippingUnavailableError(`${what} missing in cotation`);
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new ShippingUnavailableError(`unparseable ${what}: ${s}`);
  return Math.round(n * 100);
};

/**
 * One <offer> → one LegOffer. Written against the six captured fixtures, not against memory:
 * offers sit under `cotation > shipment > offer`, `collection.type` and `delivery.type` are
 * elements with a `<code>` child, and `<insurance>` is simply ABSENT on a service that cannot
 * insure the declared value (spec « Amendment, 2026-09-04 ») - hence null, never 0.
 *
 * Throws rather than returning [] on an unrecognised body: [] reads as « nothing ships ».
 */
export function parseCotationXml(xml: string): LegOffer[] {
  if (!xml || !xml.includes('<cotation')) throw new ShippingUnavailableError('cotation body unrecognised');
  const doc = obj(parser.parse(xml));
  const cotation = obj(doc.cotation);
  const shipment = obj(cotation.shipment);
  const rawOffers = shipment.offer ?? cotation.offer;
  if (rawOffers === undefined) throw new ShippingUnavailableError('cotation has no offers element');
  const list = (Array.isArray(rawOffers) ? rawOffers : [rawOffers]).map(obj);

  return list.map((o) => {
    const operator = obj(o.operator);
    const service = obj(o.service);
    const price = obj(o.price);
    const collection = obj(o.collection);
    const delivery = obj(o.delivery);
    const insurance = o.insurance === undefined ? null : obj(o.insurance);
    const carrierCode = text(operator.code);
    const serviceCode = text(service.code);
    if (!carrierCode || !serviceCode) throw new ShippingUnavailableError('offer without operator/service code');
    const insuranceText = insurance ? text(insurance['tax-inclusive']) : null;
    return {
      carrierCode,
      serviceCode,
      carrierLabel: text(operator.label) ?? carrierCode,
      serviceLabel: text(service.label) ?? serviceCode,
      costExclTaxCents: cents(price['tax-exclusive'], 'price HT'),
      costInclTaxCents: cents(price['tax-inclusive'], 'price TTC'),
      insuranceInclTaxCents: insuranceText === null ? null : cents(insuranceText, 'insurance TTC'),
      collectionType: text(obj(collection.type).code) ?? text(collection.type) ?? '',
      deliveryType: text(obj(delivery.type).code) ?? text(delivery.type) ?? '',
      estimatedDeliveryDate: text(delivery.date),
    };
  });
}
