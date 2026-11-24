import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapOrderResult, mapParcelPoint, mapTracking } from '../src/shipping/boxtal-v3.js';
import { ShippingUnavailableError } from '../src/shipping/gateway.js';

const json = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/boxtal/${name}.json`, import.meta.url), 'utf8')) as T;

/**
 * Every fixture here is a real sandbox response captured on 2026-09-04 (spec « Amendment »),
 * so these tests pin the mapping to Boxtal's actual field names - the plan's first guess at
 * them (`network`, `distance`, an `openingDays` array) was wrong on all three.
 */
describe('mapParcelPoint', () => {
  const body = json<{ content: Record<string, unknown>[] }>('parcel-points-lyon-monr');

  it('reads code, name, address and distance from the v3.2 parcel-point-by-shipping-offer shape', () => {
    const first = mapParcelPoint(body.content[0]!, 'MONR');
    expect(first).toEqual({
      code: '21042',
      network: 'MONR',
      name: 'LOCKER LAVERIE SPEED QUEEN PART',
      address: '161BIS RUE PAUL BERT, 69003 LYON',
      distanceM: 346,
      openingHours: ['Lun 06:00–21:00', 'Mar 06:00–21:00', 'Mer 06:00–21:00', 'Jeu 06:00–21:00', 'Ven 06:00–21:00', 'Sam 06:00–21:00', 'Dim 06:00–21:00'],
    });
  });

  it('derives the network from compatibleNetworks and falls back to the offer carrier when absent', () => {
    expect(mapParcelPoint({ parcelPoint: { code: 'x', name: 'n', compatibleNetworks: ['CHRP_NETWORK'], location: {} } }, 'MONR').network).toBe('CHRP');
    expect(mapParcelPoint({ parcelPoint: { code: 'x', name: 'n', location: {} } }, 'MONR').network).toBe('MONR');
  });

  it('omits closed days and joins several periods of one day', () => {
    const p = mapParcelPoint(
      {
        distanceFromSearchLocation: 12.7,
        parcelPoint: {
          code: '1',
          name: 'Tabac',
          location: { street: '3 place Fixture', postalCode: '69003', city: 'Lyon' },
          openingDays: { MONDAY: [], TUESDAY: [{ openingTime: '09:00', closingTime: '12:00' }, { openingTime: '14:00', closingTime: '19:00' }] },
        },
      },
      'MONR',
    );
    expect(p.openingHours).toEqual(['Mar 09:00–12:00 / 14:00–19:00']);
    expect(p.distanceM).toBe(13);
  });

  it('every point in the captured page maps to a non-empty code, name, network and a « street, postcode city » address', () => {
    // The search was for 69003 Lyon, but Boxtal's page reaches into neighbouring postcodes and
    // spells cities its own way, so the assertion is on the SHAPE the mapper builds, not on the
    // geography of one capture.
    for (const item of body.content) {
      const p = mapParcelPoint(item, 'MONR');
      expect(p.code.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.address).toMatch(/^.+, \d{5} \S/);
      expect(p.network).toBe('MONR');
    }
  });
});

describe('mapTracking', () => {
  it('maps the captured ANNOUNCED tracking with its tracking number, URL and one-entry history', () => {
    const body = json<{ content: Record<string, unknown>[] }>('tracking-announced');
    const t = mapTracking(body.content[0]!);
    expect(t).toEqual({
      status: 'ANNOUNCED',
      isFinal: false,
      message: 'Envoi préparé',
      trackingNumber: 'CR260904000000000OIN',
      trackingDateTime: '2026-09-04 00:00:00',
      packageTrackingUrl: 'https://www.laposte.fr/outils/suivre-vos-envois?code=CR260904000000000OIN1',
      history: [{ status: 'ANNOUNCED', isFinal: false, message: 'Envoi préparé', trackingDateTime: '2026-09-04 00:00:00' }],
    });
  });

  it('maps the trackings inside a captured TRACKING_CHANGED webhook, newest history entry first as Boxtal sends it', () => {
    const event = json<{ payload: { trackings: Record<string, unknown>[] } }>('webhook-tracking-changed');
    const t = mapTracking(event.payload.trackings[0]!);
    expect(t.history).toHaveLength(2);
    expect(t.history[0]!.message).toContain('prêt à être expédié');
    expect(t.trackingNumber).toBe('CR260904000000000OIN');
  });
});

describe('mapOrderResult', () => {
  it('maps the captured order with both prices in cents', () => {
    const body = json<{ content: Record<string, unknown> }>('order-confirmed');
    expect(mapOrderResult(body.content)).toEqual({
      orderId: '2609041630POFR4ZV6FR',
      boxtalStatus: 'CONFIRMED',
      deliveryExclTaxCents: 669,
      insuranceExclTaxCents: 635,
    });
  });

  it('a null insurance price maps to 0 - what the probe saw on an insured order Boxtal could not insure', () => {
    expect(mapOrderResult({ id: 'o', status: 'PENDING', deliveryPriceExclTax: { value: 9.98, currency: 'EUR' }, insurancePriceExclTax: null }).insuranceExclTaxCents).toBe(0);
  });

  it('throws ShippingUnavailableError when the response has no order id', () => {
    expect(() => mapOrderResult({ status: 'PENDING' })).toThrow(ShippingUnavailableError);
  });
});
