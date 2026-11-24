import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipmentsService } from '../src/shipping/shipments.service.js';
import { FakeShippingGateway, __registerBoxtalGateway, __resetShippingGateway } from '../src/shipping/gateway.js';
import { FakeStorageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const CLIENT = 'client-1';
const REP = 'rep-1';
const LEG = { carrierCode: 'MONR', serviceCode: 'CpourToi' };
const COMMANDE = {
  id: 'c1', clientUserId: CLIENT, repairerUserId: REP, delivery: 'PARCEL', status: 'PAID', parcelOption: 'RELAY',
  shippingAddresses: [{ role: 'REPAIRER', postalCode: '69003', city: 'Lyon' }],
  shipments: [
    { leg: 'OUTBOUND', status: 'LABEL_READY', labelStoragePath: 'labels/c1/OUTBOUND.pdf', ...LEG },
    { leg: 'RETURN', status: 'PENDING', labelStoragePath: null, ...LEG },
  ],
};

function harness(commande: Record<string, unknown> | null = COMMANDE) {
  const fake = new FakeShippingGateway();
  __registerBoxtalGateway(() => fake);
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's';
  process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake';
  __resetShippingGateway();
  const storage = new FakeStorageGateway();
  const prisma = {
    commande: { findFirst: vi.fn().mockResolvedValue(commande) },
    // labelUrlFor stamps the first download (Task 2, CF4-20/Q8); these reads don't assert on it.
    shipment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const svc = new ShipmentsService(prisma as unknown as PrismaService, {} as never, {} as never);
  svc.__setStorage(storage);
  return { svc, fake, storage };
}

describe('ShipmentsService reads', () => {
  afterEach(() => {
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER']) delete process.env[k];
    __resetShippingGateway();
  });

  it("parcelPointsFor: the réparateur searches the OUTBOUND leg's carrier around his own address by default", async () => {
    const { svc, fake } = harness();
    const spy = vi.spyOn(fake, 'searchParcelPoints');
    const points = await svc.parcelPointsFor(REP, 'c1', {});
    expect(spy).toHaveBeenCalledWith({ shippingOfferCode: 'MONR-CpourToi', postalCode: '69003', city: 'Lyon' });
    expect(points[0]).toMatchObject({ code: '99439', network: 'MONR' });
  });

  it('parcelPointsFor: the client searches the RETURN leg, on the postal code he passes', async () => {
    const { svc, fake } = harness();
    const spy = vi.spyOn(fake, 'searchParcelPoints');
    await svc.parcelPointsFor(CLIENT, 'c1', { postalCode: '75011', city: 'Paris' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ postalCode: '75011', city: 'Paris' }));
  });

  it('parcelPointsFor refuses a HOME order, a stranger, and answers 503 when Boxtal is down', async () => {
    await expect(harness({ ...COMMANDE, parcelOption: 'HOME' }).svc.parcelPointsFor(CLIENT, 'c1', {})).rejects.toMatchObject({ message: "Cette commande n'utilise pas de point relais." });
    await expect(harness(null).svc.parcelPointsFor('nobody', 'c1', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // The réparateur: his address row exists in the fixture, so the search is reached and Boxtal's
    // failure is what surfaces. (The client without an address row and without a query is a 422
    // « Code postal et ville requis. » before any Boxtal call - a different refusal.)
    const h = harness();
    h.fake.failNextOnce('searchParcelPoints');
    await expect(h.svc.parcelPointsFor(REP, 'c1', {})).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(harness().svc.parcelPointsFor(CLIENT, 'c1', {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('labelUrlFor: only the SENDER of the leg may fetch it, and only once stored', async () => {
    const { svc, storage } = harness();
    await storage.putObject('shipping-labels', 'labels/c1/OUTBOUND.pdf', Buffer.from('%PDF'), 'application/pdf');
    const { url } = await svc.labelUrlFor(CLIENT, 'c1', 'OUTBOUND');
    expect(url).toContain('shipping-labels/labels/c1/OUTBOUND.pdf');
    // The réparateur is not the outbound sender → 404, indistinguishable from « no such order ».
    await expect(svc.labelUrlFor(REP, 'c1', 'OUTBOUND')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // The return label is not stored yet → 422.
    await expect(svc.labelUrlFor(REP, 'c1', 'RETURN')).rejects.toMatchObject({ message: "L'étiquette n'est pas encore disponible." });
  });
});
