import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipmentsService, LABEL_PATH } from '../src/shipping/shipments.service.js';
import { FakeShippingGateway, ShippingRefusedError, __registerBoxtalGateway, __resetShippingGateway } from '../src/shipping/gateway.js';
import { FakeStorageGateway } from '../src/storage/gateway.js';
import { __setMailSender } from '../src/mail/mail.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

type Row = Record<string, unknown>;

/**
 * Just enough Prisma, with the CAS semantics the real one has: commande.findFirst/updateMany,
 * shipment.findFirst/updateMany/update, shipmentEvent.findUnique/create (find-then-create is what
 * the service does, so « created » is exact rather than a timestamp heuristic).
 *
 * `commande.findFirst` returns SNAPSHOT copies of the shipments (deliberate break #4, 2026-09-05):
 * with shared objects, the first writer's synchronous `updateMany` mutation made the second writer's
 * PRECONDITION read see ORDERED, so the concurrency test passed with the CAS's `status: 'PENDING'`
 * deleted. Copies mean both writers read PENDING and only the guarded write can tell them apart -
 * which is what two API processes against one Postgres row actually face.
 */
function db(commande: Row, shipments: Row[]) {
  const events: Row[] = [];
  const state = { commande, shipments, events };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v !== null && typeof v === 'object' && 'not' in (v as Row)) return row[k] !== (v as Row).not;
      return v === null ? row[k] === null : row[k] === v;
    });
  const prisma = {
    commande: {
      findFirst: vi.fn().mockImplementation(() => Promise.resolve({ ...state.commande, shipments: state.shipments.map((s) => ({ ...s })) })),
      findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...state.commande, shipments: state.shipments.map((s) => ({ ...s })) })),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: Row; data: Row }) => {
        const match = Object.entries(where).every(([k, v]) => k === 'id' || (v === null ? state.commande[k] === null : state.commande[k] === v));
        if (match) Object.assign(state.commande, data);
        return Promise.resolve({ count: match ? 1 : 0 });
      }),
    },
    shipment: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: Row }) => Promise.resolve(state.shipments.find((s) => matches(s, where)) ?? null)),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: Row; data: Row }) => {
        const hits = state.shipments.filter((s) => matches(s, where));
        for (const h of hits) Object.assign(h, data);
        return Promise.resolve({ count: hits.length });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: Row; data: Row }) => {
        const s = state.shipments.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return Promise.resolve(s);
      }),
    },
    shipmentEvent: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: Row }) => {
        const key = JSON.stringify(where);
        return Promise.resolve(state.events.find((e) => e.key === key) ?? null);
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Row }) => {
        const key = JSON.stringify({ shipmentId_status_occurredAt: { shipmentId: data.shipmentId, status: data.status, occurredAt: data.occurredAt } });
        const row = { key, ...data, created: true };
        state.events.push(row);
        return Promise.resolve(row);
      }),
    },
  };
  return { prisma, state };
}

const CLIENT = 'client-1';
const REP = 'rep-1';
const addr = (role: string, point: string | null) => ({
  role, line1: '10 rue Exemple', line2: null, postalCode: role === 'CLIENT' ? '75011' : '69003', city: role === 'CLIENT' ? 'Paris' : 'Lyon',
  phone: '+33612345678', parcelPointCode: point, parcelPointNetwork: point ? 'MONR' : null,
});
const user = (first: string) => ({ email: `${first}@example.com`, firstName: first, lastName: 'Fixture', name: first, phone: null });
function commande(over: Row = {}): Row {
  return {
    id: 'c1', clientUserId: CLIENT, repairerUserId: REP, delivery: 'PARCEL', status: 'PAID', step: 'PAID', parcelOption: 'RELAY', shippingQuoteId: 'q1',
    parcelWeightGrams: 500, parcelLengthCm: 20, parcelWidthCm: 12, parcelHeightCm: 8, parcelValueCents: 30_000, insuranceCents: 1520,
    outboundTrackingNumber: null, returnTrackingNumber: null, returnSentAt: null,
    demande: { title: 'Écran cassé', category: { slug: 'smartphone', parent: { slug: 'electronique' } } },
    client: user('Camille'),
    repairer: { ...user('Atelier'), profile: { verificationLevel: 'BUSINESS' }, repairerProfile: { displayName: 'Atelier Fixture' } },
    shippingAddresses: [addr('CLIENT', '11111'), addr('REPAIRER', '99439')],
    ...over,
  };
}
const leg = (l: string, over: Row = {}): Row => ({
  id: `s-${l}`, commandeId: 'c1', leg: l, status: 'PENDING', carrierCode: 'MONR', serviceCode: 'CpourToi', carrierLabel: 'Mondial Relay',
  insured: true, boxtalOrderId: null, labelStoragePath: null, firstScanAt: null, orderedAt: null, ...over,
});

function harness(c: Row = commande(), shipments: Row[] = [leg('OUTBOUND'), leg('RETURN')]) {
  const fake = new FakeShippingGateway();
  __registerBoxtalGateway(() => fake);
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k'; process.env.BOXTAL_V1_SECRET_KEY = 's';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k'; process.env.BOXTAL_V3_SECRET_KEY = 's';
  process.env.BOXTAL_WEBHOOK_SECRET = 'w'; process.env.STORAGE_DRIVER = 'fake'; process.env.OPS_EMAIL = 'ops@revime.test';
  __resetShippingGateway();
  const { prisma, state } = db(c, shipments);
  const storage = new FakeStorageGateway();
  const emit = vi.fn().mockResolvedValue(undefined);
  const advanceBySystem = vi.fn().mockResolvedValue('advanced');
  const mails: { subject: string; text: string }[] = [];
  __setMailSender({ send: async (m) => { mails.push(m); } });
  const svc = new ShipmentsService(prisma as unknown as PrismaService, { emit } as unknown as NotificationsService, { advanceBySystem } as unknown as CommandesService);
  svc.__setStorage(storage);
  return { svc, fake, storage, prisma, state, emit, advanceBySystem, mails };
}

describe('ShipmentsService orchestration', () => {
  afterEach(() => {
    __setMailSender(undefined);
    for (const k of ['SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER', 'OPS_EMAIL']) delete process.env[k];
    __resetShippingGateway();
  });

  it("afterAddressWrite orders the OUTBOUND leg once both addresses (and the réparateur's relay) exist", async () => {
    const h = harness();
    await h.svc.afterAddressWrite('c1');
    expect(h.fake.orders()).toHaveLength(1);
    const o = h.fake.orders()[0]!;
    expect(o).toMatchObject({ shippingOfferCode: 'MONR-CpourToi', insured: true, pickupPointCode: '99439', externalId: 's-OUTBOUND', contentId: 'content:v1:50113', contentDescription: 'Écran cassé' });
    expect(o.from).toMatchObject({ kind: 'RESIDENTIAL', firstName: 'Camille', postalCode: '75011', street: '10 rue Exemple' });
    expect(o.to).toMatchObject({ kind: 'BUSINESS', company: 'Atelier Fixture', postalCode: '69003' });
    // The fake bills 314 delivery + 612 insurance for an insured order.
    expect(h.state.shipments[0]).toMatchObject({ status: 'ORDERED', boxtalOrderId: o.orderId, billedExclTaxCents: 314 + 612 });
    expect(h.mails).toHaveLength(0);
  });

  it('waits: no order while an address is missing, or while the réparateur has no relay under RELAY', async () => {
    const a = harness(commande({ shippingAddresses: [addr('CLIENT', '11111')] }));
    await a.svc.afterAddressWrite('c1');
    expect(a.fake.orders()).toHaveLength(0);
    const b = harness(commande({ shippingAddresses: [addr('CLIENT', '11111'), addr('REPAIRER', null)] }));
    await b.svc.afterAddressWrite('c1');
    expect(b.fake.orders()).toHaveLength(0);
    const c = harness(commande({ parcelOption: 'HOME', shippingAddresses: [addr('CLIENT', null), addr('REPAIRER', null)] }));
    await c.svc.afterAddressWrite('c1');
    expect(c.fake.orders()).toHaveLength(1);
    expect(c.fake.orders()[0]!.pickupPointCode).toBeNull();
  });

  it('orders exactly once under two concurrent address writes - the PENDING→ORDERED CAS', async () => {
    const h = harness();
    await Promise.all([h.svc.afterAddressWrite('c1'), h.svc.afterAddressWrite('c1')]);
    expect(h.fake.orders()).toHaveLength(1);
  });

  it('a refused order marks the leg FAILED with the reason, mails ops, and does NOT retry on the next write', async () => {
    const h = harness();
    h.fake.createOrder = async () => { throw new ShippingRefusedError('InvalidPaymentException', 'no direct debit'); };
    await h.svc.afterAddressWrite('c1');
    expect(h.state.shipments[0]).toMatchObject({ status: 'FAILED', failureReason: expect.stringContaining('InvalidPaymentException') });
    expect(h.mails[0]?.subject).toContain('Étiquette Boxtal refusée');
    await h.svc.afterAddressWrite('c1');
    expect(h.mails).toHaveLength(1);
  });

  it('an insured order that Boxtal answers WITHOUT insurance is ordered (the label is real) but mailed to ops as a defect (spec Amendment 2026-09-04)', async () => {
    const h = harness();
    const real = h.fake.createOrder.bind(h.fake);
    h.fake.createOrder = async (input) => ({ ...(await real(input)), insuranceExclTaxCents: 0 });
    await h.svc.afterAddressWrite('c1');
    expect(h.state.shipments[0]).toMatchObject({ status: 'ORDERED', billedExclTaxCents: 314 });
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]?.subject).toContain('Assurance Boxtal non appliquée');
    expect(h.mails[0]?.text).toContain('1520');
  });

  it("afterStepClaim orders the RETURN leg on REPAIR_DONE, addresses reversed, the CLIENT's relay as destination", async () => {
    const h = harness(commande({ step: 'REPAIR_DONE' }), [leg('OUTBOUND', { status: 'DELIVERED' }), leg('RETURN')]);
    await h.svc.afterStepClaim('c1', 'REPAIR_DONE');
    const o = h.fake.orders()[0]!;
    expect(o.externalId).toBe('s-RETURN');
    expect(o.from).toMatchObject({ kind: 'BUSINESS', postalCode: '69003' });
    expect(o.to).toMatchObject({ kind: 'RESIDENTIAL', postalCode: '75011' });
    expect(o.pickupPointCode).toBe('11111');
    await h.svc.afterStepClaim('c1', 'REPAIR_STARTED');
    expect(h.fake.orders()).toHaveLength(1);
  });

  it('ingestDocuments stores the PDF, marks LABEL_READY, fills the tracking column only when null, notifies the sender once', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'ORDERED', boxtalOrderId: 'o1' }), leg('RETURN')]);
    h.fake.seedTracking('o1', [{ status: 'ANNOUNCED', isFinal: false, message: null, trackingNumber: 'TRK123', trackingDateTime: '2026-09-05T08:00:00Z', packageTrackingUrl: null, history: [] }]);
    await h.svc.ingestDocuments('s-OUTBOUND', [{ url: 'https://fake/o1.pdf', type: 'LABEL', format: 'PDF_A4' }]);
    expect(h.storage.bytesAt('shipping-labels', LABEL_PATH('c1', 'OUTBOUND'))).toBeDefined();
    expect(h.state.shipments[0]).toMatchObject({ status: 'LABEL_READY', labelStoragePath: LABEL_PATH('c1', 'OUTBOUND') });
    expect(h.state.commande.outboundTrackingNumber).toBe('TRK123');
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PARCEL_LABEL_READY', userId: CLIENT, step: 'PARCEL_SENT', commandeId: 'c1' }));
    await h.svc.ingestDocuments('s-OUTBOUND', [{ url: 'https://fake/o1.pdf', type: 'LABEL', format: 'PDF_A4' }]);
    expect(h.emit).toHaveBeenCalledTimes(1);
  });

  it('never overwrites a tracking number the operator already typed (deliberate break #9)', async () => {
    const h = harness(commande({ outboundTrackingNumber: 'MANUAL1' }), [leg('OUTBOUND', { status: 'ORDERED', boxtalOrderId: 'o1' }), leg('RETURN')]);
    h.fake.seedTracking('o1', [{ status: 'ANNOUNCED', isFinal: false, message: null, trackingNumber: 'TRK123', trackingDateTime: 'x', packageTrackingUrl: null, history: [] }]);
    await h.svc.ingestDocuments('s-OUTBOUND', [{ url: 'u', type: 'LABEL', format: 'PDF_A4' }]);
    expect(h.state.commande.outboundTrackingNumber).toBe('MANUAL1');
  });

  it('a non-LABEL document does nothing; a store failure leaves ORDERED and mails ops', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'ORDERED', boxtalOrderId: 'o1' }), leg('RETURN')]);
    await h.svc.ingestDocuments('s-OUTBOUND', [{ url: 'u', type: 'PROFORMA', format: 'PDF_A4' }]);
    expect(h.state.shipments[0]!.status).toBe('ORDERED');
    h.fake.failNextOnce('fetchBytes');
    await h.svc.ingestDocuments('s-OUTBOUND', [{ url: 'u', type: 'LABEL', format: 'PDF_A4' }]);
    expect(h.state.shipments[0]!.status).toBe('ORDERED');
    expect(h.mails[0]?.subject).toContain('Étiquette Boxtal non enregistrée');
  });

  it('ingestTracking: history becomes events (idempotent), status follows the map, the FIRST scan advances the sending step once', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'LABEL_READY', boxtalOrderId: 'o1', labelStoragePath: 'p' }), leg('RETURN')]);
    const t = {
      status: 'IN_TRANSIT', isFinal: false, message: 'Réception des données', trackingNumber: 'TRK123', trackingDateTime: '2026-09-06T09:00:00Z', packageTrackingUrl: 'https://t/1',
      history: [
        { status: 'IN_TRANSIT', isFinal: false, message: null, trackingDateTime: '2026-09-06T09:00:00Z' },
        { status: 'SHIPPED', isFinal: false, message: null, trackingDateTime: '2026-09-06T08:00:00Z' },
        { status: 'ANNOUNCED', isFinal: false, message: null, trackingDateTime: '2026-09-05T08:00:00Z' },
      ],
    };
    await h.svc.ingestTracking('s-OUTBOUND', [t]);
    expect(h.state.events.filter((e) => e.created)).toHaveLength(3);
    expect(h.state.shipments[0]).toMatchObject({ status: 'IN_TRANSIT', firstScanAt: expect.any(Date) });
    expect(h.advanceBySystem).toHaveBeenCalledTimes(1);
    expect(h.advanceBySystem).toHaveBeenCalledWith('c1', 'PARCEL_SENT');
    // SHIPPED notifies both parties; ANNOUNCED and IN_TRANSIT do not.
    expect(h.emit.mock.calls.filter((c) => (c[0] as { type: string }).type === 'PARCEL_SHIPPED')).toHaveLength(2);
    expect(h.emit.mock.calls.filter((c) => (c[0] as { type: string }).type === 'PARCEL_INCIDENT')).toHaveLength(0);
    await h.svc.ingestTracking('s-OUTBOUND', [t]);
    expect(h.advanceBySystem).toHaveBeenCalledTimes(1);
    expect(h.emit.mock.calls.filter((c) => (c[0] as { type: string }).type === 'PARCEL_SHIPPED')).toHaveLength(2);
  });

  it('DELIVERED is terminal for the shipment status and stamps deliveredAt; EXCEPTION mails ops', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'IN_TRANSIT', boxtalOrderId: 'o1', labelStoragePath: 'p', firstScanAt: new Date() }), leg('RETURN')]);
    await h.svc.ingestTracking('s-OUTBOUND', [{ status: 'DELIVERED', isFinal: true, message: null, trackingNumber: 'T', trackingDateTime: '2026-09-07T10:00:00Z', packageTrackingUrl: null, history: [{ status: 'DELIVERED', isFinal: true, message: null, trackingDateTime: '2026-09-07T10:00:00Z' }] }]);
    expect(h.state.shipments[0]).toMatchObject({ status: 'DELIVERED', deliveredAt: expect.any(Date) });
    await h.svc.ingestTracking('s-OUTBOUND', [{ status: 'EXCEPTION', isFinal: false, message: 'Adresse incomplète', trackingNumber: 'T', trackingDateTime: '2026-09-07T11:00:00Z', packageTrackingUrl: null, history: [{ status: 'EXCEPTION', isFinal: false, message: 'Adresse incomplète', trackingDateTime: '2026-09-07T11:00:00Z' }] }]);
    expect(h.state.shipments[0]!.status).toBe('DELIVERED');
    expect(h.mails.some((m) => m.subject.includes('Incident transporteur'))).toBe(true);
  });

  it('cancelUnshipped cancels ORDERED/LABEL_READY legs without a scan and leaves a scanned one; a failure never throws', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'IN_TRANSIT', boxtalOrderId: 'o1', firstScanAt: new Date() }), leg('RETURN', { status: 'LABEL_READY', boxtalOrderId: 'o2' })]);
    await h.svc.cancelUnshipped('c1');
    expect(h.fake.cancelled()).toEqual(['o2']);
    expect(h.state.shipments[1]).toMatchObject({ status: 'CANCELLED', cancelledAt: expect.any(Date) });
    const g = harness(commande(), [leg('OUTBOUND', { status: 'ORDERED', boxtalOrderId: 'o3' })]);
    g.fake.failNextOnce('cancelOrder');
    await expect(g.svc.cancelUnshipped('c1')).resolves.toBeUndefined();
    expect(g.mails[0]?.subject).toContain('Annulation Boxtal échouée');
  });

  it('retryLeg re-orders a FAILED leg through the same guarded path and refuses any other status', async () => {
    const h = harness(commande(), [leg('OUTBOUND', { status: 'FAILED', failureReason: 'x' }), leg('RETURN')]);
    await h.svc.retryLeg('c1', 'OUTBOUND');
    expect(h.fake.orders()).toHaveLength(1);
    await expect(h.svc.retryLeg('c1', 'RETURN')).rejects.toMatchObject({ message: "Cette expédition n'est pas en échec." });
  });
});
