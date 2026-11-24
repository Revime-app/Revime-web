import { describe, expect, it } from 'vitest';
import {
  BOXTAL_TRACKING_STATUSES,
  INSURABLE_VALUE_MAX_CENTS,
  PARCEL_PRESETS,
  parcelDetailsSchema,
  parcelPointSchema,
  presetForCategory,
  SCAN_ADVANCES,
  shippingQuoteRequestSchema,
  TRACKING_STATUS_EFFECT,
  trackingEffectFor,
} from '@revime/shared';

describe('presetForCategory', () => {
  it('keys on the CHILD slug first, then the root, then OTHER', () => {
    expect(presetForCategory('smartphone', 'electronique')).toBe('PHONE');
    expect(presetForCategory('tablette', 'electronique')).toBe('TABLET');
    expect(presetForCategory('ordinateur', 'electronique')).toBe('LAPTOP');
    expect(presetForCategory('petit-electromenager', 'maison-jardin')).toBe('APPLIANCE');
    expect(presetForCategory('electromenager', 'maison-jardin')).toBe('APPLIANCE');
    // A root with no dedicated preset, and an unknown slug: both fall to OTHER.
    expect(presetForCategory('velos', 'mobilite')).toBe('OTHER');
    expect(presetForCategory('never-heard-of-it', null)).toBe('OTHER');
  });

  it('every preset except OTHER carries a full weight and box', () => {
    for (const [key, p] of Object.entries(PARCEL_PRESETS)) {
      if (key === 'OTHER') {
        expect(p.weightGrams).toBeNull();
        continue;
      }
      expect(p.weightGrams).toBeGreaterThan(0);
      expect(p.lengthCm).toBeGreaterThan(0);
      expect(p.widthCm).toBeGreaterThan(0);
      expect(p.heightCm).toBeGreaterThan(0);
    }
  });
});

describe('parcelDetailsSchema', () => {
  const ok = { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 };

  it('accepts the phone preset', () => {
    expect(parcelDetailsSchema.parse(ok)).toEqual(ok);
  });

  it('refuses under 100 g, over 30 kg, a zero side, a side over 150 cm, a value under 1 € or over 5 000 €', () => {
    for (const bad of [
      { ...ok, weightGrams: 99 },
      { ...ok, weightGrams: 30_001 },
      { ...ok, lengthCm: 0 },
      { ...ok, heightCm: 151 },
      { ...ok, valueCents: 99 },
      { ...ok, valueCents: 500_001 },
      { ...ok, weightGrams: 500.5 },
    ]) {
      expect(parcelDetailsSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('caps the insurable value at 1 000 €, as a constant the quote service reads', () => {
    expect(INSURABLE_VALUE_MAX_CENTS).toBe(100_000);
  });

  it('shippingQuoteRequestSchema wraps the details under `parcel`', () => {
    expect(shippingQuoteRequestSchema.parse({ parcel: ok })).toEqual({ parcel: ok });
    expect(shippingQuoteRequestSchema.safeParse(ok).success).toBe(false);
  });
});

describe('parcelPointSchema', () => {
  it('requires code, network, name and address, all trimmed and bounded', () => {
    const p = { code: '99439', network: 'MONR', name: 'Tabac de la Gare', address: '3 place Fixture, 69003 Lyon' };
    expect(parcelPointSchema.parse(p)).toEqual(p);
    expect(parcelPointSchema.safeParse({ ...p, code: '' }).success).toBe(false);
    expect(parcelPointSchema.safeParse({ ...p, network: 'X'.repeat(41) }).success).toBe(false);
  });
});

describe('TRACKING_STATUS_EFFECT', () => {
  it('covers every one of the nine Boxtal statuses, listed literally so the map cannot shrink', () => {
    expect(BOXTAL_TRACKING_STATUSES).toEqual([
      'ANNOUNCED',
      'SHIPPED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'FAILED_ATTEMPT',
      'REACHED_DELIVERY_PICKUP_POINT',
      'DELIVERED',
      'RETURNED',
      'EXCEPTION',
    ]);
    for (const s of BOXTAL_TRACKING_STATUSES) expect(TRACKING_STATUS_EFFECT[s]).toBeDefined();
  });

  it('ANNOUNCED is not a scan and notifies nobody; every later status is a scan', () => {
    expect(TRACKING_STATUS_EFFECT.ANNOUNCED).toEqual({ shipment: 'LABEL_READY', notify: null, isScan: false, opsMail: false });
    for (const s of BOXTAL_TRACKING_STATUSES.filter((x) => x !== 'ANNOUNCED')) {
      expect(TRACKING_STATUS_EFFECT[s].isScan).toBe(true);
    }
  });

  it('maps the five user-visible outcomes to their notification types and the rest to none', () => {
    expect(TRACKING_STATUS_EFFECT.SHIPPED.notify).toBe('PARCEL_SHIPPED');
    expect(TRACKING_STATUS_EFFECT.OUT_FOR_DELIVERY.notify).toBe('PARCEL_OUT_FOR_DELIVERY');
    expect(TRACKING_STATUS_EFFECT.REACHED_DELIVERY_PICKUP_POINT.notify).toBe('PARCEL_AT_PICKUP_POINT');
    expect(TRACKING_STATUS_EFFECT.DELIVERED).toEqual({ shipment: 'DELIVERED', notify: 'PARCEL_DELIVERED', isScan: true, opsMail: false });
    expect(TRACKING_STATUS_EFFECT.FAILED_ATTEMPT.notify).toBe('PARCEL_INCIDENT');
    expect(TRACKING_STATUS_EFFECT.IN_TRANSIT.notify).toBeNull();
  });

  it('RETURNED and EXCEPTION are the only two that mail ops', () => {
    const mailed = BOXTAL_TRACKING_STATUSES.filter((s) => TRACKING_STATUS_EFFECT[s].opsMail);
    expect(mailed).toEqual(['RETURNED', 'EXCEPTION']);
  });

  it('an unknown vendor value maps to IGNORE rather than throwing', () => {
    expect(trackingEffectFor('SOMETHING_NEW')).toEqual({ shipment: null, notify: null, isScan: false, opsMail: false });
    expect(trackingEffectFor('DELIVERED')).toBe(TRACKING_STATUS_EFFECT.DELIVERED);
  });
});

describe('SCAN_ADVANCES', () => {
  it('names exactly the two SENDING steps and no receiving step (Q3)', () => {
    expect(SCAN_ADVANCES).toEqual({ OUTBOUND: 'PARCEL_SENT', RETURN: 'RETURN_SENT' });
    expect(Object.values(SCAN_ADVANCES)).not.toContain('PARCEL_RECEIVED');
    expect(Object.values(SCAN_ADVANCES)).not.toContain('RETURN_RECEIVED');
  });
});
