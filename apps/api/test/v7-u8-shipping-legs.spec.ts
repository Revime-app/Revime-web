import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDE_FIND_ONE_SELECT, shippingLegsFor } from '../src/commandes/commandes.service.js';
import type { LegOffer } from '../src/shipping/gateway.js';
import { __resetShippingGateway } from '../src/shipping/gateway.js';
import { paidLegPair, ShippingQuotesService, type QuoteLegs } from '../src/shipping/shipping-quotes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * V7 A9 (U8, `DEC7-23`): the delivery price is shown per leg, with its carrier. The split is read
 * from the quote (Q2): the quote DTO for the payment step, and the order's own quote for the order
 * details, so a quote expiring changes nothing. An order without a quote gets null (Q6).
 */
const offer = (carrierLabel: string, costInclTaxCents: number): LegOffer => ({
  carrierCode: 'X', serviceCode: 'Y', carrierLabel, serviceLabel: 'S',
  costExclTaxCents: costInclTaxCents, costInclTaxCents, insuranceInclTaxCents: 100,
  collectionType: 'DROPOFF_POINT', deliveryType: 'PICKUP_POINT', estimatedDeliveryDate: null,
});

// Production's 2026-10-09 quote (§4 A9): relay Chronopost 3,72 € both ways → 7,70 €; home
// Chronopost 5,50 € out, Mondial Relay 6,66 € back → 12,60 €. The insured home pair is made dearer
// here (La Poste 9,17 € twice → 19,00 €) so the test tells the two pairs apart.
const LEGS: QuoteLegs = {
  RELAY: { OUTBOUND: offer('Chronopost', 372), RETURN: offer('Chronopost', 372), insured: null },
  HOME: {
    OUTBOUND: offer('Chronopost', 550),
    RETURN: offer('Mondial Relay', 666),
    insured: { OUTBOUND: offer('La Poste', 917), RETURN: offer('La Poste', 917) },
  },
};
const QUOTE_ROW = {
  id: 'quote-1',
  expiresAt: new Date('2026-10-29T10:30:00Z'),
  legs: LEGS,
  relayShippingCents: 770,
  relayInsuredShippingCents: null,
  relayInsuranceCents: null,
  homeShippingCents: 1260,
  homeInsuredShippingCents: 1900,
  homeInsuranceCents: 210,
};

describe('V7 U8 the quote DTO splits each price per leg', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      SHIPPING_DRIVER: 'boxtal', BOXTAL_V1_ACCESS_KEY: 'k', BOXTAL_V1_SECRET_KEY: 's', BOXTAL_V3_ACCESS_KEY: 'k',
      BOXTAL_V3_SECRET_KEY: 's', BOXTAL_WEBHOOK_SECRET: 'w', STORAGE_DRIVER: 'fake', PAYMENTS_ENABLED: 'true',
      STRIPE_WEBHOOK_SECRET: 'x', PUBLIC_API_URL: 'http://l',
    });
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    __resetShippingGateway();
  });
  afterEach(() => {
    process.env = { ...saved };
    __resetShippingGateway();
  });

  async function quoteDto() {
    const prisma = {
      offer: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'offer-1', status: 'SENT', acceptsParcel: true, repairerUserId: 'rep-1', demandeId: 'dem-1',
          demande: { status: 'OPEN', postalCode: '75011', category: { slug: 'smartphone', parent: null } },
          repairer: { profile: { verificationLevel: 'IDENTITY', repairerSuspendedAt: null }, repairerProfile: { postalCode: '69003' } },
        }),
      },
      // The still-valid quote is returned as is: `present` is the code under test.
      shippingQuote: { findFirst: vi.fn().mockResolvedValue(QUOTE_ROW), create: vi.fn() },
    };
    const service = new ShippingQuotesService(prisma as unknown as PrismaService, {} as GeocodeService);
    return service.quote('client-1', 'offer-1', {
      parcel: { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 },
    });
  }

  it('gives the cheapest pair its two prices and carriers, adding up to the price shown', async () => {
    const dto = await quoteDto();
    expect(dto.options.RELAY?.legPrices).toEqual({
      OUTBOUND: { carrierLabel: 'Chronopost', cents: 385 },
      RETURN: { carrierLabel: 'Chronopost', cents: 385 },
    });
    expect(dto.options.HOME?.legPrices).toEqual({
      OUTBOUND: { carrierLabel: 'Chronopost', cents: 570 },
      RETURN: { carrierLabel: 'Mondial Relay', cents: 690 },
    });
  });

  it('splits the insured variant on ITS pair and ITS price, never the cheapest pair', async () => {
    const dto = await quoteDto();
    expect(dto.options.HOME?.insured?.legPrices).toEqual({
      OUTBOUND: { carrierLabel: 'La Poste', cents: 950 },
      RETURN: { carrierLabel: 'La Poste', cents: 950 },
    });
  });
});

describe('V7 U8 the order reads its split from the quote it was paid on', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    delivery: 'PARCEL' as const,
    parcelOption: 'HOME' as const,
    shippingCents: 1260,
    insuranceCents: 0,
    shippingQuote: { legs: LEGS as unknown },
    ...over,
  });

  it('an uninsured order splits the cheapest pair', () => {
    expect(shippingLegsFor(order())).toEqual({
      OUTBOUND: { carrierLabel: 'Chronopost', cents: 570 },
      RETURN: { carrierLabel: 'Mondial Relay', cents: 690 },
    });
  });

  it('an insured order splits the insured pair, as checkout and the label orders do', () => {
    expect(shippingLegsFor(order({ shippingCents: 1900, insuranceCents: 210 }))).toEqual({
      OUTBOUND: { carrierLabel: 'La Poste', cents: 950 },
      RETURN: { carrierLabel: 'La Poste', cents: 950 },
    });
    expect(paidLegPair(order({ insuranceCents: 210 }))?.OUTBOUND.carrierLabel).toBe('La Poste');
  });

  it('is null without a quote (a manual-driver parcel at 19 €), and for a local order (Q6)', () => {
    expect(shippingLegsFor(order({ shippingQuote: null, parcelOption: null, shippingCents: 1900 }))).toBeNull();
    expect(shippingLegsFor(order({ delivery: 'WORKSHOP', parcelOption: null, shippingCents: 0, shippingQuote: null }))).toBeNull();
  });

  it('is null when the quote has no pair for the paid option', () => {
    expect(shippingLegsFor(order({ shippingQuote: { legs: { RELAY: LEGS.RELAY } } }))).toBeNull();
  });

  it('findOne reads the quote legs and returns the split', () => {
    expect(COMMANDE_FIND_ONE_SELECT.shippingQuote).toEqual({ select: { legs: true } });
    const source = readFileSync(new URL('../src/commandes/commandes.service.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/shippingLegs: shippingLegsFor\(row\)/);
  });
});
