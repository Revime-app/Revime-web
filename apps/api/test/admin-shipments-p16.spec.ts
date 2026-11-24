import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminShipmentsListService } from '../src/admin/admin-shipments-list.service.js';
import { ShipmentsService } from '../src/shipping/shipments.service.js';
import { adminCreateShipmentSchema } from '@revime/shared';

describe('Task 16: P16 — Étiquettes colis (/colis), ShipmentsList & Admin Shipment Operations', () => {
  describe('AdminShipmentsListService.list consolidated parcel queries', () => {
    let prisma: any;
    let service: AdminShipmentsListService;

    beforeEach(() => {
      prisma = {
        shipment: {
          findMany: vi.fn(),
        },
        commande: {
          findMany: vi.fn(),
        },
      };
      service = new AdminShipmentsListService(prisma);
    });

    it('returns orders in delivery: PARCEL awaiting label creation in addition to booked Shipment entities', async () => {
      // 1 active shipment
      const bookedShipment = {
        id: 'ship-101',
        commandeId: 'cmd-booked-1',
        leg: 'OUTBOUND' as const,
        status: 'IN_TRANSIT' as const,
        carrierLabel: 'Colissimo',
        labelDownloadedAt: new Date('2026-10-10T10:00:00Z'),
        labelStoragePath: 'labels/cmd-booked-1/OUTBOUND.pdf',
        createdAt: new Date('2026-10-10T09:00:00Z'),
        commande: {
          id: 'cmd-booked-1',
          outboundTrackingNumber: 'COLI-999',
          returnTrackingNumber: null,
          client: { name: 'Alice Client' },
          repairer: { name: 'Bob Réparateur' },
        },
        events: [{ status: 'SHIPPED', occurredAt: new Date('2026-10-10T12:00:00Z') }],
      };

      // 1 unbooked parcel commande
      const unbookedCommande = {
        id: 'cmd-unbooked-1',
        createdAt: new Date('2026-10-12T14:00:00Z'),
        delivery: 'PARCEL',
        status: 'PAID',
        client: { name: 'Charlie Client' },
        repairer: { name: 'David Réparateur' },
        shipments: [],
      };

      prisma.shipment.findMany
        .mockResolvedValueOnce([{ carrierLabel: 'Colissimo' }]) // distinct carriers
        .mockResolvedValueOnce([bookedShipment]); // booked shipments
      prisma.commande.findMany.mockResolvedValueOnce([unbookedCommande]); // unbooked orders

      const result = await service.list({ page: 1, pageSize: 25 });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);

      // Booked item assertion
      const bookedItem = result.items.find((i) => i.commandeId === 'cmd-booked-1');
      expect(bookedItem).toBeDefined();
      expect(bookedItem?.carrierLabel).toBe('Colissimo');
      expect(bookedItem?.trackingNumber).toBe('COLI-999');
      expect(bookedItem?.hasLabelPdf).toBe(true);
      expect(bookedItem?.labelReady).toBe(true);

      // Unbooked item assertion (synthesized)
      const unbookedItem = result.items.find((i) => i.commandeId === 'cmd-unbooked-1');
      expect(unbookedItem).toBeDefined();
      expect(unbookedItem?.carrierLabel).toBe('À configurer');
      expect(unbookedItem?.displayStatus).toBe('A_COMMANDER');
      expect(unbookedItem?.hasLabelPdf).toBe(false);
      expect(unbookedItem?.labelReady).toBe(false);
      expect(unbookedItem?.isBlocked).toBe(false);
      expect(unbookedItem?.clientName).toBe('Charlie Client');
      expect(unbookedItem?.repairerName).toBe('David Réparateur');
    });

    it('detects blocked parcels with isBlocked: true and sets descriptive blockedReason', async () => {
      const now = Date.now();
      const fourDaysAgo = new Date(now - 4 * 24 * 3600 * 1000);
      const oneHourAgo = new Date(now - 3600 * 1000);

      const rows = [
        // Failed shipment
        {
          id: 'ship-failed',
          commandeId: 'cmd-failed',
          leg: 'OUTBOUND' as const,
          status: 'FAILED' as const,
          failureReason: 'Poids non conforme',
          carrierLabel: 'Mondial Relay',
          labelDownloadedAt: null,
          labelStoragePath: null,
          createdAt: fourDaysAgo,
          commande: {
            id: 'cmd-failed',
            outboundTrackingNumber: null,
            returnTrackingNumber: null,
            client: { name: 'Client 1' },
            repairer: { name: 'Rep 1' },
          },
          events: [],
        },
        // Carrier exception event
        {
          id: 'ship-exception',
          commandeId: 'cmd-exception',
          leg: 'OUTBOUND' as const,
          status: 'IN_TRANSIT' as const,
          carrierLabel: 'Colissimo',
          labelDownloadedAt: fourDaysAgo,
          labelStoragePath: 'labels/cmd-exception/OUTBOUND.pdf',
          createdAt: fourDaysAgo,
          commande: {
            id: 'cmd-exception',
            outboundTrackingNumber: 'TRK-EXC',
            returnTrackingNumber: null,
            client: { name: 'Client 2' },
            repairer: { name: 'Rep 2' },
          },
          events: [{ status: 'EXCEPTION', occurredAt: oneHourAgo }],
        },
        // Stale tracking (>= 3 days without scan/event)
        {
          id: 'ship-stale',
          commandeId: 'cmd-stale',
          leg: 'OUTBOUND' as const,
          status: 'IN_TRANSIT' as const,
          carrierLabel: 'Chronopost',
          labelDownloadedAt: fourDaysAgo,
          labelStoragePath: 'labels/cmd-stale/OUTBOUND.pdf',
          createdAt: fourDaysAgo,
          commande: {
            id: 'cmd-stale',
            outboundTrackingNumber: 'TRK-STALE',
            returnTrackingNumber: null,
            client: { name: 'Client 3' },
            repairer: { name: 'Rep 3' },
          },
          events: [{ status: 'SHIPPED', occurredAt: fourDaysAgo }],
        },
        // Healthy moving parcel
        {
          id: 'ship-healthy',
          commandeId: 'cmd-healthy',
          leg: 'OUTBOUND' as const,
          status: 'IN_TRANSIT' as const,
          carrierLabel: 'Colissimo',
          labelDownloadedAt: oneHourAgo,
          labelStoragePath: 'labels/cmd-healthy/OUTBOUND.pdf',
          createdAt: oneHourAgo,
          commande: {
            id: 'cmd-healthy',
            outboundTrackingNumber: 'TRK-OK',
            returnTrackingNumber: null,
            client: { name: 'Client 4' },
            repairer: { name: 'Rep 4' },
          },
          events: [{ status: 'SHIPPED', occurredAt: oneHourAgo }],
        },
      ];

      prisma.shipment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(rows);
      prisma.commande.findMany.mockResolvedValueOnce([]);

      const result = await service.list({ page: 1, pageSize: 25 });

      const failed = result.items.find((i) => i.commandeId === 'cmd-failed');
      expect(failed?.isBlocked).toBe(true);
      expect(failed?.blockedReason).toContain('Poids non conforme');

      const exc = result.items.find((i) => i.commandeId === 'cmd-exception');
      expect(exc?.isBlocked).toBe(true);
      expect(exc?.blockedReason).toBeDefined();

      const stale = result.items.find((i) => i.commandeId === 'cmd-stale');
      expect(stale?.isBlocked).toBe(true);
      expect(stale?.blockedReason).toBeDefined();

      const healthy = result.items.find((i) => i.commandeId === 'cmd-healthy');
      expect(healthy?.isBlocked).toBe(false);
      expect(healthy?.blockedReason).toBeNull();
    });
  });

  describe('ShipmentsService admin operations', () => {
    let prisma: any;
    let notifications: any;
    let service: ShipmentsService;
    let storage: any;

    beforeEach(() => {
      prisma = {
        commande: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          updateMany: vi.fn(),
          update: vi.fn(),
        },
        shipment: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      };
      notifications = {
        emit: vi.fn().mockResolvedValue(undefined),
      };
      storage = {
        createSignedReadUrls: vi.fn(),
      };
      service = new ShipmentsService(prisma, notifications, {} as any);
      service.__setStorage(storage);
    });

    it('getAdminLabelUrl returns signed storage URL without user ownership check', async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: 'ship-1',
        labelStoragePath: 'labels/cmd-123/OUTBOUND.pdf',
      });
      storage.createSignedReadUrls.mockResolvedValue(
        new Map([['labels/cmd-123/OUTBOUND.pdf', 'https://storage.example.com/signed-label.pdf']])
      );

      const result = await service.getAdminLabelUrl('cmd-123', 'OUTBOUND');

      expect(result).toEqual({ url: 'https://storage.example.com/signed-label.pdf' });
      expect(prisma.shipment.findFirst).toHaveBeenCalledWith({
        where: { commandeId: 'cmd-123', leg: 'OUTBOUND' },
        select: { id: true, labelStoragePath: true },
      });
    });

    it('getAdminLabelUrl throws UNPROCESSABLE_ENTITY when label storage path is missing', async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: 'ship-1',
        labelStoragePath: null,
      });

      await expect(service.getAdminLabelUrl('cmd-123', 'OUTBOUND')).rejects.toThrow();
    });

    it('sendDropoffReminder dispatches reminder notification to sender', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-remind-1',
        clientUserId: 'usr-client-1',
        repairerUserId: 'usr-rep-1',
        demande: { title: 'Réparation Drone' },
      });
      prisma.shipment.findFirst.mockResolvedValue({
        id: 'ship-remind-1',
        status: 'LABEL_READY',
      });

      const res = await service.sendDropoffReminder('cmd-remind-1', 'OUTBOUND');

      expect(res).toEqual({ ok: true });
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-client-1',
          mode: 'CLIENT',
          type: 'PARCEL_LABEL_READY',
          commandeId: 'cmd-remind-1',
        })
      );
    });

    it('sendDropoffReminder refuses a missing, delivered, unlabelled or in-transit leg and a bad leg', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-remind-2',
        clientUserId: 'usr-client-2',
        repairerUserId: 'usr-rep-2',
      });
      prisma.shipment.findFirst.mockResolvedValue(null);
      await expect(service.sendDropoffReminder('cmd-remind-2', 'OUTBOUND')).rejects.toThrow(
        "Aucune expédition n'a été créée pour cette étape."
      );

      prisma.shipment.findFirst.mockResolvedValue({ id: 's', status: 'DELIVERED' });
      await expect(service.sendDropoffReminder('cmd-remind-2', 'OUTBOUND')).rejects.toThrow(
        'Le colis est déjà livré ou annulé.'
      );

      for (const status of ['PENDING', 'FAILED', 'IN_TRANSIT']) {
        prisma.shipment.findFirst.mockResolvedValue({ id: 's', status });
        await expect(service.sendDropoffReminder('cmd-remind-2', 'OUTBOUND')).rejects.toThrow(
          "Aucune étiquette n'est en attente de dépôt pour cette étape."
        );
      }
      expect(notifications.emit).not.toHaveBeenCalled();

      await expect(service.sendDropoffReminder('cmd-remind-2', 'SIDEWAYS')).rejects.toThrow('Trajet invalide.');
    });

    describe('adminCreateShipment', () => {
      function ordering(outcome: 'ordered' | 'skipped' | 'failed') {
        return vi.spyOn(service, 'orderLeg').mockResolvedValue(outcome);
      }

      beforeEach(() => {
        prisma.commande.findFirst.mockResolvedValue({ id: 'cmd-create-1' });
        prisma.shipment.findUnique.mockResolvedValue(null);
        prisma.shipment.create.mockResolvedValue({ id: 'ship-created-1' });
        prisma.shipment.update.mockResolvedValue({ id: 'ship-existing-1' });
        prisma.commande.update.mockResolvedValue({});
      });

      it('creates the leg with NO invented price, stores the weight and orders it through orderLeg', async () => {
        const order = ordering('ordered');

        const res = await service.adminCreateShipment('cmd-create-1', 'OUTBOUND', 'colissimo', 500);

        expect(res).toEqual({ ok: true, shipmentId: 'ship-created-1', carrierLabel: 'Colissimo' });
        expect(prisma.commande.update).toHaveBeenCalledWith({ where: { id: 'cmd-create-1' }, data: { parcelWeightGrams: 500 } });
        const data = prisma.shipment.create.mock.calls[0]![0].data;
        expect(data).toMatchObject({ quotedCostExclTaxCents: 0, quotedCostInclTaxCents: 0, carrierLabel: 'Colissimo' });
        expect(order).toHaveBeenCalledWith('cmd-create-1', 'OUTBOUND');
      });

      it('only accepts a PAID parcel order', async () => {
        const order = ordering('ordered');
        prisma.commande.findFirst.mockResolvedValue(null);

        await expect(service.adminCreateShipment('cmd-x', 'OUTBOUND', 'colissimo')).rejects.toThrow(
          'Seule une commande payée en livraison par colis peut recevoir une étiquette.'
        );
        expect(prisma.commande.findFirst).toHaveBeenCalledWith({
          where: { id: 'cmd-x', delivery: 'PARCEL', status: 'PAID' },
          select: { id: true },
        });
        expect(prisma.shipment.create).not.toHaveBeenCalled();
        expect(order).not.toHaveBeenCalled();
      });

      it('never resets a leg that already holds a Boxtal order, a label or a scan (no second purchase)', async () => {
        const order = ordering('ordered');
        for (const existing of [
          { id: 's', status: 'ORDERED', boxtalOrderId: 'BX-1' },
          { id: 's', status: 'LABEL_READY', boxtalOrderId: 'BX-1' },
          { id: 's', status: 'IN_TRANSIT', boxtalOrderId: null },
          { id: 's', status: 'DELIVERED', boxtalOrderId: 'BX-1' },
          { id: 's', status: 'FAILED', boxtalOrderId: 'BX-1' },
        ]) {
          prisma.shipment.findUnique.mockResolvedValue(existing);
          await expect(service.adminCreateShipment('cmd-create-1', 'OUTBOUND', 'chronopost')).rejects.toThrow(
            'Une étiquette a déjà été commandée pour ce trajet'
          );
        }
        expect(prisma.shipment.update).not.toHaveBeenCalled();
        expect(order).not.toHaveBeenCalled();
      });

      it('lets the operator change the carrier of a leg Boxtal refused (FAILED, no order id)', async () => {
        ordering('ordered');
        prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-existing-1', status: 'FAILED', boxtalOrderId: null });

        const res = await service.adminCreateShipment('cmd-create-1', 'INBOUND', 'mondial_relay');

        expect(res.shipmentId).toBe('ship-existing-1');
        expect(prisma.shipment.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { commandeId_leg: { commandeId: 'cmd-create-1', leg: 'RETURN' } } })
        );
        expect(prisma.shipment.update.mock.calls[0]![0].data).toMatchObject({
          carrierLabel: 'Mondial Relay',
          status: 'PENDING',
          failureReason: null,
        });
      });

      it('is an error, never a success, when the order is not placed', async () => {
        ordering('skipped');
        await expect(service.adminCreateShipment('cmd-create-1', 'OUTBOUND', 'colissimo')).rejects.toThrow(
          'Les conditions de commande ne sont pas réunies'
        );
        ordering('failed');
        await expect(service.adminCreateShipment('cmd-create-1', 'OUTBOUND', 'colissimo')).rejects.toThrow(
          "Boxtal a refusé la commande d'étiquette"
        );
      });

      it('lets a failed weight write surface instead of ordering with the wrong weight', async () => {
        const order = ordering('ordered');
        prisma.commande.update.mockRejectedValue(new Error('db down'));
        await expect(service.adminCreateShipment('cmd-create-1', 'OUTBOUND', 'colissimo', 700)).rejects.toThrow('db down');
        expect(order).not.toHaveBeenCalled();
      });
    });
  });

  describe('adminCreateShipmentSchema validation', () => {
    it('validates carrier, leg and optional weight', () => {
      const parsed = adminCreateShipmentSchema.parse({
        leg: 'OUTBOUND',
        carrier: 'colissimo',
        weightGrams: 450,
      });
      expect(parsed.leg).toBe('OUTBOUND');
      expect(parsed.carrier).toBe('colissimo');
      expect(parsed.weightGrams).toBe(450);
    });

    it('accepts INBOUND or RETURN and mondial_relay / chronopost', () => {
      const parsed1 = adminCreateShipmentSchema.parse({
        leg: 'INBOUND',
        carrier: 'mondial_relay',
      });
      expect(parsed1.carrier).toBe('mondial_relay');

      const parsed2 = adminCreateShipmentSchema.parse({
        leg: 'RETURN',
        carrier: 'chronopost',
      });
      expect(parsed2.carrier).toBe('chronopost');
    });

    it('rejects invalid carrier or negative weight', () => {
      expect(() =>
        adminCreateShipmentSchema.parse({
          leg: 'OUTBOUND',
          carrier: 'fedex' as any,
        })
      ).toThrow();

      expect(() =>
        adminCreateShipmentSchema.parse({
          leg: 'OUTBOUND',
          carrier: 'colissimo',
          weightGrams: -10,
        })
      ).toThrow();
    });
  });
});
