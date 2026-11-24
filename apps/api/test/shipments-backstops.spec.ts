import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipmentsService } from '../src/shipping/shipments.service.js';
import { FakeShippingGateway, __registerBoxtalGateway, __resetShippingGateway } from '../src/shipping/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

function harness(shipments: Record<string, unknown>[]) {
  const fake = new FakeShippingGateway();
  __registerBoxtalGateway(() => fake);
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's';
  process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake';
  __resetShippingGateway();
  const prisma = { shipment: { findMany: vi.fn().mockResolvedValue(shipments) } };
  const svc = new ShipmentsService(prisma as unknown as PrismaService, { emit: vi.fn() } as never, { advanceBySystem: vi.fn() } as never);
  const ingestDocuments = vi.spyOn(svc, 'ingestDocuments').mockResolvedValue(undefined);
  const ingestTracking = vi.spyOn(svc, 'ingestTracking').mockResolvedValue(undefined);
  return { svc, fake, prisma, ingestDocuments, ingestTracking };
}

describe('backstops', () => {
  afterEach(() => {
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER']) delete process.env[k];
    __resetShippingGateway();
  });

  it('pollLabelsOnRead fetches documents for an ORDERED leg older than five minutes without a label, and only then', async () => {
    const h = harness([{ id: 's1', commandeId: 'c1', status: 'ORDERED', boxtalOrderId: 'o1', orderedAt: minutesAgo(6), labelStoragePath: null }]);
    h.fake.seedDocument('o1');
    await h.svc.pollLabelsOnRead('c1');
    expect(h.ingestDocuments).toHaveBeenCalledWith('s1', expect.arrayContaining([expect.objectContaining({ type: 'LABEL' })]));
    // The five-minute window is the WHERE clause's job; the fake findMany ignores where, so the
    // young case is asserted through what the real query would exclude: a service that never
    // reaches Boxtal for a row the query did not return.
    const young = harness([]);
    await young.svc.pollLabelsOnRead('c1');
    expect(young.ingestDocuments).not.toHaveBeenCalled();
    expect(young.prisma.shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ORDERED', labelStoragePath: null, orderedAt: expect.objectContaining({ lt: expect.any(Date) }) }) }),
    );
  });

  it('pollLabelsOnRead never throws and is a no-op under the manual driver', async () => {
    const h = harness([{ id: 's1', commandeId: 'c1', status: 'ORDERED', boxtalOrderId: 'o1', orderedAt: minutesAgo(6), labelStoragePath: null }]);
    h.fake.failNextOnce('getDocuments');
    await expect(h.svc.pollLabelsOnRead('c1')).resolves.toBeUndefined();
    process.env.SHIPPING_DRIVER = 'manual';
    __resetShippingGateway();
    await h.svc.pollLabelsOnRead('c1');
    expect(h.prisma.shipment.findMany).toHaveBeenCalledTimes(1);
  });

  it('sweep polls stale labels and stale tracking, counts acted and failed, and a Boxtal outage counts as failed', async () => {
    const h = harness([
      { id: 's1', commandeId: 'c1', status: 'ORDERED', boxtalOrderId: 'o1', orderedAt: minutesAgo(10), labelStoragePath: null, updatedAt: minutesAgo(10), events: [] },
      { id: 's2', commandeId: 'c2', status: 'IN_TRANSIT', boxtalOrderId: 'o2', orderedAt: minutesAgo(3000), labelStoragePath: 'p', updatedAt: minutesAgo(3000), events: [{ occurredAt: minutesAgo(25 * 60) }] },
      { id: 's3', commandeId: 'c3', status: 'IN_TRANSIT', boxtalOrderId: 'o3', orderedAt: minutesAgo(3000), labelStoragePath: 'p', updatedAt: minutesAgo(30), events: [{ occurredAt: minutesAgo(30) }] },
    ]);
    h.fake.seedDocument('o1');
    h.fake.seedTracking('o2', [{ status: 'DELIVERED', isFinal: true, message: null, trackingNumber: 'T', trackingDateTime: new Date().toISOString(), packageTrackingUrl: null, history: [] }]);
    const r = await h.svc.sweep();
    expect(r.scanned).toBe(3);
    expect(h.ingestDocuments).toHaveBeenCalledWith('s1', expect.anything());
    expect(h.ingestTracking).toHaveBeenCalledWith('s2', expect.anything());
    expect(h.ingestTracking).not.toHaveBeenCalledWith('s3', expect.anything());
    expect(r.acted).toBe(2);
    expect(r.failed).toBe(0);
    const g = harness([{ id: 's1', commandeId: 'c1', status: 'ORDERED', boxtalOrderId: 'o1', orderedAt: minutesAgo(10), labelStoragePath: null, updatedAt: minutesAgo(10), events: [] }]);
    g.fake.failNextOnce('getDocuments');
    expect((await g.svc.sweep()).failed).toBe(1);
  });

  it('sweep is a no-op under the manual driver', async () => {
    const h = harness([{ id: 's1', commandeId: 'c1', status: 'ORDERED', boxtalOrderId: 'o1', orderedAt: minutesAgo(10), labelStoragePath: null, updatedAt: minutesAgo(10), events: [] }]);
    process.env.SHIPPING_DRIVER = 'manual';
    __resetShippingGateway();
    expect(await h.svc.sweep()).toEqual({ scanned: 0, acted: 0, failed: 0 });
    expect(h.prisma.shipment.findMany).not.toHaveBeenCalled();
  });
});
