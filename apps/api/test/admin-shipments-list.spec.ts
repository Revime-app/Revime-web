import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AdminShipmentsListService,
  normaliseOrderSearch,
} from '../src/admin/admin-shipments-list.service.js';

function makePrismaMock() {
  return {
    shipment: {
      findMany: vi.fn(),
    },
  } as any;
}

const baseRow = {
  id: 'ship-1',
  commandeId: 'aaaaaaaa-1111-2222-3333-444444444444',
  leg: 'OUTBOUND' as const,
  status: 'IN_TRANSIT' as const,
  carrierLabel: 'Chronopost',
  labelDownloadedAt: null,
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  commande: {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    outboundTrackingNumber: 'TRACK-OUT-1',
    returnTrackingNumber: null,
    client: { id: 'usr-client-1', name: 'Claire Dupont', username: 'claire', email: 'claire@example.com' },
    repairer: { id: 'usr-repairer-1', name: 'David Atelier', username: 'david', email: 'david@example.com' },
  },
  events: [{ status: 'SHIPPED' }],
};

describe('normaliseOrderSearch', () => {
  it('trims whitespace', () => {
    expect(normaliseOrderSearch('  aaaaaaaa  ')).toBe('aaaaaaaa');
  });

  it('strips one leading #', () => {
    expect(normaliseOrderSearch('#aaaaaaaa')).toBe('aaaaaaaa');
  });

  it('strips a leading cmd- case-insensitively', () => {
    expect(normaliseOrderSearch('cmd-aaaaaaaa')).toBe('aaaaaaaa');
    expect(normaliseOrderSearch('CMD-aaaaaaaa')).toBe('aaaaaaaa');
    expect(normaliseOrderSearch('Cmd-AAAAAAAA')).toBe('aaaaaaaa');
  });

  it('lowercases the result', () => {
    expect(normaliseOrderSearch('AAAAAAAA')).toBe('aaaaaaaa');
  });

  it('combines # and cmd- and mixed case in one input', () => {
    expect(normaliseOrderSearch('  #CMD-AaAaAaAa  ')).toBe('aaaaaaaa');
  });

  it('only strips ONE leading #, not a #cmd- double marker collapsed twice', () => {
    // '#cmd-xyz' -> strip '#' -> 'cmd-xyz' -> strip 'cmd-' -> 'xyz'
    expect(normaliseOrderSearch('#cmd-xyz')).toBe('xyz');
  });
});

describe('AdminShipmentsListService', () => {
  let prisma: any;
  let service: AdminShipmentsListService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminShipmentsListService(prisma);
  });

  describe('where-building: each filter reaches the where', () => {
    beforeEach(() => {
      prisma.shipment.findMany.mockResolvedValue([]);
    });

    it('filters by period (createdAt from/to)', async () => {
      await service.list({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
        page: 1,
        pageSize: 25,
      } as any);

      // carriers call is distinct findMany; the list call is the second one
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.createdAt).toEqual({
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T00:00:00.000Z'),
      });
    });

    it('filters by carrier (carrierLabel equals)', async () => {
      await service.list({ carrier: 'Chronopost', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.carrierLabel).toBe('Chronopost');
    });

    it('filters by leg', async () => {
      await service.list({ leg: 'RETURN', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.leg).toBe('RETURN');
    });

    it('filters by client (name/username/email OR, insensitive)', async () => {
      await service.list({ client: 'claire', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.commande.client.OR).toEqual([
        { name: { contains: 'claire', mode: 'insensitive' } },
        { username: { contains: 'claire', mode: 'insensitive' } },
        { email: { contains: 'claire', mode: 'insensitive' } },
      ]);
    });

    it('filters by repairer (name/username/email OR, insensitive)', async () => {
      await service.list({ repairer: 'david', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.commande.repairer.OR).toEqual([
        { name: { contains: 'david', mode: 'insensitive' } },
        { username: { contains: 'david', mode: 'insensitive' } },
        { email: { contains: 'david', mode: 'insensitive' } },
      ]);
    });

    it('filters by commande search: strips #, cmd-, lowercases, then startsWith', async () => {
      await service.list({ commande: '#CMD-AaAaAaAa', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.commande.id).toEqual({ startsWith: 'aaaaaaaa' });
    });

    it('filters by tracking number: OR over outbound/return tracking, contains', async () => {
      await service.list({ tracking: 'TRACK-1', page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.where.commande.OR).toEqual([
        { outboundTrackingNumber: { contains: 'TRACK-1', mode: 'insensitive' } },
        { returnTrackingNumber: { contains: 'TRACK-1', mode: 'insensitive' } },
      ]);
    });

    it('includes events ordered occurredAt desc, take 1, select status and occurredAt', async () => {
      await service.list({ page: 1, pageSize: 25 } as any);
      const listCall = prisma.shipment.findMany.mock.calls.find(
        (c: any[]) => c[0]?.where !== undefined,
      )![0];
      expect(listCall.include.events).toEqual({
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { status: true, occurredAt: true },
      });
    });
  });

  describe('status filter applied after derivation (in-memory)', () => {
    it('filters rows by derived display status and computes total from filtered count', async () => {
      const rows = [
        { ...baseRow, id: 'ship-1', status: 'IN_TRANSIT', events: [{ status: 'SHIPPED' }] }, // HANDED_OVER
        { ...baseRow, id: 'ship-2', status: 'DELIVERED', events: [] }, // DELIVERED
        { ...baseRow, id: 'ship-3', status: 'CANCELLED', events: [] }, // CANCELLED
      ];
      prisma.shipment.findMany
        .mockResolvedValueOnce([{ carrierLabel: 'Chronopost' }]) // carriers call
        .mockResolvedValueOnce(rows); // list call

      const res = await service.list({ status: 'DELIVERED', page: 1, pageSize: 25 } as any);

      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.shipmentId).toBe('ship-2');
    });
  });

  describe('sorting and pagination', () => {
    it('sorts by createdAt desc and paginates page 2', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        ...baseRow,
        id: `ship-${i}`,
        createdAt: new Date(2026, 8, i + 1),
        events: [],
        status: 'PENDING',
      }));
      prisma.shipment.findMany
        .mockResolvedValueOnce([]) // carriers
        .mockResolvedValueOnce(rows); // list

      const res = await service.list({ page: 2, pageSize: 25 } as any);

      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(25);
      expect(res.total).toBe(30);
      // Page 2 = items 25..29 of the sorted-desc list (newest first, i.e. ship-29 first)
      expect(res.items).toHaveLength(5);
      // The full sorted (desc by createdAt) order has ship-29 first; page 2 skips 25.
      expect(res.items[0]?.shipmentId).toBe('ship-4');
    });
  });

  describe('carriers', () => {
    it('returns distinct carrierLabel over ALL shipments, sorted', async () => {
      prisma.shipment.findMany
        .mockResolvedValueOnce([
          { carrierLabel: 'Mondial Relay' },
          { carrierLabel: 'Chronopost' },
        ])
        .mockResolvedValueOnce([]);

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(prisma.shipment.findMany).toHaveBeenCalledWith({
        distinct: ['carrierLabel'],
        select: { carrierLabel: true },
      });
      expect(res.carriers).toEqual(['Chronopost', 'Mondial Relay']);
    });
  });

  describe('mapping', () => {
    it('maps a row to an AdminShipmentListItem with orderNumber, party names, tracking', async () => {
      prisma.shipment.findMany
        .mockResolvedValueOnce([]) // carriers
        .mockResolvedValueOnce([baseRow]); // list

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(res.items[0]).toEqual({
        shipmentId: 'ship-1',
        commandeId: 'aaaaaaaa-1111-2222-3333-444444444444',
        orderNumber: '#CMD-AAAAAAAA',
        createdAt: '2026-09-20T10:00:00.000Z',
        clientName: 'Claire Dupont',
        repairerName: 'David Atelier',
        carrierLabel: 'Chronopost',
        leg: 'OUTBOUND',
        status: 'HANDED_OVER',
        displayStatus: 'HANDED_OVER',
        trackingNumber: 'TRACK-OUT-1',
        isBlocked: true,
        blockedReason: 'Aucun mouvement depuis plus de 3 jours',
        labelReady: false,
        hasLabelPdf: false,
      });
    });

    it('uses returnTrackingNumber for a RETURN leg', async () => {
      const row = {
        ...baseRow,
        leg: 'RETURN' as const,
        commande: {
          ...baseRow.commande,
          outboundTrackingNumber: 'TRACK-OUT-1',
          returnTrackingNumber: 'TRACK-RET-1',
        },
      };
      prisma.shipment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

      const res = await service.list({ page: 1, pageSize: 25 } as any);
      expect(res.items[0]?.trackingNumber).toBe('TRACK-RET-1');
    });

    it('falls back to empty string when client or repairer name is missing', async () => {
      const row = {
        ...baseRow,
        commande: {
          ...baseRow.commande,
          client: null,
          repairer: null,
        },
      };
      prisma.shipment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

      const res = await service.list({ page: 1, pageSize: 25 } as any);
      expect(res.items[0]?.clientName).toBe('');
      expect(res.items[0]?.repairerName).toBe('');
    });
  });
});
