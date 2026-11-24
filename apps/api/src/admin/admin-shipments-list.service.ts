import { Injectable } from '@nestjs/common';
import {
  normaliseOrderSearch,
  orderNumberFor,
  shipmentDisplayStatus,
  type AdminShipmentListItem,
  type AdminShipmentListQuery,
  type AdminShipmentListResponse,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PARCEL_STALL_AFTER_MS } from '../cron/shipment-attention.js';

export { normaliseOrderSearch };

@Injectable()
export class AdminShipmentsListService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Partial<AdminShipmentListQuery> = {}): Promise<AdminShipmentListResponse> {
    const where: Record<string, any> = {};

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    if (query.carrier) {
      where.carrierLabel = query.carrier;
    }

    if (query.leg) {
      where.leg = query.leg;
    }

    // `commande` sub-where is built incrementally, since client/repairer/commande-id/
    // tracking filters each touch it and none may silently clobber another.
    const commandeWhere: Record<string, any> = {};

    if (query.client) {
      commandeWhere.client = {
        OR: [
          { name: { contains: query.client, mode: 'insensitive' } },
          { username: { contains: query.client, mode: 'insensitive' } },
          { email: { contains: query.client, mode: 'insensitive' } },
        ],
      };
    }

    if (query.repairer) {
      commandeWhere.repairer = {
        OR: [
          { name: { contains: query.repairer, mode: 'insensitive' } },
          { username: { contains: query.repairer, mode: 'insensitive' } },
          { email: { contains: query.repairer, mode: 'insensitive' } },
        ],
      };
    }

    if (query.commande) {
      commandeWhere.id = { startsWith: normaliseOrderSearch(query.commande) };
    }

    if (query.tracking) {
      commandeWhere.OR = [
        { outboundTrackingNumber: { contains: query.tracking, mode: 'insensitive' } },
        { returnTrackingNumber: { contains: query.tracking, mode: 'insensitive' } },
      ];
    }

    if (Object.keys(commandeWhere).length > 0) {
      where.commande = commandeWhere;
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);

    const [carrierRows, rows] = await Promise.all([
      // Spec §3: carriers is the distinct set over ALL shipments, not the filtered
      // page - the filter dropdown must offer every carrier that ever shipped.
      this.prisma.shipment.findMany({
        distinct: ['carrierLabel'],
        select: { carrierLabel: true },
      }),
      this.prisma.shipment.findMany({
        where,
        include: {
          commande: {
            select: {
              id: true,
              outboundTrackingNumber: true,
              returnTrackingNumber: true,
              client: { select: { name: true } },
              repairer: { select: { name: true } },
            },
          },
          events: {
            orderBy: { occurredAt: 'desc' },
            take: 1,
            select: { status: true, occurredAt: true },
          },
        },
      }),
    ]);

    // P16: Also query unbooked parcel orders (delivery 'PARCEL' in PAID/PENDING_PAYMENT without outbound shipment)
    let unbookedCommandes: any[] = [];
    if (this.prisma.commande?.findMany) {
      const carrierMatches = !query.carrier || query.carrier === 'À configurer';
      const legMatches = !query.leg || query.leg === 'OUTBOUND';
      const trackingMatches = !query.tracking;
      const statusMatches = !query.status || query.status === 'TO_CREATE';

      if (carrierMatches && legMatches && trackingMatches && statusMatches) {
        const unbookedWhere: Record<string, any> = {
          delivery: 'PARCEL',
          status: 'PAID',
          shipments: { none: { leg: 'OUTBOUND' } },
        };

        if (query.from || query.to) {
          unbookedWhere.createdAt = {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          };
        }

        if (query.client) {
          unbookedWhere.client = {
            OR: [
              { name: { contains: query.client, mode: 'insensitive' } },
              { username: { contains: query.client, mode: 'insensitive' } },
              { email: { contains: query.client, mode: 'insensitive' } },
            ],
          };
        }

        if (query.repairer) {
          unbookedWhere.repairer = {
            OR: [
              { name: { contains: query.repairer, mode: 'insensitive' } },
              { username: { contains: query.repairer, mode: 'insensitive' } },
              { email: { contains: query.repairer, mode: 'insensitive' } },
            ],
          };
        }

        if (query.commande) {
          unbookedWhere.id = { startsWith: normaliseOrderSearch(query.commande) };
        }

        unbookedCommandes = await this.prisma.commande.findMany({
          where: unbookedWhere,
          include: {
            client: { select: { name: true } },
            repairer: { select: { name: true } },
          },
        });
      }
    }

    const carriers = carrierRows
      .map((c: { carrierLabel: string }) => c.carrierLabel)
      .sort((a: string, b: string) => a.localeCompare(b));

    if (unbookedCommandes.length > 0 && !carriers.includes('À configurer')) {
      carriers.unshift('À configurer');
    }

    const now = Date.now();

    const mapped: AdminShipmentListItem[] = rows.map((row: any) => {
      const newestEvent = row.events?.[0];
      const newestEventStatus = newestEvent?.status ?? null;
      const status = shipmentDisplayStatus({
        status: row.status,
        leg: row.leg,
        labelDownloadedAt: row.labelDownloadedAt,
        newestEventStatus,
      });
      const trackingNumber =
        row.leg === 'RETURN' ? row.commande.returnTrackingNumber : row.commande.outboundTrackingNumber;

      let isBlocked = false;
      let blockedReason: string | null = null;

      if (row.status === 'FAILED') {
        isBlocked = true;
        blockedReason = row.failureReason ? `Échec : ${row.failureReason}` : "Échec de l'expédition";
      } else if (newestEventStatus === 'EXCEPTION') {
        isBlocked = true;
        blockedReason = "Incident de transport signalé (exception transporteur)";
      } else if (newestEventStatus === 'RETURNED') {
        isBlocked = true;
        blockedReason = "Colis retourné à l'expéditeur";
      } else if (newestEventStatus === 'FAILED_ATTEMPT') {
        isBlocked = true;
        blockedReason = "Tentative de livraison échouée";
      } else if (row.status !== 'DELIVERED' && row.status !== 'CANCELLED') {
        const lastMovementDate =
          newestEvent?.occurredAt ?? row.firstScanAt ?? row.orderedAt ?? row.createdAt;
        if (lastMovementDate && now - new Date(lastMovementDate).getTime() >= PARCEL_STALL_AFTER_MS) {
          isBlocked = true;
          blockedReason = "Aucun mouvement depuis plus de 3 jours";
        }
      }

      const hasLabelPdf = Boolean(row.labelStoragePath);
      const labelReady = row.status === 'LABEL_READY' || hasLabelPdf;

      return {
        shipmentId: row.id,
        commandeId: row.commandeId,
        orderNumber: orderNumberFor(row.commandeId),
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        clientName: row.commande.client?.name ?? '',
        repairerName: row.commande.repairer?.name ?? '',
        carrierLabel: row.carrierLabel,
        leg: row.leg,
        status,
        displayStatus: status,
        trackingNumber: trackingNumber ?? null,
        isBlocked,
        blockedReason,
        labelReady,
        hasLabelPdf,
      };
    });

    const unbookedMapped: AdminShipmentListItem[] = unbookedCommandes.map((c: any) => ({
      shipmentId: `unbooked-${c.id}`,
      commandeId: c.id,
      orderNumber: orderNumberFor(c.id),
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      clientName: c.client?.name ?? '',
      repairerName: c.repairer?.name ?? '',
      carrierLabel: 'À configurer',
      leg: 'OUTBOUND' as const,
      status: 'TO_CREATE',
      displayStatus: 'A_COMMANDER',
      trackingNumber: null,
      isBlocked: false,
      blockedReason: null,
      labelReady: false,
      hasLabelPdf: false,
    }));

    const allMapped = [...mapped, ...unbookedMapped];

    // Spec §2 F6: the status is derived (needs the newest event, not a stored
    // column), so it is filtered in memory AFTER the SQL filters and BEFORE
    // pagination - `total` is the count of this filtered set, not the SQL
    // where's row count. A stored status column is the path if volume grows.
    const filtered = query.status ? allMapped.filter((item) => item.status === query.status) : allMapped;

    const sorted = filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    const total = sorted.length;
    const skip = (page - 1) * pageSize;
    const items = sorted.slice(skip, skip + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      carriers,
    };
  }
}
