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
    { id: 'ship-out', leg: 'OUTBOUND', status: 'LABEL_READY', labelStoragePath: 'labels/c1/OUTBOUND.pdf', ...LEG },
    { id: 'ship-ret', leg: 'RETURN', status: 'PENDING', labelStoragePath: null, ...LEG },
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
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    commande: { findFirst: vi.fn().mockResolvedValue(commande) },
    shipment: { updateMany },
  };
  const svc = new ShipmentsService(prisma as unknown as PrismaService, {} as never, {} as never);
  svc.__setStorage(storage);
  return { svc, fake, storage, updateMany };
}

describe('ShipmentsService.labelUrlFor: download stamp (CF4-20, Q8)', () => {
  afterEach(() => {
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER']) delete process.env[k];
    __resetShippingGateway();
  });

  it('sender with a stored label: URL is returned and updateMany stamps the shipment once, first-only', async () => {
    const { svc, storage, updateMany } = harness();
    await storage.putObject('shipping-labels', 'labels/c1/OUTBOUND.pdf', Buffer.from('%PDF'), 'application/pdf');
    const { url } = await svc.labelUrlFor(CLIENT, 'c1', 'OUTBOUND');
    expect(url).toContain('shipping-labels/labels/c1/OUTBOUND.pdf');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'ship-out', labelDownloadedAt: null },
      data: { labelDownloadedAt: expect.any(Date) },
    });
  });

  it('updateMany rejecting: the URL is still returned (the failure is caught, not propagated)', async () => {
    const { svc, storage, updateMany } = harness();
    await storage.putObject('shipping-labels', 'labels/c1/OUTBOUND.pdf', Buffer.from('%PDF'), 'application/pdf');
    updateMany.mockRejectedValueOnce(new Error('db unavailable'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { url } = await svc.labelUrlFor(CLIENT, 'c1', 'OUTBOUND');
    expect(url).toContain('shipping-labels/labels/c1/OUTBOUND.pdf');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toContain('[shipping]');
    spy.mockRestore();
  });

  it('wrong party: 404, and updateMany is never called', async () => {
    const { svc, storage, updateMany } = harness();
    await storage.putObject('shipping-labels', 'labels/c1/OUTBOUND.pdf', Buffer.from('%PDF'), 'application/pdf');
    await expect(svc.labelUrlFor(REP, 'c1', 'OUTBOUND')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('no stored PDF: the existing LABEL_NOT_READY error, and no stamp', async () => {
    const { svc, updateMany } = harness();
    await expect(svc.labelUrlFor(REP, 'c1', 'RETURN')).rejects.toMatchObject({ message: "L'étiquette n'est pas encore disponible." });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
