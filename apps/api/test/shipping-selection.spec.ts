import { describe, expect, it } from 'vitest';
import type { LegOffer } from '../src/shipping/gateway.js';
import { selectLegOffer } from '../src/shipping/selection.js';

const offer = (over: Partial<LegOffer>): LegOffer => ({
  carrierCode: 'MONR',
  serviceCode: 'CpourToi',
  carrierLabel: 'Mondial Relay',
  serviceLabel: 'Mondial Points Relais',
  costExclTaxCents: 314,
  costInclTaxCents: 378,
  insuranceInclTaxCents: 734,
  collectionType: 'DROPOFF_POINT',
  deliveryType: 'PICKUP_POINT',
  estimatedDeliveryDate: '2026-09-10',
  ...over,
});

describe('selectLegOffer', () => {
  it('RELAY: cheapest tax-inclusive drop-off → pickup-point offer on a searchable network', () => {
    const offers = [
      offer({ carrierCode: 'CHRP', serviceCode: 'ChronoShoptoShop', costInclTaxCents: 372 }),
      offer({ costInclTaxCents: 378 }),
      offer({ carrierCode: 'UPSE', serviceCode: 'StandardAP', costInclTaxCents: 618 }),
    ];
    expect(selectLegOffer(offers, 'RELAY')?.serviceCode).toBe('ChronoShoptoShop');
  });

  it('RELAY excludes a pickup-point offer on a network with no searchable relay list', () => {
    const offers = [offer({ carrierCode: 'XXXX', serviceCode: 'Cheap', costInclTaxCents: 100 }), offer({})];
    expect(selectLegOffer(offers, 'RELAY')?.carrierCode).toBe('MONR');
  });

  it('HOME: cheapest drop-off → door offer; COMPANY counts as a door', () => {
    const offers = [
      offer({ serviceCode: 'DomicileFrance', deliveryType: 'HOME', costInclTaxCents: 666 }),
      offer({ carrierCode: 'POFR', serviceCode: 'ColissimoAccess', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 914 }),
      offer({ carrierCode: 'COPR', serviceCode: 'Domicile', deliveryType: 'COMPANY', costInclTaxCents: 600 }),
    ];
    expect(selectLegOffer(offers, 'HOME')?.serviceCode).toBe('Domicile');
  });

  it('home PICKUP (collection at the door) is excluded even when cheapest (Q2)', () => {
    const offers = [
      offer({ serviceCode: 'Collecte', collectionType: 'HOME', deliveryType: 'HOME', costInclTaxCents: 100 }),
      offer({ serviceCode: 'DomicileFrance', deliveryType: 'HOME', costInclTaxCents: 666 }),
    ];
    expect(selectLegOffer(offers, 'HOME')?.serviceCode).toBe('DomicileFrance');
  });

  it('ties break on the earliest delivery date, then the service code, so two runs agree', () => {
    const offers = [
      offer({ serviceCode: 'Zeta', estimatedDeliveryDate: '2026-09-11' }),
      offer({ serviceCode: 'Alpha', estimatedDeliveryDate: '2026-09-11' }),
      offer({ serviceCode: 'Later', estimatedDeliveryDate: '2026-09-12' }),
    ];
    expect(selectLegOffer(offers, 'RELAY')?.serviceCode).toBe('Alpha');
  });

  it('returns null when nothing survives, which the quote maps to an absent option', () => {
    expect(selectLegOffer([offer({ deliveryType: 'HOME' })], 'RELAY')).toBeNull();
    expect(selectLegOffer([], 'HOME')).toBeNull();
  });

  // Spec « Amendment, 2026-09-04 »: insurance is per offer AND per declared value, and Boxtal
  // silently ignores `insured` when the offer cannot insure. So a null premium means « cannot
  // insure this value on this service », and an insured selection must never pick such an offer.
  describe('with insurance requested', () => {
    it('excludes an offer that cannot insure the value, even when it is the cheapest', () => {
      const offers = [
        offer({ carrierCode: 'POFR', serviceCode: 'ColissimoAccess', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 803, insuranceInclTaxCents: null }),
        offer({ carrierCode: 'POFR', serviceCode: 'ColissimoExpert', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 917, insuranceInclTaxCents: 3027 }),
      ];
      expect(selectLegOffer(offers, 'HOME', { insured: true })?.serviceCode).toBe('ColissimoExpert');
    });

    it('a zero premium counts as « cannot insure » too', () => {
      const offers = [
        offer({ serviceCode: 'Cheap', costInclTaxCents: 100, insuranceInclTaxCents: 0 }),
        offer({ serviceCode: 'Insurable', costInclTaxCents: 378, insuranceInclTaxCents: 734 }),
      ];
      expect(selectLegOffer(offers, 'RELAY', { insured: true })?.serviceCode).toBe('Insurable');
    });

    it('returns null when no surviving offer can insure, so the option is absent rather than sold uninsured', () => {
      const offers = [offer({ insuranceInclTaxCents: null }), offer({ serviceCode: 'Other', insuranceInclTaxCents: 0 })];
      expect(selectLegOffer(offers, 'RELAY', { insured: true })).toBeNull();
    });

    it('without insurance requested, an uninsurable offer still competes and wins on price', () => {
      const offers = [
        offer({ carrierCode: 'POFR', serviceCode: 'ColissimoAccess', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 803, insuranceInclTaxCents: null }),
        offer({ carrierCode: 'POFR', serviceCode: 'ColissimoExpert', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 917, insuranceInclTaxCents: 3027 }),
      ];
      expect(selectLegOffer(offers, 'HOME')?.serviceCode).toBe('ColissimoAccess');
      expect(selectLegOffer(offers, 'HOME', { insured: false })?.serviceCode).toBe('ColissimoAccess');
    });
  });
});
