import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipmentsService } from '../src/shipping/shipments.service.js';
import { FakeShippingGateway, __registerBoxtalGateway, __resetShippingGateway } from '../src/shipping/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

function harness(shipment: Record<string, unknown> | null = { id: 'ship1', commandeId: 'c1', leg: 'OUTBOUND', status: 'ORDERED', boxtalOrderId: 'o1' }) {
  const fake = new FakeShippingGateway();
  __registerBoxtalGateway(() => fake);
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's';
  process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake';
  __resetShippingGateway();
  const claimed = new Set<string>();
  const prisma = {
    boxtalEvent: {
      create: vi.fn().mockImplementation(({ data }: { data: { id: string } }) => {
        if (claimed.has(data.id)) return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        claimed.add(data.id);
        return Promise.resolve(data);
      }),
      delete: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => { claimed.delete(where.id); return Promise.resolve({ id: where.id }); }),
    },
    shipment: { findFirst: vi.fn().mockResolvedValue(shipment) },
  };
  const svc = new ShipmentsService(prisma as unknown as PrismaService, { emit: vi.fn() } as never, { advanceBySystem: vi.fn() } as never);
  const ingestDocuments = vi.spyOn(svc, 'ingestDocuments').mockResolvedValue(undefined);
  const ingestTracking = vi.spyOn(svc, 'ingestTracking').mockResolvedValue(undefined);
  return { svc, fake, ingestDocuments, ingestTracking, prisma };
}

describe('ShipmentsService.handleWebhook', () => {
  afterEach(() => {
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER']) delete process.env[k];
    __resetShippingGateway();
  });

  it('a signed DOCUMENT_CREATED reaches ingestDocuments with the shipment found by externalId', async () => {
    const h = harness();
    const { raw, signature } = h.fake.signedBody({ id: 'e1', type: 'DOCUMENT_CREATED', shippingOrderId: 'o1', shipmentExternalId: 'ship1', payload: { documents: [{ url: 'u', type: 'LABEL', format: 'PDF_A4' }] } });
    expect(await h.svc.handleWebhook(raw, signature)).toBe('processed');
    expect(h.ingestDocuments).toHaveBeenCalledWith('ship1', [{ url: 'u', type: 'LABEL', format: 'PDF_A4' }]);
  });

  it('a signed TRACKING_CHANGED reaches ingestTracking; the shipment can also be found by boxtalOrderId', async () => {
    const h = harness();
    const { raw, signature } = h.fake.signedBody({ id: 'e2', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: null, payload: { trackings: [] } });
    expect(await h.svc.handleWebhook(raw, signature)).toBe('processed');
    expect(h.ingestTracking).toHaveBeenCalledWith('ship1', []);
    expect(h.prisma.shipment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { boxtalOrderId: 'o1' } }));
  });

  it('a wrong signature is 400 and nothing is claimed or processed', async () => {
    const h = harness();
    const { raw } = h.fake.signedBody({ id: 'e3', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: 'ship1', payload: {} });
    await expect(h.svc.handleWebhook(raw, 'deadbeef')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(h.prisma.boxtalEvent.create).not.toHaveBeenCalled();
    expect(h.ingestTracking).not.toHaveBeenCalled();
  });

  it('a replayed event id is a duplicate: 200, processed once', async () => {
    const h = harness();
    const body = h.fake.signedBody({ id: 'e4', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: 'ship1', payload: { trackings: [] } });
    expect(await h.svc.handleWebhook(body.raw, body.signature)).toBe('processed');
    expect(await h.svc.handleWebhook(body.raw, body.signature)).toBe('duplicate');
    expect(h.ingestTracking).toHaveBeenCalledTimes(1);
  });

  it('a processing failure releases the claim so Boxtal\'s retry gets another chance', async () => {
    const h = harness();
    h.ingestTracking.mockRejectedValueOnce(new Error('db hiccup'));
    const body = h.fake.signedBody({ id: 'e4b', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: 'ship1', payload: { trackings: [] } });
    await expect(h.svc.handleWebhook(body.raw, body.signature)).rejects.toThrow('db hiccup');
    expect(h.prisma.boxtalEvent.delete).toHaveBeenCalledWith({ where: { id: 'e4b' } });
    expect(await h.svc.handleWebhook(body.raw, body.signature)).toBe('processed');
  });

  it('an event for a shipment we do not know is logged and answered, not thrown', async () => {
    const h = harness(null);
    const body = h.fake.signedBody({ id: 'e5', type: 'TRACKING_CHANGED', shippingOrderId: 'zzz', shipmentExternalId: 'nope', payload: {} });
    expect(await h.svc.handleWebhook(body.raw, body.signature)).toBe('unknown_shipment');
  });

  it('the route is closed (404) when quoting is off', async () => {
    const h = harness();
    process.env.SHIPPING_DRIVER = 'manual';
    __resetShippingGateway();
    const body = h.fake.signedBody({ id: 'e6', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: 'ship1', payload: {} });
    await expect(h.svc.handleWebhook(body.raw, body.signature)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
