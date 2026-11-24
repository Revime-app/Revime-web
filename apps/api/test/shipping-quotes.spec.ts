import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegOffer } from '../src/shipping/gateway.js';
import { FakeShippingGateway, __resetShippingGateway, __registerBoxtalGateway } from '../src/shipping/gateway.js';
import { ShippingQuotesService } from '../src/shipping/shipping-quotes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

const CLIENT = 'client-1';
const OFFER = {
  id: 'offer-1', status: 'SENT', acceptsParcel: true, repairerUserId: 'rep-1', demandeId: 'dem-1',
  demande: { status: 'OPEN', authorUserId: CLIENT, postalCode: '75011', category: { slug: 'smartphone', parent: { slug: 'electronique' } } },
  repairer: { profile: { verificationLevel: 'IDENTITY', repairerSuspendedAt: null }, repairerProfile: { postalCode: '69003' } },
};
const PARCEL = { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 };

const relay = (over: Partial<LegOffer>): LegOffer => ({
  carrierCode: 'MONR', serviceCode: 'CpourToi', carrierLabel: 'Mondial Relay', serviceLabel: 'Points Relais',
  costExclTaxCents: 314, costInclTaxCents: 378, insuranceInclTaxCents: 734,
  collectionType: 'DROPOFF_POINT', deliveryType: 'PICKUP_POINT', estimatedDeliveryDate: '2026-09-10', ...over,
});
const home = (over: Partial<LegOffer>): LegOffer =>
  relay({ carrierCode: 'POFR', carrierLabel: 'La Poste', serviceCode: 'ColissimoAccess', collectionType: 'POST_OFFICE', deliveryType: 'HOME', costInclTaxCents: 803, insuranceInclTaxCents: null, ...over });

function harness(opts: { offer?: typeof OFFER | null; existing?: Record<string, unknown> | null; geocode?: boolean } = {}) {
  const fake = new FakeShippingGateway();
  fake.seedOffers('OUTBOUND', [relay({}), relay({ serviceCode: 'DomicileFrance', deliveryType: 'HOME', costInclTaxCents: 666, insuranceInclTaxCents: 734 })]);
  fake.seedOffers('RETURN', [relay({ costInclTaxCents: 372, serviceCode: 'ChronoShoptoShop', carrierCode: 'CHRP', carrierLabel: 'Chronopost' }), relay({ serviceCode: 'DomicileFrance', deliveryType: 'HOME', costInclTaxCents: 666 })]);
  __registerBoxtalGateway(() => fake);
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's';
  process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake';
  process.env.PAYMENTS_ENABLED = 'true'; process.env.STRIPE_WEBHOOK_SECRET = 'x'; process.env.PUBLIC_API_URL = 'http://l';
  delete process.env.STRIPE_DRIVER; delete process.env.STRIPE_SECRET_KEY;
  __resetShippingGateway();

  const created: Record<string, unknown>[] = [];
  const prisma = {
    offer: { findFirst: vi.fn().mockResolvedValue(opts.offer === undefined ? OFFER : opts.offer) },
    shippingQuote: {
      findFirst: vi.fn().mockResolvedValue(opts.existing ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'quote-1', createdAt: new Date(), ...data };
        created.push(row);
        return Promise.resolve(row);
      }),
    },
  };
  const geocode = {
    lookupPostalCode: vi.fn().mockImplementation((pc: string) =>
      Promise.resolve(opts.geocode === false ? null : { lat: 0, lng: 0, city: pc === '75011' ? 'Paris' : 'Lyon 3e Arrondissement' })),
  };
  const service = new ShippingQuotesService(prisma as unknown as PrismaService, geocode as unknown as GeocodeService);
  return { service, fake, prisma, created };
}

describe('ShippingQuotesService.quote', () => {
  const saved = { ...process.env };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); process.env = { ...saved }; __resetShippingGateway(); });

  it('quotes both legs, selects per option, grosses up and rounds, persists, returns the DTO', async () => {
    const { service, fake, created } = harness();
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: PARCEL });
    // RELAY: 378 + 372 = 750 → 780; both legs insure at 734 → the insured pair is the same one, 1468 → 1520.
    // V7 A9 (U8): 780 split by cost, 780 × 378 / 750 = 393,12 → 393, the return the rest.
    const relayLegs = { OUTBOUND: { carrierLabel: 'Mondial Relay', cents: 393 }, RETURN: { carrierLabel: 'Chronopost', cents: 387 } };
    expect(dto.options.RELAY).toEqual({
      shippingCents: 780,
      carrierLabels: { OUTBOUND: 'Mondial Relay', RETURN: 'Chronopost' },
      legPrices: relayLegs,
      insured: {
        shippingCents: 780,
        insuranceCents: 1520,
        carrierLabels: { OUTBOUND: 'Mondial Relay', RETURN: 'Chronopost' },
        legPrices: relayLegs,
      },
    });
    // HOME: 666 + 666 = 1332 → 1377,0 → 1380.
    expect(dto.options.HOME?.shippingCents).toBe(1380);
    expect(dto.expiresAt).toBe(new Date('2026-09-04T10:30:00Z').toISOString());
    expect(created[0]).toMatchObject({
      offerId: 'offer-1', clientUserId: CLIENT, parcelWeightGrams: 500,
      relayShippingCents: 780, relayInsuredShippingCents: 780, relayInsuranceCents: 1520,
      homeShippingCents: 1380, homeInsuredShippingCents: 1380, homeInsuranceCents: 1520,
    });
    const legs = created[0]!.legs as Record<string, Record<string, unknown>>;
    expect(legs.RELAY!.OUTBOUND).toBeDefined();
    expect(legs.RELAY!.insured).toBeDefined();
    // A quote orders nothing.
    expect(fake.orders()).toHaveLength(0);
  });

  it('the insured variant picks a DEARER pair when the cheapest pair cannot insure the value (spec Amendment 2026-09-04)', async () => {
    const { service, fake, created } = harness();
    const access = home({});
    const expert = home({ serviceCode: 'ColissimoExpert', costInclTaxCents: 917, insuranceInclTaxCents: 3027 });
    fake.seedOffers('OUTBOUND', [relay({}), access, expert]);
    fake.seedOffers('RETURN', [relay({}), access, expert]);
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: { ...PARCEL, valueCents: 80_000 } });
    // Uninsured HOME: Access twice, 803 + 803 = 1606 → 1660. Insured HOME: Expert twice, 917 + 917 = 1834 → 1900;
    // premium 3027 × 2 = 6054 → 6260.
    // V7 A9 (U8): each price split on its own pair, two equal legs → halves.
    expect(dto.options.HOME).toEqual({
      shippingCents: 1660,
      carrierLabels: { OUTBOUND: 'La Poste', RETURN: 'La Poste' },
      legPrices: { OUTBOUND: { carrierLabel: 'La Poste', cents: 830 }, RETURN: { carrierLabel: 'La Poste', cents: 830 } },
      insured: {
        shippingCents: 1900,
        insuranceCents: 6260,
        carrierLabels: { OUTBOUND: 'La Poste', RETURN: 'La Poste' },
        legPrices: { OUTBOUND: { carrierLabel: 'La Poste', cents: 950 }, RETURN: { carrierLabel: 'La Poste', cents: 950 } },
      },
    });
    expect(created[0]).toMatchObject({ homeShippingCents: 1660, homeInsuredShippingCents: 1900, homeInsuranceCents: 6260 });
  });

  it('the insured variant is null when no pair can insure the value, and the option stays uninsured', async () => {
    const { service, fake, created } = harness();
    fake.seedOffers('OUTBOUND', [relay({ insuranceInclTaxCents: null })]);
    fake.seedOffers('RETURN', [relay({ insuranceInclTaxCents: 0 })]);
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: PARCEL });
    // 378 + 378 = 756 → 781,4 → 782 → 790.
    expect(dto.options.RELAY?.shippingCents).toBe(790);
    expect(dto.options.RELAY?.insured).toBeNull();
    expect(created[0]).toMatchObject({ relayShippingCents: 790, relayInsuredShippingCents: null, relayInsuranceCents: null });
  });

  it('the réparateur is BUSINESS only at the BUSINESS level; the client is always RESIDENTIAL', async () => {
    const { service, fake } = harness();
    const seen: string[] = [];
    const orig = fake.quoteLeg.bind(fake);
    fake.quoteLeg = async (input) => { seen.push(`${input.from.kind}->${input.to.kind}`); return orig(input); };
    await service.quote(CLIENT, 'offer-1', { parcel: PARCEL });
    expect(seen.sort()).toEqual(['RESIDENTIAL->RESIDENTIAL', 'RESIDENTIAL->RESIDENTIAL']);
  });

  it('insurance is null above the insurable cap, even when every offer could insure', async () => {
    const { service, created } = harness();
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: { ...PARCEL, valueCents: 100_001 } });
    expect(dto.options.RELAY?.insured).toBeNull();
    expect(dto.options.RELAY?.shippingCents).toBe(780);
    expect(created[0]).toMatchObject({ relayInsuredShippingCents: null, relayInsuranceCents: null });
  });

  it('an option with no surviving offer on EITHER leg is absent', async () => {
    const { service, fake } = harness();
    fake.seedOffers('RETURN', [relay({})]); // no HOME offer on the return leg
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: PARCEL });
    expect(dto.options.HOME).toBeUndefined();
    expect(dto.options.RELAY).toBeDefined();
  });

  it('refuses 422 « ne peut pas être expédié » when both options are empty', async () => {
    const { service, fake } = harness();
    fake.seedOffers('OUTBOUND', []); fake.seedOffers('RETURN', []);
    await expect(service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY', message: "Cet objet ne peut pas être expédié par colis." });
  });

  it('answers 503 when Boxtal is unavailable and when the geocoder has no city', async () => {
    const a = harness(); a.fake.failNextOnce('quoteLeg');
    await expect(a.service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const b = harness({ geocode: false });
    await expect(b.service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('returns the stored quote when the same client asks the same parcel again inside 30 minutes - no Boxtal call', async () => {
    const existing = {
      id: 'quote-old', expiresAt: new Date('2026-09-04T10:20:00Z'),
      relayShippingCents: 780, relayInsuredShippingCents: 780, relayInsuranceCents: 1520,
      homeShippingCents: null, homeInsuredShippingCents: null, homeInsuranceCents: null,
      legs: { RELAY: { OUTBOUND: relay({}), RETURN: relay({}), insured: { OUTBOUND: relay({}), RETURN: relay({}) } } },
    };
    const { service, fake, prisma } = harness({ existing });
    const spy = vi.spyOn(fake, 'quoteLeg');
    const dto = await service.quote(CLIENT, 'offer-1', { parcel: PARCEL });
    expect(dto.id).toBe('quote-old');
    expect(dto.options.RELAY?.insured?.insuranceCents).toBe(1520);
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.shippingQuote.create).not.toHaveBeenCalled();
  });

  it("404s when the offer is not the caller's, 422 when it is not SENT or does not accept parcels", async () => {
    await expect(harness({ offer: null }).service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(harness({ offer: { ...OFFER, status: 'WITHDRAWN' } }).service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    await expect(harness({ offer: { ...OFFER, acceptsParcel: false } }).service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ message: "Ce réparateur n'accepte pas l'envoi par colis." });
  });

  it('is OFF under the manual driver: 422 before any lookup', async () => {
    const { service, prisma } = harness();
    process.env.SHIPPING_DRIVER = 'manual'; __resetShippingGateway();
    await expect(service.quote(CLIENT, 'offer-1', { parcel: PARCEL })).rejects.toMatchObject({ message: "Le devis de livraison n'est pas disponible." });
    expect(prisma.offer.findFirst).not.toHaveBeenCalled();
  });
});
