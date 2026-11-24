import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { SCAN_ADVANCES, trackingEffectFor, type AdminCreateShipmentInput, type CommandeStep, type ParcelPointDto, type ShipmentLeg } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { CommandesService } from '../commandes/commandes.service.js';
import { SHIPPING_INCIDENT_SUBJECT, sendShippingOpsMail, type ShippingOpsInput } from '../commandes/ops-mail.js';
import { AdminAlertsService } from '../admin/admin-alerts.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { storageGateway, type StorageGateway } from '../storage/gateway.js';
import { isShippingQuotesEnabled, shippingLabelBucket } from './config.js';
import { contentIdFor } from './content-codes.js';
import {
  shippingGateway,
  ShippingRefusedError,
  ShippingUnavailableError,
  type BoxtalDocument,
  type CreateOrderInput,
  type OrderAddress,
  type PackageTracking,
} from './gateway.js';
import { nextWorkingDay, QUOTE_UNAVAILABLE, QUOTES_OFF } from './shipping-quotes.service.js';
import { claimBoxtalEvent } from './boxtal-event-claim.js';

const NOT_FOUND = 'Ressource introuvable.';
const NOT_PAID = "Cette commande n'est pas encore payée.";
const NOT_RELAY = "Cette commande n'utilise pas de point relais.";
const LABEL_NOT_READY = "L'étiquette n'est pas encore disponible.";
const SEARCH_INPUT = 'Code postal et ville requis.';
const NOT_FAILED = "Cette expédition n'est pas en échec.";
const NOT_ORDERABLE = 'Les conditions de commande ne sont pas réunies (adresses, point relais).';
const NOT_A_PAID_PARCEL = "Seule une commande payée en livraison par colis peut recevoir une étiquette.";
const SHIPMENT_ALREADY_ORDERED = 'Une étiquette a déjà été commandée pour ce trajet : elle ne peut pas être commandée une seconde fois.';
const ORDER_REFUSED = "Boxtal a refusé la commande d'étiquette : le motif est dans la liste des colis et dans l'e-mail d'incident.";
const REMINDER_NOT_APPLICABLE = "Aucune étiquette n'est en attente de dépôt pour cette étape.";

/**
 * The carriers an operator can choose on /colis (P16). 🛑 The service codes are NOT Boxtal's own
 * offer codes (those come from a quote, e.g. `MONR`): until the choice is built from a live Boxtal
 * quote of the order, Boxtal may refuse the order, and that refusal is surfaced (ISS-099), never hidden.
 */
const ADMIN_CARRIER_OFFERS: Record<
  AdminCreateShipmentInput['carrier'],
  { carrierCode: string; serviceCode: string; carrierLabel: string }
> = {
  colissimo: { carrierCode: 'colissimo', serviceCode: 'domicile', carrierLabel: 'Colissimo' },
  mondial_relay: { carrierCode: 'mondial_relay', serviceCode: 'point_relais', carrierLabel: 'Mondial Relay' },
  chronopost: { carrierCode: 'chronopost', serviceCode: 'express', carrierLabel: 'Chronopost' },
};
type AdminCarrier = AdminCreateShipmentInput['carrier'];

/** The label PDF is small (3 490 bytes in the sandbox); five megabytes is a generous ceiling, not a target. */
export const LABEL_MAX_BYTES = 5 * 1024 * 1024;
export const LABEL_PATH = (commandeId: string, leg: ShipmentLeg): string => `labels/${commandeId}/${leg}.pdf`;
/** Spec §8.4. A label that has not arrived five minutes after the order is polled rather than waited for. */
export const LABEL_POLL_AFTER_MS = 5 * 60_000;
/** Spec §8.4. Tracking quiet for a day is re-read from Boxtal by the sweep. */
export const TRACKING_STALE_AFTER_MS = 24 * 3_600_000;
/** The on-read poll runs inside GET /commandes/:id, so it gets a bounded slice of the reader's patience. */
const POLL_BUDGET_MS = 3_000;

function withinBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ShippingUnavailableError('poll budget exceeded')), ms);
  });
  return Promise.race([work, budget]).finally(() => clearTimeout(timer));
}

type Person = { email: string; firstName: string | null; lastName: string | null; name: string };
type AddressRow = {
  role: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  phone: string;
  parcelPointCode: string | null;
};

/**
 * Livraison Boxtal, spec §8 - the orchestration after payment: order each leg exactly once,
 * store the label, turn the carrier's events into the timeline and the two SENDING steps, cancel
 * what has not shipped after a refund, and mail ops on every failure the driver cannot mend.
 * The two read helpers (spec §7.5, §7.6) live here too because they read the rows this owns.
 */
@Injectable()
export class ShipmentsService {
  private storage: StorageGateway | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => CommandesService)) private readonly commandes: CommandesService,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  /**
   * Every shipping ops mail is an incident an operator must act on, so it is also an F7 alert: the
   * mail reaches OPS_EMAIL, the bell reaches whoever has the admin open. One funnel, so a new kind
   * of incident cannot be mailed and forgotten by the bell.
   */
  private async reportIncident(input: ShippingOpsInput): Promise<void> {
    await sendShippingOpsMail(input);
    await this.alerts?.raise({
      type: 'PARCEL_INCIDENT',
      title: SHIPPING_INCIDENT_SUBJECT[input.kind],
      message: `${input.demandeTitle} (${input.leg === 'OUTBOUND' ? 'aller' : 'retour'}) : ${input.detail}`,
      targetType: 'Commande',
      targetId: input.commandeId,
      link: `/commandes/${input.commandeId}`,
      metadata: { kind: input.kind, leg: input.leg },
    });
  }

  /** Test-only seam; production resolves `storageGateway()` lazily. */
  __setStorage(s: StorageGateway): void {
    this.storage = s;
  }
  private store(): StorageGateway {
    return this.storage ?? storageGateway();
  }

  /** Spec §8.1. Called by the controller after each address write. Never throws. */
  async afterAddressWrite(commandeId: string): Promise<void> {
    if (!isShippingQuotesEnabled()) return;
    try {
      await this.orderLeg(commandeId, 'OUTBOUND');
    } catch (e) {
      console.error('[shipping] afterAddressWrite %s', commandeId, e);
    }
  }

  /** Spec §8.2. Called by the controller after a step claim. Orders the return at REPAIR_DONE. */
  async afterStepClaim(commandeId: string, step: CommandeStep): Promise<void> {
    if (!isShippingQuotesEnabled() || step !== 'REPAIR_DONE') return;
    try {
      await this.orderLeg(commandeId, 'RETURN');
    } catch (e) {
      console.error('[shipping] afterStepClaim %s', commandeId, e);
    }
  }

  /** Admin retry (spec §7.8): only from FAILED, through the SAME guarded path. */
  async retryLeg(commandeId: string, leg: ShipmentLeg): Promise<void> {
    const reset = await this.prisma.shipment.updateMany({
      where: { commandeId, leg, status: 'FAILED' },
      data: { status: 'PENDING', failureReason: null },
    });
    if (reset.count === 0) throw new AppException('UNPROCESSABLE_ENTITY', NOT_FAILED);
    const outcome = await this.orderLeg(commandeId, leg);
    if (outcome === 'skipped') throw new AppException('UNPROCESSABLE_ENTITY', NOT_ORDERABLE);
  }

  /**
   * One guarded write claims the leg (PENDING → ORDERED); count 0 means another request or a
   * concurrent webhook got there first. Preconditions are read in one query.
   */
  async orderLeg(commandeId: string, leg: ShipmentLeg): Promise<'ordered' | 'skipped' | 'failed'> {
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, delivery: 'PARCEL', status: 'PAID', shippingQuoteId: { not: null } },
      select: {
        id: true,
        parcelOption: true,
        parcelWeightGrams: true,
        parcelLengthCm: true,
        parcelWidthCm: true,
        parcelHeightCm: true,
        parcelValueCents: true,
        insuranceCents: true,
        demande: { select: { title: true, category: { select: { slug: true, parent: { select: { slug: true } } } } } },
        client: { select: { email: true, firstName: true, lastName: true, name: true } },
        repairer: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            name: true,
            profile: { select: { verificationLevel: true } },
            repairerProfile: { select: { displayName: true } },
          },
        },
        shippingAddresses: true,
        shipments: true,
      },
    });
    if (
      !row ||
      !row.parcelOption ||
      row.parcelWeightGrams === null ||
      row.parcelLengthCm === null ||
      row.parcelWidthCm === null ||
      row.parcelHeightCm === null ||
      row.parcelValueCents === null
    ) {
      return 'skipped';
    }
    const addresses = row.shippingAddresses as AddressRow[];
    const client = addresses.find((a) => a.role === 'CLIENT');
    const repairer = addresses.find((a) => a.role === 'REPAIRER');
    if (!client || !repairer) return 'skipped';
    // The party who COLLECTS this leg chooses the relay: the réparateur outbound, the client on return.
    const collector = leg === 'OUTBOUND' ? repairer : client;
    if (row.parcelOption === 'RELAY' && !collector.parcelPointCode) return 'skipped';
    const shipment = row.shipments.find((s) => s.leg === leg);
    if (!shipment || shipment.status !== 'PENDING') return 'skipped';

    const claimed = await this.prisma.shipment.updateMany({
      where: { id: shipment.id, status: 'PENDING' },
      data: { status: 'ORDERED', orderedAt: new Date() },
    });
    if (claimed.count === 0) return 'skipped';

    const person = (u: Person, a: AddressRow, kind: 'RESIDENTIAL' | 'BUSINESS', company: string | null): OrderAddress => ({
      kind,
      firstName: u.firstName ?? u.name,
      lastName: u.lastName ?? u.name,
      email: u.email,
      phone: a.phone,
      company,
      street: a.line1,
      additionalInformation: a.line2,
      city: a.city,
      postalCode: a.postalCode,
    });
    const repairerKind = row.repairer.profile?.verificationLevel === 'BUSINESS' ? 'BUSINESS' : 'RESIDENTIAL';
    const clientAddr = person(row.client, client, 'RESIDENTIAL', null);
    const repairerAddr = person(
      row.repairer,
      repairer,
      repairerKind,
      repairerKind === 'BUSINESS' ? (row.repairer.repairerProfile?.displayName ?? null) : null,
    );
    const insured = row.insuranceCents > 0;
    const input: CreateOrderInput = {
      externalId: shipment.id,
      shippingOfferCode: `${shipment.carrierCode}-${shipment.serviceCode}`,
      insured,
      takingOverDate: nextWorkingDay(new Date()),
      from: leg === 'OUTBOUND' ? clientAddr : repairerAddr,
      to: leg === 'OUTBOUND' ? repairerAddr : clientAddr,
      pickupPointCode: row.parcelOption === 'RELAY' ? collector.parcelPointCode : null,
      parcel: {
        weightGrams: row.parcelWeightGrams,
        lengthCm: row.parcelLengthCm,
        widthCm: row.parcelWidthCm,
        heightCm: row.parcelHeightCm,
        valueCents: row.parcelValueCents,
      },
      contentId: contentIdFor(row.demande.category.slug, row.demande.category.parent?.slug ?? null),
      contentDescription: row.demande.title.slice(0, 50),
    };
    try {
      const result = await shippingGateway().createOrder(input);
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          boxtalOrderId: result.orderId,
          boxtalStatus: result.boxtalStatus,
          billedExclTaxCents: result.deliveryExclTaxCents + result.insuranceExclTaxCents,
        },
      });
      // Spec « Amendment, 2026-09-04 »: Boxtal answers 200 with NO insurance when the service cannot
      // insure the value. The label is real, so the order stands - but the client paid a premium,
      // and that is a defect for a human, never a silent success.
      if (insured && result.insuranceExclTaxCents <= 0) {
        await this.reportIncident({
          kind: 'INSURANCE_NOT_APPLIED',
          commandeId,
          demandeTitle: row.demande.title,
          leg,
          detail: `Boxtal a répondu sans assurance (insurancePriceExclTax 0) pour une commande facturée ${row.insuranceCents} centimes d'assurance transport ; ordre Boxtal ${result.orderId}, offre ${input.shippingOfferCode}, valeur déclarée ${row.parcelValueCents} centimes.`,
        });
      }
      return 'ordered';
    } catch (e) {
      const detail =
        e instanceof ShippingRefusedError
          ? `${e.code}: ${e.detail}`
          : e instanceof ShippingUnavailableError
            ? `unavailable: ${e.message}`
            : String(e);
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: 'FAILED', failureReason: detail.slice(0, 500) },
      });
      await this.reportIncident({ kind: 'ORDER_REFUSED', commandeId, demandeTitle: row.demande.title, leg, detail: detail.slice(0, 500) });
      return 'failed';
    }
  }

  /** Spec §8.3. Idempotent: a second LABEL for a LABEL_READY leg is ignored. */
  async ingestDocuments(shipmentId: string, docs: BoxtalDocument[]): Promise<void> {
    const label = docs.find((d) => d.type === 'LABEL');
    if (!label) return;
    const s = await this.prisma.shipment.findFirst({ where: { id: shipmentId } });
    if (!s || s.status !== 'ORDERED' || !s.boxtalOrderId) return;
    const c = await this.prisma.commande.findFirst({
      where: { id: s.commandeId },
      select: {
        id: true,
        clientUserId: true,
        repairerUserId: true,
        outboundTrackingNumber: true,
        returnTrackingNumber: true,
        demande: { select: { title: true } },
      },
    });
    if (!c) return;
    const path = LABEL_PATH(c.id, s.leg);
    try {
      const bytes = await shippingGateway().fetchBytes(label.url, LABEL_MAX_BYTES);
      await this.store().putObject(shippingLabelBucket(), path, bytes, 'application/pdf');
    } catch (e) {
      await this.reportIncident({ kind: 'LABEL_STORE_FAILED', commandeId: c.id, demandeTitle: c.demande.title, leg: s.leg, detail: String(e).slice(0, 500) });
      return;
    }
    const marked = await this.prisma.shipment.updateMany({
      where: { id: s.id, status: 'ORDERED' },
      data: { status: 'LABEL_READY', labelStoragePath: path, labelIssuedAt: new Date() },
    });
    if (marked.count === 0) return;
    // The tracking number, only when the column is still null (the operator may have typed one).
    try {
      const tracking = await shippingGateway().getTracking(s.boxtalOrderId);
      const number = tracking.find((t) => t.trackingNumber)?.trackingNumber ?? null;
      if (number) await this.fillTrackingNumber(c.id, s.leg, number);
    } catch (e) {
      console.warn('[shipping] tracking after label failed for %s', s.id, e);
    }
    const senderIsClient = s.leg === 'OUTBOUND';
    await this.notifications.emit({
      userId: senderIsClient ? c.clientUserId : c.repairerUserId,
      mode: senderIsClient ? 'CLIENT' : 'REPAIRER',
      type: 'PARCEL_LABEL_READY',
      step: SCAN_ADVANCES[s.leg],
      subject: c.demande.title,
      commandeId: c.id,
    });
  }

  private async fillTrackingNumber(commandeId: string, leg: ShipmentLeg, number: string): Promise<void> {
    await this.prisma.commande.updateMany({
      where: leg === 'OUTBOUND' ? { id: commandeId, outboundTrackingNumber: null } : { id: commandeId, returnTrackingNumber: null },
      data: leg === 'OUTBOUND' ? { outboundTrackingNumber: number } : { returnTrackingNumber: number },
    });
  }

  /**
   * Spec §8.5. History → events (idempotent, find-then-create so « created » is exact), status
   * (monotonic: DELIVERED and CANCELLED are terminal), first scan → the sending step, notifications
   * for the fresh events only.
   */
  async ingestTracking(shipmentId: string, trackings: PackageTracking[]): Promise<void> {
    const s = await this.prisma.shipment.findFirst({ where: { id: shipmentId } });
    if (!s) return;
    const c = await this.prisma.commande.findFirst({
      where: { id: s.commandeId },
      select: { id: true, clientUserId: true, repairerUserId: true, demande: { select: { title: true } } },
    });
    if (!c) return;
    const fresh: { status: string; occurredAt: Date; message: string | null }[] = [];
    let newest: { status: string; at: Date } | null = null;
    for (const t of trackings) {
      if (t.trackingNumber) await this.fillTrackingNumber(c.id, s.leg, t.trackingNumber);
      const entries =
        t.history.length > 0 ? t.history : [{ status: t.status, isFinal: t.isFinal, message: t.message, trackingDateTime: t.trackingDateTime }];
      for (const h of entries) {
        const occurredAt = new Date(h.trackingDateTime);
        if (Number.isNaN(occurredAt.getTime())) continue;
        const key = { shipmentId: s.id, status: h.status, occurredAt };
        const existing = await this.prisma.shipmentEvent.findUnique({ where: { shipmentId_status_occurredAt: key } });
        if (!existing) {
          try {
            await this.prisma.shipmentEvent.create({
              data: { ...key, message: h.message, raw: { ...h, packageTrackingUrl: t.packageTrackingUrl } as object },
            });
            fresh.push({ status: h.status, occurredAt, message: h.message });
          } catch (e) {
            // A concurrent delivery of the same event created it first: not fresh for us.
            if (!isUniqueViolation(e)) throw e;
          }
        }
        if (!newest || occurredAt > newest.at) newest = { status: h.status, at: occurredAt };
      }
    }
    if (newest) {
      const effect = trackingEffectFor(newest.status);
      if (effect.shipment && s.status !== 'DELIVERED' && s.status !== 'CANCELLED') {
        await this.prisma.shipment.update({
          where: { id: s.id },
          data: { status: effect.shipment, ...(effect.shipment === 'DELIVERED' ? { deliveredAt: newest.at } : {}) },
        });
      }
    }
    const firstScan = fresh
      .filter((e) => trackingEffectFor(e.status).isScan)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];
    if (firstScan && s.firstScanAt === null) {
      const stamped = await this.prisma.shipment.updateMany({ where: { id: s.id, firstScanAt: null }, data: { firstScanAt: firstScan.occurredAt } });
      if (stamped.count > 0) await this.commandes.advanceBySystem(c.id, SCAN_ADVANCES[s.leg]);
    }
    for (const e of fresh) {
      const effect = trackingEffectFor(e.status);
      if (effect.notify) {
        for (const side of [
          { userId: c.clientUserId, mode: 'CLIENT' as const },
          { userId: c.repairerUserId, mode: 'REPAIRER' as const },
        ]) {
          await this.notifications.emit({ ...side, type: effect.notify, step: SCAN_ADVANCES[s.leg], subject: c.demande.title, commandeId: c.id });
        }
      }
      if (effect.opsMail) {
        await this.reportIncident({
          kind: 'CARRIER_EXCEPTION',
          commandeId: c.id,
          demandeTitle: c.demande.title,
          leg: s.leg,
          detail: `${e.status}${e.message ? `: ${e.message}` : ''}`,
        });
      }
    }
  }

  /** Spec §8.7. After a refund. Never throws; a failed cancel is mailed. */
  async cancelUnshipped(commandeId: string): Promise<void> {
    const c = await this.prisma.commande.findFirst({
      where: { id: commandeId },
      select: { demande: { select: { title: true } }, shipments: true },
    });
    if (!c) return;
    for (const s of c.shipments) {
      if (!s.boxtalOrderId || s.firstScanAt !== null || !['ORDERED', 'LABEL_READY'].includes(s.status)) continue;
      try {
        const outcome = await shippingGateway().cancelOrder(s.boxtalOrderId);
        if (outcome === 'cancelled') {
          await this.prisma.shipment.update({ where: { id: s.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        } else {
          await this.reportIncident({ kind: 'CANCEL_FAILED', commandeId, demandeTitle: c.demande.title, leg: s.leg, detail: 'Boxtal : trop tard pour annuler' });
        }
      } catch (e) {
        await this.reportIncident({ kind: 'CANCEL_FAILED', commandeId, demandeTitle: c.demande.title, leg: s.leg, detail: String(e).slice(0, 500) });
      }
    }
  }

  /**
   * Spec §8.4. Called by GET /commandes/:id: a label whose webhook was missed is recovered the
   * moment someone looks. Bounded, never throws, a no-op under the manual driver.
   */
  async pollLabelsOnRead(commandeId: string): Promise<void> {
    if (!isShippingQuotesEnabled()) return;
    try {
      const stale = await this.prisma.shipment.findMany({
        where: { commandeId, status: 'ORDERED', labelStoragePath: null, boxtalOrderId: { not: null }, orderedAt: { lt: new Date(Date.now() - LABEL_POLL_AFTER_MS) } },
        select: { id: true, boxtalOrderId: true },
      });
      for (const s of stale) {
        const docs = await withinBudget(shippingGateway().getDocuments(s.boxtalOrderId!), POLL_BUDGET_MS);
        if (docs.length > 0) await this.ingestDocuments(s.id, docs);
      }
    } catch (e) {
      console.warn('[shipping] on-read poll failed for %s', commandeId, e);
    }
  }

  /**
   * Spec §8.4. The six-hourly `shipmentSweep` cron job: labels a webhook missed, tracking gone
   * quiet for a day. Every failure is COUNTED rather than swallowed, so a Boxtal outage turns
   * the workflow red instead of passing as « nothing to do ».
   */
  async sweep(): Promise<{ scanned: number; acted: number; failed: number }> {
    if (!isShippingQuotesEnabled()) return { scanned: 0, acted: 0, failed: 0 };
    const rows = await this.prisma.shipment.findMany({
      where: { boxtalOrderId: { not: null }, status: { in: ['ORDERED', 'LABEL_READY', 'IN_TRANSIT'] } },
      select: {
        id: true,
        status: true,
        boxtalOrderId: true,
        orderedAt: true,
        labelStoragePath: true,
        updatedAt: true,
        events: { select: { occurredAt: true }, orderBy: { occurredAt: 'desc' }, take: 1 },
      },
    });
    let acted = 0;
    let failed = 0;
    const now = Date.now();
    for (const s of rows) {
      try {
        if (s.status === 'ORDERED') {
          if (s.labelStoragePath === null && s.orderedAt && now - s.orderedAt.getTime() > LABEL_POLL_AFTER_MS) {
            const docs = await shippingGateway().getDocuments(s.boxtalOrderId!);
            if (docs.length > 0) {
              await this.ingestDocuments(s.id, docs);
              acted += 1;
            }
          }
        } else {
          const last = s.events[0]?.occurredAt ?? s.updatedAt;
          if (now - last.getTime() > TRACKING_STALE_AFTER_MS) {
            const t = await shippingGateway().getTracking(s.boxtalOrderId!);
            if (t.length > 0) {
              await this.ingestTracking(s.id, t);
              acted += 1;
            }
          }
        }
      } catch (e) {
        failed += 1;
        console.error('[shipping] sweep failed for shipment %s', s.id, e);
      }
    }
    return { scanned: rows.length, acted, failed };
  }

  /**
   * Spec §7.7. Verify, claim, act. Boxtal wants a 2xx within two seconds; the probe measured its
   * POST arriving 1.1 s after the order and a 3 490-byte label, so `ingestDocuments`' download
   * fits the budget and the controller answers when this returns. The on-read poll and the cron
   * sweep (Task 15) are the recovery if a process dies here. A throw after the claim releases the
   * claim, so Boxtal's retry gets another chance.
   */
  async handleWebhook(raw: Buffer, signature: string | undefined): Promise<'processed' | 'duplicate' | 'unknown_shipment'> {
    if (!isShippingQuotesEnabled()) throw new AppException('NOT_FOUND', NOT_FOUND);
    const event = shippingGateway().verifyWebhook(raw, signature);
    if (!event) {
      console.warn('[shipping] webhook signature verification failed');
      throw new AppException('VALIDATION_FAILED', 'Signature invalide.');
    }
    if (!(await claimBoxtalEvent(this.prisma, event.id, event.type))) return 'duplicate';
    try {
      // Our Shipment id travels as Boxtal's externalId; the order id is the fallback for an event
      // that carries none.
      const shipment = await this.prisma.shipment.findFirst({
        where: event.shipmentExternalId ? { id: event.shipmentExternalId } : { boxtalOrderId: event.shippingOrderId },
        select: { id: true },
      });
      if (!shipment) {
        console.warn('[shipping] webhook %s for unknown shipment (externalId=%s, order=%s)', event.type, event.shipmentExternalId, event.shippingOrderId);
        return 'unknown_shipment';
      }
      if (event.type === 'DOCUMENT_CREATED') await this.ingestDocuments(shipment.id, event.payload.documents ?? []);
      else if (event.type === 'TRACKING_CHANGED') await this.ingestTracking(shipment.id, event.payload.trackings ?? []);
      return 'processed';
    } catch (e) {
      await this.prisma.boxtalEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      throw e;
    }
  }

  /** Spec §7.5. The réparateur collects the OUTBOUND leg, the client the RETURN. */
  async parcelPointsFor(
    userId: string,
    commandeId: string,
    query: { postalCode?: string; city?: string },
  ): Promise<ParcelPointDto[]> {
    if (!isShippingQuotesEnabled()) throw new AppException('UNPROCESSABLE_ENTITY', QUOTES_OFF);
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
      select: {
        clientUserId: true,
        delivery: true,
        status: true,
        parcelOption: true,
        shippingAddresses: { select: { role: true, postalCode: true, city: true } },
        shipments: { select: { leg: true, carrierCode: true, serviceCode: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (row.delivery !== 'PARCEL' || row.parcelOption !== 'RELAY') throw new AppException('UNPROCESSABLE_ENTITY', NOT_RELAY);
    if (row.status !== 'PAID') throw new AppException('UNPROCESSABLE_ENTITY', NOT_PAID);
    const role = row.clientUserId === userId ? 'CLIENT' : 'REPAIRER';
    const leg: ShipmentLeg = role === 'REPAIRER' ? 'OUTBOUND' : 'RETURN';
    const shipment = row.shipments.find((s) => s.leg === leg);
    if (!shipment) throw new AppException('UNPROCESSABLE_ENTITY', NOT_RELAY);
    const own = row.shippingAddresses.find((a) => a.role === role);
    const postalCode = query.postalCode ?? own?.postalCode;
    const city = query.city ?? own?.city;
    if (!postalCode || !city) throw new AppException('VALIDATION_FAILED', SEARCH_INPUT);
    try {
      const points = await shippingGateway().searchParcelPoints({
        shippingOfferCode: `${shipment.carrierCode}-${shipment.serviceCode}`,
        postalCode,
        city,
      });
      return points.slice(0, 15);
    } catch (e) {
      if (e instanceof ShippingUnavailableError) throw new AppException('SERVICE_UNAVAILABLE', QUOTE_UNAVAILABLE);
      throw e;
    }
  }

  /** Spec §7.6. Only the SENDER of the leg, and only once the PDF is stored. */
  async labelUrlFor(userId: string, commandeId: string, leg: ShipmentLeg): Promise<{ url: string }> {
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
      select: { clientUserId: true, shipments: { select: { id: true, leg: true, labelStoragePath: true } } },
    });
    // The client sends the outbound parcel, the réparateur the return. The wrong party gets a
    // 404 indistinguishable from « no such order », like every other authorship refusal.
    const senderIsClient = leg === 'OUTBOUND';
    if (!row || (row.clientUserId === userId) !== senderIsClient) throw new AppException('NOT_FOUND', NOT_FOUND);
    const shipment = row.shipments.find((s) => s.leg === leg);
    const path = shipment?.labelStoragePath ?? null;
    if (!shipment || !path) throw new AppException('UNPROCESSABLE_ENTITY', LABEL_NOT_READY);
    const urls = await this.store().createSignedReadUrls([path], 3600, shippingLabelBucket());
    const url = urls.get(path);
    if (!url) throw new AppException('UNPROCESSABLE_ENTITY', LABEL_NOT_READY);
    // Spec §3, CF4-20 / Q8: record the FIRST in-app download by the SENDER. Sender-only is
    // already enforced by the guard above; first-only is enforced here by the `labelDownloadedAt:
    // null` in the where, so a second download never overwrites the first timestamp. The actual
    // file fetch (the browser following this signed URL) is not observable from the API, so this
    // stamps "a signed URL was handed to the sender", not "the PDF was downloaded" - the closest
    // proxy available. Awaited but non-fatal: a stamp failure must not cost the sender their
    // label, so it is caught and logged rather than thrown.
    await this.prisma.shipment
      .updateMany({ where: { id: shipment.id, labelDownloadedAt: null }, data: { labelDownloadedAt: new Date() } })
      .catch((e) => console.error('[shipping] label download stamp failed for commande %s %s', commandeId, leg, e));
    return { url };
  }

  /** `INBOUND` is the admin routes' word for the return leg; anything else that is not a leg is refused. */
  private legOf(leg: string): ShipmentLeg {
    const resolved = leg === 'INBOUND' ? 'RETURN' : leg;
    if (resolved !== 'OUTBOUND' && resolved !== 'RETURN') {
      throw new AppException('VALIDATION_FAILED', 'Trajet invalide.');
    }
    return resolved;
  }

  /**
   * P16: Direct admin label URL download without sender/recipient restrictions.
   */
  async getAdminLabelUrl(commandeId: string, leg: string): Promise<{ url: string }> {
    const resolvedLeg = this.legOf(leg);
    const shipment = await this.prisma.shipment.findFirst({
      where: { commandeId, leg: resolvedLeg },
      select: { id: true, labelStoragePath: true },
    });
    const path = shipment?.labelStoragePath ?? null;
    if (!shipment || !path) throw new AppException('UNPROCESSABLE_ENTITY', LABEL_NOT_READY);
    const urls = await this.store().createSignedReadUrls([path], 3600, shippingLabelBucket());
    const url = urls.get(path);
    if (!url) throw new AppException('UNPROCESSABLE_ENTITY', LABEL_NOT_READY);
    return { url };
  }

  /**
   * P16: Send drop-off reminder to parcel sender. Only a leg whose label exists and whose parcel
   * has not been handed over (ORDERED, LABEL_READY) can be reminded: a PENDING or FAILED leg has
   * no label to drop off, and an IN_TRANSIT one is already with the carrier.
   */
  async sendDropoffReminder(commandeId: string, leg: string): Promise<{ ok: true }> {
    const resolvedLeg = this.legOf(leg);
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        id: true,
        clientUserId: true,
        repairerUserId: true,
        demande: { select: { title: true } },
      },
    });
    if (!commande) throw new AppException('NOT_FOUND', NOT_FOUND);

    const shipment = await this.prisma.shipment.findFirst({
      where: {
        commandeId: commande.id,
        leg: resolvedLeg,
      },
      select: { id: true, status: true },
    });
    if (!shipment) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Aucune expédition n'a été créée pour cette étape.");
    }
    if (shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED') {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Le colis est déjà livré ou annulé.');
    }
    if (shipment.status !== 'ORDERED' && shipment.status !== 'LABEL_READY') {
      throw new AppException('UNPROCESSABLE_ENTITY', REMINDER_NOT_APPLICABLE);
    }

    const senderIsClient = resolvedLeg === 'OUTBOUND';
    await this.notifications.emit({
      userId: senderIsClient ? commande.clientUserId : commande.repairerUserId,
      mode: senderIsClient ? 'CLIENT' : 'REPAIRER',
      type: 'PARCEL_LABEL_READY',
      step: SCAN_ADVANCES[resolvedLeg] ?? 'SENDING',
      subject: `Rappel : déposez votre colis pour "${commande.demande?.title ?? commande.id}"`,
      commandeId: commande.id,
    });
    return { ok: true };
  }

  /**
   * P16: the admin picks the carrier for a leg and the label is ordered through the SAME guarded
   * path as the automatic order (`orderLeg`). A label is real money, so this only ever STARTS an
   * order: a leg that already holds a Boxtal order, a label or a scan is refused (resetting it to
   * PENDING would let `orderLeg` buy a second label and orphan the first), and a leg `orderLeg`
   * does not order is an error, never a success. The quoted prices are not known for an operator's
   * choice (no Boxtal quote was taken), so they are stored as 0 and Boxtal's billed amount is the
   * figure of record.
   */
  async adminCreateShipment(
    commandeId: string,
    leg: string,
    carrier: AdminCarrier,
    weightGrams?: number,
  ): Promise<{ ok: true; shipmentId: string; carrierLabel: string }> {
    const resolvedLeg = this.legOf(leg);
    const offer = ADMIN_CARRIER_OFFERS[carrier];

    const commande = await this.prisma.commande.findFirst({
      where: { id: commandeId, delivery: 'PARCEL', status: 'PAID' },
      select: { id: true },
    });
    if (!commande) throw new AppException('UNPROCESSABLE_ENTITY', NOT_A_PAID_PARCEL);

    const existing = await this.prisma.shipment.findUnique({
      where: { commandeId_leg: { commandeId, leg: resolvedLeg } },
      select: { id: true, status: true, boxtalOrderId: true },
    });
    if (existing && (existing.boxtalOrderId !== null || (existing.status !== 'PENDING' && existing.status !== 'FAILED'))) {
      throw new AppException('CONFLICT', SHIPMENT_ALREADY_ORDERED);
    }

    if (weightGrams) {
      await this.prisma.commande.update({ where: { id: commandeId }, data: { parcelWeightGrams: weightGrams } });
    }

    const fields = {
      carrierCode: offer.carrierCode,
      carrierLabel: offer.carrierLabel,
      serviceCode: offer.serviceCode,
      status: 'PENDING' as const,
      failureReason: null,
    };
    const shipment = existing
      ? await this.prisma.shipment.update({ where: { id: existing.id }, data: fields, select: { id: true } })
      : await this.prisma.shipment.create({
          data: {
            commandeId,
            leg: resolvedLeg,
            ...fields,
            quotedCostExclTaxCents: 0,
            quotedCostInclTaxCents: 0,
            insured: false,
            quotedInsuranceCents: 0,
          },
          select: { id: true },
        });

    const outcome = await this.orderLeg(commandeId, resolvedLeg);
    if (outcome === 'skipped') throw new AppException('UNPROCESSABLE_ENTITY', NOT_ORDERABLE);
    if (outcome === 'failed') throw new AppException('UNPROCESSABLE_ENTITY', ORDER_REFUSED);

    return { ok: true, shipmentId: shipment.id, carrierLabel: offer.carrierLabel };
  }
}
