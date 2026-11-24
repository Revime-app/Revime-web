import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCotationParams, parseCotationXml } from '../src/shipping/boxtal-v1.js';
import { ShippingUnavailableError } from '../src/shipping/gateway.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/boxtal/${name}.xml`, import.meta.url), 'utf8');

describe('parseCotationXml', () => {
  it('parses the phone outbound fixture into one LegOffer per <offer>, prices in cents', () => {
    const offers = parseCotationXml(fixture('quote-phone-outbound'));
    // The sandbox capture of 2026-09-04 holds 24 offers; the exact count is the fixture's own.
    expect(offers.length).toBeGreaterThanOrEqual(20);
    const mondial = offers.find((o) => o.carrierCode === 'MONR' && o.deliveryType === 'PICKUP_POINT');
    expect(mondial).toBeDefined();
    expect(mondial!.serviceCode).toBe('CpourToi');
    expect(mondial!.costExclTaxCents).toBe(384);
    expect(mondial!.costInclTaxCents).toBe(461);
    expect(Number.isInteger(mondial!.costInclTaxCents)).toBe(true);
    expect(mondial!.carrierLabel).toBe('Mondial Relay');
    // `collection.type` and `delivery.type` are ELEMENTS with a <code> child in the real XML.
    expect(mondial!.collectionType).toBe('DROPOFF_POINT');
    expect(mondial!.estimatedDeliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads the home-delivery services as HOME or COMPANY doors and the post-office drop-off', () => {
    const offers = parseCotationXml(fixture('quote-phone-outbound'));
    const access = offers.find((o) => o.serviceCode === 'ColissimoAccess');
    expect(access).toMatchObject({ carrierCode: 'POFR', collectionType: 'POST_OFFICE', deliveryType: 'COMPANY', costExclTaxCents: 669, costInclTaxCents: 803 });
  });

  it('carries the insurance premium per offer in cents, and NULL - never 0 - when the XML has no <insurance> block', () => {
    // Spec « Amendment, 2026-09-04 »: a missing block means the service cannot insure that
    // value, and Boxtal silently ignores `insured` on such an order. Null is the honest value.
    const phone = parseCotationXml(fixture('quote-phone-outbound'));
    expect(phone.every((o) => o.insuranceInclTaxCents === 734)).toBe(true);

    const laptop = parseCotationXml(fixture('quote-laptop-outbound'));
    const uninsurable = laptop.filter((o) => o.insuranceInclTaxCents === null).map((o) => o.serviceCode);
    expect(uninsurable).toEqual(['CoprRelaisDomicileNat', 'ColissimoAccess', 'DomicileFrance']);
    expect(laptop.filter((o) => o.insuranceInclTaxCents === 3027).length).toBe(laptop.length - 3);
  });

  it('parses all six fixtures without throwing and never yields a negative or NaN price', () => {
    for (const name of ['phone', 'laptop', 'appliance']) {
      for (const leg of ['outbound', 'return']) {
        const offers = parseCotationXml(fixture(`quote-${name}-${leg}`));
        expect(offers.length).toBeGreaterThan(0);
        for (const o of offers) {
          expect(o.costInclTaxCents).toBeGreaterThanOrEqual(0);
          expect(Number.isNaN(o.costExclTaxCents)).toBe(false);
          expect(o.carrierCode.length).toBeGreaterThan(0);
          expect(o.serviceCode.length).toBeGreaterThan(0);
          expect(o.collectionType.length).toBeGreaterThan(0);
          expect(o.deliveryType.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('throws ShippingUnavailableError on a body with no <cotation>, never returns []', () => {
    // [] would read as « nothing ships », which is a worse lie than an outage.
    expect(() => parseCotationXml('<html>502 Bad Gateway</html>')).toThrow(ShippingUnavailableError);
    expect(() => parseCotationXml('')).toThrow(ShippingUnavailableError);
  });
});

describe('buildCotationParams', () => {
  it("sends the probe's exact parameter names, kg with three decimals, cm as integers", () => {
    const p = buildCotationParams({
      leg: 'OUTBOUND',
      from: { postalCode: '75011', city: 'Paris', kind: 'RESIDENTIAL' },
      to: { postalCode: '69003', city: 'Lyon', kind: 'BUSINESS' },
      parcel: { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 },
      contentId: 'content:v1:50113',
      takingOverDate: '2026-09-08',
    });
    expect(p.get('expediteur.type')).toBe('particulier');
    expect(p.get('destinataire.type')).toBe('entreprise');
    expect(p.get('expediteur.code_postal')).toBe('75011');
    expect(p.get('destinataire.ville')).toBe('Lyon');
    expect(p.get('colis_1.poids')).toBe('0.500');
    expect(p.get('colis_1.longueur')).toBe('20');
    expect(p.get('code_contenu')).toBe('50113');
    expect(p.get('colis.valeur')).toBe('300');
    expect(p.get('assurance.selection')).toBe('true');
    expect(p.get('collecte')).toBe('2026-09-08');
    expect(p.get('delai')).toBe('aucun');
    // Boxtal wants a street on both ends for a quote; we hold none before payment, so a
    // fixed placeholder is sent - the price depends on the postal code, not the street.
    expect(p.get('expediteur.adresse')).toBe('1 rue');
  });
});
