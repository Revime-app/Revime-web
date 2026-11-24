import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const CLIENT = 'client-1';
const OFFER = { id: 'offer-1', priceCents: 10_000, acceptsParcel: true, repairerUserId: 'rep-1', demandeId: 'dem-1' };
const LEG = { carrierCode: 'MONR', serviceCode: 'CpourToi', carrierLabel: 'Mondial Relay', serviceLabel: 'x', costExclTaxCents: 314, costInclTaxCents: 378, insuranceInclTaxCents: 734, collectionType: 'DROPOFF_POINT', deliveryType: 'PICKUP_POINT', estimatedDeliveryDate: null };
// A dearer insurable pair, as the spec Amendment describes for a value the cheapest carrier cannot insure.
const LEG_INSURED = { ...LEG, carrierCode: 'CHRP', serviceCode: 'ChronoShoptoShop', carrierLabel: 'Chronopost', costExclTaxCents: 375, costInclTaxCents: 450, insuranceInclTaxCents: 734 };
const QUOTE = {
  id: '11111111-1111-4111-8111-111111111111', offerId: 'offer-1', clientUserId: CLIENT, expiresAt: new Date('2026-09-04T10:30:00Z'),
  parcelWeightGrams: 500, parcelLengthCm: 20, parcelWidthCm: 12, parcelHeightCm: 8, parcelValueCents: 30_000,
  relayShippingCents: 780, relayInsuredShippingCents: 940, relayInsuranceCents: 1520,
  homeShippingCents: null, homeInsuredShippingCents: null, homeInsuranceCents: null,
  legs: { RELAY: { OUTBOUND: LEG, RETURN: LEG, insured: { OUTBOUND: LEG_INSURED, RETURN: LEG_INSURED } } },
};

function service(quote: Record<string, unknown> | null = QUOTE) {
  const prisma = { shippingQuote: { findFirst: vi.fn().mockResolvedValue(quote) } };
  return { svc: new PaymentsService(prisma as unknown as PrismaService, {} as never, {} as never), prisma };
}

describe('PaymentsService.resolveQuote (Livraison Boxtal, spec §7.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T10:00:00Z'));
    process.env.SHIPPING_DRIVER = 'boxtal';
    process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's'; process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's'; process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake';
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER']) delete process.env[k];
  });

  it('uninsured: the cheapest pair, its shipping price, 0 insurance', async () => {
    const { svc } = service();
    const r = await svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY', insured: false });
    expect(r).toMatchObject({ quoteId: QUOTE.id, parcelOption: 'RELAY', quoted: { shippingCents: 780, insuranceCents: 0 }, insured: false });
    expect(r?.legs.OUTBOUND.serviceCode).toBe('CpourToi');
    expect(r?.parcel).toEqual({ weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 });
  });

  it('insured: the INSURED pair - its own (dearer) shipping price plus the premium, never the uninsured pair with a premium bolted on', async () => {
    // Spec Amendment addendum: Boxtal ignores `insured` on a service that cannot insure the value,
    // so the pair the client pays for must be the one that was quoted WITH insurance.
    const { svc } = service();
    const r = await svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY', insured: true });
    expect(r).toMatchObject({ quoted: { shippingCents: 940, insuranceCents: 1520 }, insured: true });
    expect(r?.legs.OUTBOUND.serviceCode).toBe('ChronoShoptoShop');
    expect(r?.legs.RETURN.carrierLabel).toBe('Chronopost');
  });

  it('is null for a local delivery, whatever else the body carries', async () => {
    expect(await service().svc.resolveQuote(CLIENT, OFFER, { delivery: 'HOME', quoteId: QUOTE.id })).toBeNull();
  });

  it('is null under the manual driver even with a quote id - the flat path applies (§7.2 last row)', async () => {
    process.env.SHIPPING_DRIVER = 'manual';
    const { svc, prisma } = service();
    expect(await svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY' })).toBeNull();
    expect(prisma.shippingQuote.findFirst).not.toHaveBeenCalled();
  });

  it('refuses by message: missing quote, foreign quote, expired quote, absent option, insurance unavailable', async () => {
    await expect(service().svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL' })).rejects.toMatchObject({ message: 'Devis de livraison requis.' });
    await expect(service(null).svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    vi.setSystemTime(new Date('2026-09-04T10:31:00Z'));
    await expect(service().svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY' })).rejects.toMatchObject({ message: 'Le devis de livraison a expiré.' });
    vi.setSystemTime(new Date('2026-09-04T10:00:00Z'));
    await expect(service().svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'HOME' })).rejects.toMatchObject({ message: "Cette option de livraison n'est pas disponible." });
    // No insured pair on the row (value above the cap, or no carrier could insure it): insured is refused, uninsured still fine.
    const noInsurance = { ...QUOTE, relayInsuredShippingCents: null, relayInsuranceCents: null, legs: { RELAY: { OUTBOUND: LEG, RETURN: LEG, insured: null } } };
    await expect(service(noInsurance).svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY', insured: true })).rejects.toMatchObject({ message: "L'assurance n'est pas disponible pour cette valeur." });
    expect((await service(noInsurance).svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY', insured: false }))?.quoted).toEqual({ shippingCents: 780, insuranceCents: 0 });
  });

  it('the quote must belong to THIS client and THIS offer - the where clause carries both', async () => {
    const { svc, prisma } = service();
    await svc.resolveQuote(CLIENT, OFFER, { delivery: 'PARCEL', quoteId: QUOTE.id, parcelOption: 'RELAY' });
    expect(prisma.shippingQuote.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: QUOTE.id, offerId: 'offer-1', clientUserId: CLIENT }) }));
  });
});
