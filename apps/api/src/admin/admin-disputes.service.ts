import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  orderIdPrefix,
  DELETED_USER_NAME,
  ROLE_PERMISSIONS,
  can,
  type AdminDisputeDossierDto,
  type AdminDisputeListItem,
  type AdminDisputeListQuery,
  type AdminDisputeListResponse,
  type AdminDisputeNoteItem,
  type DisputeAssigneeItem,
  type DisputeTimelineEvent,
  type OpenDisputeInput,
  type ResolveDisputeRefundInput,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { recordStep } from '../commandes/record-step.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RefundService } from '../commandes/refund.service.js';
import { CommandeAnnouncer } from '../commandes/commande-announcer.service.js';
import { closePendingCancellation } from '../cancellations/close-pending.js';
import { createDispute } from '../disputes/dispute-create.js';
import { repairerFiscalComplete } from '../fiscal/fiscal-gate.js';
import { isDeletedAccount } from './deleted-account.js';
import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { disputeOrderBy } from './list-sort.js';
import { paymentsGateway } from '../payments/gateway.js';
import { signAttachmentUrls } from '../storage/attachment-paths.js';

const NOT_FOUND = 'Ressource introuvable.';
const ONLY_PAID_CAN_DISPUTE = "Seule une commande payée peut faire l'objet d'un litige.";
const DISPUTE_ALREADY_OPEN = 'Un litige est déjà ouvert sur cette commande.';
const DISPUTE_ALREADY_RESOLVED = 'Ce litige est déjà résolu.';
const ASSIGNEE_NOT_ELIGIBLE = "Ce compte ne peut pas traiter les litiges : choisissez un membre de l'équipe habilité.";
const ONLY_MINE_NEEDS_A_USER = "« Mes dossiers » demande un utilisateur connecté.";
const RESOLVED_STATUSES = ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'] as const;
// The roles the picker offers and `assign` accepts are the ones that hold `disputes.handle`: the
// permission matrix decides, not a second list here (`finance` handles disputes, `moderation` cannot).
const DISPUTE_HANDLER_ROLES = (Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).filter((r) =>
  can(r, 'disputes.handle'),
);
// CF4-15 (spec §3). resolveRelease's two refusal messages: no ConnectAccount at
// all, and a ConnectAccount whose createTransfer call itself failed. Distinct
// text because they are distinct remedies - one needs the réparateur onboarded,
// the other is a transient Stripe failure worth retrying.
const REPAIRER_NOT_PAYABLE = 'Le réparateur ne peut pas recevoir de paiement.';
const TRANSFER_FAILED = 'Le versement au réparateur a échoué. Réessayez dans quelques minutes.';
// CMP-D3. The dispute is NOT resolved: an operator who could release here would pay a réparateur
// whose fiscal information is incomplete, which is exactly what the golden rule forbids.
const REPAIRER_FISCAL_INCOMPLETE =
  "Le réparateur n'a pas complété ses informations fiscales (DAC7) : le versement est bloqué. Résolvez le litige par un remboursement ou attendez qu'il les complète.";

/** A stored value that is already something a browser can load: nothing to sign. */
const isAbsoluteUrl = (p: string): boolean => /^(https?:|data:)/.test(p);

@Injectable()
export class AdminDisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
    private readonly announcer: CommandeAnnouncer,
  ) {}

  async list(
    query: Partial<AdminDisputeListQuery> = {},
    currentUserId?: string,
  ): Promise<AdminDisputeListResponse> {
    const where: Record<string, any> = {};

    // The rows show `effectiveDisputeStatus`, which reads a dispute on a REFUNDED order as resolved
    // whatever its stored status says. The filter has to follow the same rule or a tab lists rows
    // that read as another tab's.
    if (query.status && query.status !== 'ALL') {
      if (query.status === 'RESOLVED') {
        where.AND = [
          { OR: [{ status: { in: [...RESOLVED_STATUSES] } }, { commande: { status: 'REFUNDED' } }] },
        ];
      } else if (query.status === 'OPEN' || query.status === 'IN_REVIEW') {
        where.status = query.status;
        where.commande = { status: { not: 'REFUNDED' } };
      } else {
        where.status = query.status;
      }
    }

    if (query.onlyMine === true) {
      if (!currentUserId) throw new AppException('UNPROCESSABLE_ENTITY', ONLY_MINE_NEEDS_A_USER);
      where.assignedToUserId = currentUserId;
    } else if (query.assignedTo) {
      if (query.assignedTo === 'unassigned') {
        where.assignedToUserId = null;
      } else if (query.assignedTo !== 'all') {
        where.assignedToUserId = query.assignedTo;
      }
    } else if (query.assigned) {
      if (query.assigned === 'unassigned') {
        where.assignedToUserId = null;
      } else if (query.assigned !== 'all') {
        where.assignedToUserId = query.assigned;
      }
    }

    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      const orderPrefix = orderIdPrefix(term);
      const orClauses: Record<string, any>[] = [
        { commandeId: { contains: term, mode: 'insensitive' } },
        ...(orderPrefix ? [{ commandeId: { startsWith: orderPrefix } }] : []),
        {
          commande: {
            OR: [
              { client: { name: { contains: term, mode: 'insensitive' } } },
              { client: { email: { contains: term, mode: 'insensitive' } } },
              { repairer: { name: { contains: term, mode: 'insensitive' } } },
              { repairer: { email: { contains: term, mode: 'insensitive' } } },
            ],
          },
        },
      ];

      const litMatch = term.match(/^#?lit-?0*(\d+)$/i);
      const num =
        litMatch && litMatch[1]
          ? parseInt(litMatch[1], 10)
          : /^\d+$/.test(term)
            ? parseInt(term, 10)
            : null;
      if (num !== null && !isNaN(num)) {
        orClauses.push({ number: num });
      }

      where.OR = orClauses;
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, openCount, inReviewCount, resolvedCount, rows] = await Promise.all([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.dispute.count({ where: { status: 'IN_REVIEW' } }),
      this.prisma.dispute.count({
        where: {
          status: { in: ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'] },
        },
      }),
      this.prisma.dispute.findMany({
        where,
        skip,
        take,
        orderBy: disputeOrderBy(query.sort, query.dir),
        include: {
          commande: {
            include: {
              client: true,
              repairer: true,
            },
          },
        },
      }),
    ]);

    // The operator is a plain scalar id (no FK, by design - see Migration 39), so resolve the
    // display name here: the queue showed the raw Better Auth id otherwise.
    const operatorIds = Array.from(
      new Set(rows.map((r: any) => r.assignedToUserId).filter((id: unknown): id is string => Boolean(id))),
    );
    const operators =
      operatorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, name: true, email: true, profile: { select: { deletedAt: true } } },
          })
        : [];

    // The assignee is a bare id, so a deleted account must not read as an assignment (B16).
    // Display only: deleting an account releases its assignments in the same transaction.
    const deletedOperatorIds = new Set(operators.filter(isDeletedAccount).map((op) => op.id));
    const operatorName = new Map(operators.map((op) => [op.id, op.name?.trim() || op.email]));

    const items: AdminDisputeListItem[] = rows.map((row: any) => {
      const client = row.commande?.clientUser ?? row.commande?.client;
      const repairer = row.commande?.repairerUser ?? row.commande?.repairer;
      const { status, verdict } = effectiveDisputeStatus({
        status: row.status,
        verdict: row.verdict ?? null,
        commande: row.commande ?? null,
      });

      const isAssigneeDeleted = row.assignedToUserId ? deletedOperatorIds.has(row.assignedToUserId) : false;
      const assignedToUserId = isAssigneeDeleted ? null : (row.assignedToUserId ?? null);
      const assignedToName = assignedToUserId ? (operatorName.get(assignedToUserId) ?? null) : null;

      return {
        id: row.id,
        commandeId: row.commandeId,
        number: row.number ?? 0,
        motif: row.motif ?? null,
        status,
        initiator: row.initiator,
        reason: row.reason,
        clientName: client?.name ?? '',
        clientEmail: client?.email ?? '',
        repairerName: repairer?.name ?? '',
        repairerEmail: repairer?.email ?? '',
        totalCents: row.commande?.totalCents ?? 0,
        repairCents: row.commande?.repairCents ?? 0,
        assignedToUserId,
        assignedToName,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        resolvedAt: row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : (row.resolvedAt ? String(row.resolvedAt) : null),
        verdict,
        commandeStatus: row.commande?.status ?? null,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      openCount,
      inReviewCount,
      resolvedCount,
    };
  }

  async getDossier(disputeId: string): Promise<AdminDisputeDossierDto> {
    const dispute = (await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        commande: {
          include: {
            client: { include: { profile: true } },
            repairer: { include: { profile: true, repairerProfile: true } },
            shipments: true,
            demande: {
              include: {
                photos: { select: { storagePath: true } },
                conversations: {
                  include: {
                    messages: {
                      orderBy: { createdAt: 'desc' },
                      take: 50,
                    },
                  },
                },
              },
            },
          },
        },
      },
    })) as any;

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const cmd = dispute.commande;
    const client = cmd?.clientUser ?? cmd?.client;
    const repairer = cmd?.repairerUser ?? cmd?.repairer;
    const demande = cmd?.demande;
    const conversation = demande?.conversation ?? demande?.conversations?.[0];

    const rawAdminNotes = Array.isArray(dispute.adminNotes)
      ? (dispute.adminNotes as unknown as AdminDisputeNoteItem[])
      : [];

    const rawEvidencePhotos: string[] = Array.isArray(dispute.evidencePhotos)
      ? (dispute.evidencePhotos as string[]).filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];

    const convPhotoPaths: string[] = (conversation?.messages ?? [])
      .map((m: any) => m.photoPath)
      .filter((p: string | null): p is string => typeof p === 'string' && p.length > 0);
    const convDocPaths: string[] = (conversation?.messages ?? [])
      .map((m: any) => m.documentPath)
      .filter((p: string | null): p is string => typeof p === 'string' && p.length > 0);
    const demandePhotoPaths: string[] = (demande?.photos ?? [])
      .map((p: any) => p.storagePath)
      .filter((p: string | null): p is string => typeof p === 'string' && p.length > 0);

    const photosToSign = [
      ...rawEvidencePhotos,
      ...convPhotoPaths,
      ...demandePhotoPaths,
    ].filter((p) => !isAbsoluteUrl(p));

    const docsToSign = convDocPaths.filter((p) => !isAbsoluteUrl(p));

    const signedUrls = await signAttachmentUrls({ photo: photosToSign, document: docsToSign });

    const evidencePhotos = rawEvidencePhotos.map((p) => {
      return isAbsoluteUrl(p) ? p : (signedUrls.get(p) ?? p);
    });

    const { status: disputeStatus, verdict: disputeVerdict } = effectiveDisputeStatus({
      status: dispute.status,
      verdict: dispute.verdict ?? null,
      commande: cmd ?? null,
    });

    let assignedToUserId = dispute.assignedToUserId ?? null;
    let assignedToName: string | null = null;
    let assignedAt = dispute.assignedAt;

    if (assignedToUserId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: assignedToUserId },
        select: {
          id: true,
          name: true,
          email: true,
          profile: { select: { deletedAt: true } },
        },
      });

      // Display only, as in the list: a removed or deleted assignee reads as unassigned.
      if (!assignee || isDeletedAccount(assignee)) {
        assignedToUserId = null;
        assignedToName = null;
        assignedAt = null;
      } else {
        assignedToName = assignee.name?.trim() || assignee.email;
      }
    }

    let resolvedByName: string | null = null;
    if (dispute.resolvedByUserId) {
      const resolver = await this.prisma.user.findUnique({
        where: { id: dispute.resolvedByUserId },
        select: { id: true, name: true, email: true },
      });
      if (resolver) {
        resolvedByName = resolver.name?.trim() || resolver.email;
      }
    }

    // P18: Compile unified chronology timeline and processing age
    const timelineEvents: DisputeTimelineEvent[] = [];

    // 1. DISPUTE_OPENED
    let initiatorRole: 'ADMIN' | 'CLIENT' | 'REPAIRER' | 'SYSTEM' = 'CLIENT';
    let initiatorName = client?.name?.trim() || 'Client';
    if (dispute.initiator === 'REPAIRER') {
      initiatorRole = 'REPAIRER';
      initiatorName = repairer?.name?.trim() || 'Réparateur';
    } else if (dispute.initiator === 'ADMIN') {
      initiatorRole = 'ADMIN';
      initiatorName = 'Support Revime';
    } else if (dispute.initiator === 'STRIPE') {
      initiatorRole = 'SYSTEM';
      initiatorName = 'Stripe';
    }

    timelineEvents.push({
      id: `open-${dispute.id}`,
      type: 'DISPUTE_OPENED',
      timestamp: dispute.createdAt instanceof Date ? dispute.createdAt.toISOString() : String(dispute.createdAt),
      actorRole: initiatorRole,
      actorName: initiatorName,
      summary: dispute.reason || (dispute as any).motif || 'Ouverture du litige',
      details: {
        initiator: dispute.initiator,
        motif: (dispute as any).motif ?? null,
        reason: dispute.reason,
      },
    });

    // 2. ASSIGNED
    if (assignedAt && (assignedToName || assignedToUserId)) {
      timelineEvents.push({
        id: `assign-${dispute.id}`,
        type: 'ASSIGNED',
        timestamp: assignedAt instanceof Date ? assignedAt.toISOString() : String(assignedAt),
        actorRole: 'ADMIN',
        actorName: assignedToName || 'Gestionnaire',
        summary: `Dossier assigné à ${assignedToName || 'un gestionnaire'}`,
        details: {
          assignedToUserId,
          assignedToName,
        },
      });
    }

    // 3. NOTE_ADDED
    for (const note of rawAdminNotes) {
      timelineEvents.push({
        id: `note-${note.id}`,
        type: 'NOTE_ADDED',
        timestamp: note.createdAt,
        actorRole: 'ADMIN',
        actorName: note.adminName || 'Admin',
        summary: note.note.length > 120 ? `${note.note.slice(0, 120)}…` : note.note,
        details: {
          noteId: note.id,
          fullNote: note.note,
        },
      });
    }

    // 4. MESSAGE_EXCHANGED (dispute spaces messages)
    const disputeMessages = Array.isArray(dispute.messages) ? dispute.messages : [];
    for (const m of disputeMessages) {
      let msgRole: 'ADMIN' | 'CLIENT' | 'REPAIRER' | 'SYSTEM' = 'CLIENT';
      let msgActorName = client?.name?.trim() || 'Client';

      if (m.author === 'REVIME') {
        msgRole = 'ADMIN';
        msgActorName = 'REVIME — Support';
      } else if (m.space === 'REPAIRER' || (m.senderUserId && repairer?.id && m.senderUserId === repairer.id)) {
        msgRole = 'REPAIRER';
        msgActorName = repairer?.name?.trim() || 'Réparateur';
      } else if (m.space === 'CLIENT' || (m.senderUserId && client?.id && m.senderUserId === client.id)) {
        msgRole = 'CLIENT';
        msgActorName = client?.name?.trim() || 'Client';
      } else {
        msgRole = 'SYSTEM';
        msgActorName = 'Système';
      }

      timelineEvents.push({
        id: `msg-${m.id}`,
        type: 'MESSAGE_EXCHANGED',
        timestamp: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        actorRole: msgRole,
        actorName: msgActorName,
        summary: m.body?.trim().length > 0 ? (m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body) : 'Pièce jointe transmise',
        details: {
          messageId: m.id,
          space: m.space,
          author: m.author,
          fullBody: m.body,
        },
      });
    }

    // 5. DISPUTE_RESOLVED
    const isResolved =
      Boolean(dispute.resolvedAt) ||
      ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'].includes(disputeStatus);

    if (isResolved) {
      const resTimestamp = dispute.resolvedAt instanceof Date
        ? dispute.resolvedAt.toISOString()
        : (dispute.resolvedAt ? String(dispute.resolvedAt) : (dispute.updatedAt instanceof Date ? dispute.updatedAt.toISOString() : String(dispute.updatedAt)));

      timelineEvents.push({
        id: `resolve-${dispute.id}`,
        type: 'DISPUTE_RESOLVED',
        timestamp: resTimestamp,
        actorRole: 'ADMIN',
        actorName: resolvedByName || 'Arbitre Revime',
        summary: disputeVerdict
          ? `Décision : ${disputeVerdict}${dispute.resolutionNote ? ` — ${dispute.resolutionNote}` : ''}`
          : `Litige résolu${dispute.resolutionNote ? ` — ${dispute.resolutionNote}` : ''}`,
        details: {
          verdict: disputeVerdict,
          resolutionNote: dispute.resolutionNote ?? null,
          resolvedByUserId: dispute.resolvedByUserId ?? null,
        },
      });
    }

    // Sort ascending by timestamp
    timelineEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Compute processing time
    const endMs = dispute.resolvedAt ? new Date(dispute.resolvedAt).getTime() : Date.now();
    const startMs = new Date(dispute.createdAt).getTime();
    const processingTimeDays = Math.max(0, Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)));

    return {
      dispute: {
        id: dispute.id,
        commandeId: dispute.commandeId,
        number: (dispute as any).number ?? 0,
        motif: (dispute as any).motif ?? null,
        status: disputeStatus,
        initiator: dispute.initiator,
        reason: dispute.reason,
        description: dispute.description ?? null,
        evidencePhotos: evidencePhotos.length > 0 ? evidencePhotos : (dispute.evidencePhotos ? [] : null),
        assignedToUserId,
        assignedToName,
        assignedAt: assignedAt instanceof Date ? assignedAt.toISOString() : (assignedAt ? String(assignedAt) : null),
        resolvedByUserId: dispute.resolvedByUserId ?? null,
        resolvedByName,
        resolvedAt: dispute.resolvedAt instanceof Date ? dispute.resolvedAt.toISOString() : (dispute.resolvedAt ? String(dispute.resolvedAt) : null),
        verdict: disputeVerdict,
        resolutionNote: dispute.resolutionNote ?? null,
        adminNotes: rawAdminNotes,
        createdAt: dispute.createdAt instanceof Date ? dispute.createdAt.toISOString() : String(dispute.createdAt),
        updatedAt: dispute.updatedAt instanceof Date ? dispute.updatedAt.toISOString() : String(dispute.updatedAt),
      },
      commande: {
        id: cmd?.id ?? dispute.commandeId,
        status: cmd?.status ?? 'PAID',
        step: cmd?.step ?? null,
        delivery: cmd?.delivery ?? 'PARCEL',
        repairCents: cmd?.repairCents ?? 0,
        shippingCents: cmd?.shippingCents ?? 0,
        protectionCents: cmd?.protectionCents ?? 0,
        insuranceCents: cmd?.insuranceCents ?? 0,
        totalCents: cmd?.totalCents ?? 0,
        paidAt: cmd?.paidAt instanceof Date ? cmd.paidAt.toISOString() : (cmd?.paidAt ? String(cmd.paidAt) : null),
        stripeSessionId: cmd?.stripeSessionId ?? null,
        stripePaymentIntentId: cmd?.stripePaymentIntentId ?? null,
        stripeChargeId: cmd?.stripeChargeId ?? null,
        stripeTransferId: cmd?.stripeTransferId ?? null,
        stripeRefundId: cmd?.stripeRefundId ?? null,
      },
      client: {
        id: client?.id ?? '',
        name: client?.name ?? '',
        email: client?.email ?? '',
        phone: client?.phone ?? null,
        city: client?.profile?.city ?? client?.city ?? null,
      },
      repairer: {
        id: repairer?.id ?? '',
        name: repairer?.name ?? '',
        email: repairer?.email ?? '',
        phone: repairer?.phone ?? null,
        kind: repairer?.profile?.kind ?? repairer?.repairerProfile?.kind ?? repairer?.kind ?? 'PRO',
        city: repairer?.profile?.city ?? repairer?.repairerProfile?.city ?? repairer?.city ?? null,
        verificationLevel: repairer?.profile?.verificationLevel ?? repairer?.verificationLevel ?? 'NONE',
      },
      shipments: (cmd?.shipments ?? []).map((s: any) => ({
        leg: s.leg,
        status: s.status,
        carrierLabel: s.carrierLabel ?? s.carrier ?? 'Inconnu',
        boxtalOrderId: s.boxtalOrderId ?? null,
        failureReason: s.failureReason ?? null,
      })),
      conversation: conversation
        ? {
            id: conversation.id ?? null,
            messages: (conversation.messages ?? []).map((m: any) => {
              const senderUserId = m.senderUserId ?? null;
              let senderRole: 'CLIENT' | 'REPAIRER' | 'ADMIN' | 'SYSTEM' | null = null;
              let senderName: string | null = null;

              if (m.kind === 'SUPPORT' || m.author === 'REVIME') {
                senderRole = 'ADMIN';
                senderName = 'REVIME — Support';
              } else if (m.kind === 'SYSTEM') {
                senderRole = 'SYSTEM';
                senderName = 'Système';
              } else if (senderUserId && client?.id && senderUserId === client.id) {
                senderRole = 'CLIENT';
                senderName = client.name?.trim() ? client.name.trim() : null;
              } else if (senderUserId && repairer?.id && senderUserId === repairer.id) {
                senderRole = 'REPAIRER';
                senderName = repairer.name?.trim() ? repairer.name.trim() : null;
              }

              return {
                id: m.id,
                senderUserId,
                kind: m.kind,
                body: m.body,
                photoPath: m.photoPath ? (signedUrls.get(m.photoPath) ?? m.photoPath) : null,
                documentPath: m.documentPath ? (signedUrls.get(m.documentPath) ?? m.documentPath) : null,
                documentName: m.documentName ?? null,
                documentSizeBytes: m.documentSizeBytes ?? null,
                createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
                senderName,
                senderRole,
              };
            }),
          }
        : null,
      demande: {
        id: demande?.id ?? '',
        title: demande?.title ?? '',
        description: demande?.description ?? '',
        photos: (demande?.photos ?? []).map((p: any) => (p.storagePath ? (signedUrls.get(p.storagePath) ?? p.storagePath) : '')).filter(Boolean),
      },
      timeline: timelineEvents,
      processingTimeDays,
    };
  }

  async openDispute(
    adminUserId: string,
    commandeId: string,
    input: OpenDisputeInput,
  ): Promise<{ ok: true; disputeId: string }> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { dispute: true },
    });

    if (!commande) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (commande.status !== 'PAID') {
      throw new AppException('UNPROCESSABLE_ENTITY', ONLY_PAID_CAN_DISPUTE);
    }

    if (commande.dispute && ['OPEN', 'IN_REVIEW'].includes(commande.dispute.status)) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_OPEN);
    }

    const dispute = await this.prisma.$transaction(async (tx) => {
      return createDispute(tx, {
        commandeId,
        initiator: input.initiator ?? 'ADMIN',
        openedByUserId: adminUserId,
        motif: null,
        reason: input.reason,
        description: input.description ?? null,
        evidencePhotos: input.evidencePhotos ?? [],
        firstMessages: [],
        closedByUserId: adminUserId,
      });
    });

    // CF4-16 (spec §3.2). After the upsert commits: both parties see the dispute
    // in the conversation and are notified once the write is durable.
    await this.announcer.announce(commandeId, 'DISPUTE_OPENED');

    return { ok: true, disputeId: dispute.id };
  }

  async assign(adminUserId: string, disputeId: string, assigneeUserId?: string): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const assignedTo = assigneeUserId ?? adminUserId;

    if (RESOLVED_STATUSES.includes(dispute.status as (typeof RESOLVED_STATUSES)[number])) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_RESOLVED);
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: assignedTo },
      select: {
        id: true,
        name: true,
        role: true,
        profile: { select: { deletedAt: true } },
      },
    });
    if (targetUser && isDeletedAccount(targetUser)) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Impossible d'assigner à un utilisateur supprimé.");
    }
    // An id the picker could never have offered (unknown, a customer, a role without the permission).
    if (!targetUser || !can(targetUser.role, 'disputes.handle')) {
      throw new AppException('UNPROCESSABLE_ENTITY', ASSIGNEE_NOT_ELIGIBLE);
    }

    const newStatus = dispute.status === 'OPEN' ? 'IN_REVIEW' : dispute.status;

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        assignedToUserId: assignedTo,
        assignedAt: new Date(),
        status: newStatus,
      },
    });

    return { ok: true };
  }

  async unassign(disputeId: string): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (RESOLVED_STATUSES.includes(dispute.status as (typeof RESOLVED_STATUSES)[number])) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_RESOLVED);
    }

    // `assign` is the only thing that moves OPEN to IN_REVIEW, so releasing it undoes that.
    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        assignedToUserId: null,
        assignedAt: null,
        ...(dispute.status === 'IN_REVIEW' ? { status: 'OPEN' } : {}),
      },
    });

    return { ok: true };
  }

  async listAssignees(): Promise<DisputeAssigneeItem[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: DISPUTE_HANDLER_ROLES },
        profile: { deletedAt: null },
        name: { not: DELETED_USER_NAME },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return users.map((u: any) => ({
      id: u.id,
      name: u.name?.trim() || u.email,
      email: u.email,
      role: u.role,
    }));
  }

  async addNote(adminUserId: string, disputeId: string, noteText: string): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { name: true },
    });

    const adminName = user?.name ?? 'Administrateur';
    const currentNotes = Array.isArray(dispute.adminNotes)
      ? (dispute.adminNotes as unknown as AdminDisputeNoteItem[])
      : [];

    const newNote: AdminDisputeNoteItem = {
      id: randomUUID(),
      adminUserId,
      adminName,
      note: noteText,
      createdAt: new Date().toISOString(),
    };

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        adminNotes: [...currentNotes, newNote] as any,
      },
    });

    return { ok: true };
  }

  async resolveRelease(adminUserId: string, disputeId: string, resolutionNote: string): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { commande: true },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'].includes(dispute.status)) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_RESOLVED);
    }

    // B11: Cannot release funds for an order that is already refunded.
    if (dispute.commande?.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette commande est déjà remboursée.');
    }

    let stripeTransferId = dispute.commande.stripeTransferId;
    let transferredCents = dispute.commande.transferredCents;
    // Set only when THIS call moves the money: a release over an existing transfer keeps its date.
    let transferredAt: Date | null = null;

    if (!stripeTransferId) {
      const connectAccount = await this.prisma.connectAccount.findUnique({
        where: { userId: dispute.commande.repairerUserId },
        select: { stripeAccountId: true },
      });

      // CF4-15 (spec §3). The rule changed: this used to fall through silently
      // ("Degrade gracefully if offline/unconfigured") and the release proceeded
      // with no funds moved, with the admin never told. Now both failure modes
      // refuse the whole release BEFORE the $transaction - no commande write, no
      // dispute write, no announce - so the admin sees the failure and can retry
      // rather than believe the réparateur was paid.
      if (!connectAccount?.stripeAccountId) {
        throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_NOT_PAYABLE);
      }
      if (!(await repairerFiscalComplete(this.prisma, dispute.commande.repairerUserId))) {
        throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_FISCAL_INCOMPLETE);
      }

      try {
        const transfer = await paymentsGateway().createTransfer(
          {
            amountCents: dispute.commande.repairCents,
            destination: connectAccount.stripeAccountId,
            sourceTransaction: dispute.commande.stripeChargeId ?? '',
            transferGroup: dispute.commandeId,
          },
          `admin-release:${dispute.commandeId}`,
        );
        stripeTransferId = transfer.id;
        transferredCents = dispute.commande.repairCents;
        transferredAt = new Date();
      } catch {
        throw new AppException('UNPROCESSABLE_ENTITY', TRANSFER_FAILED);
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.commande.update({
        where: { id: dispute.commandeId },
        data: {
          step: 'RELEASED',
          releasedAt: now,
          disputedAt: null,
          ...(stripeTransferId ? { stripeTransferId } : {}),
          ...(transferredCents ? { transferredCents } : {}),
          ...(transferredAt ? { transferredAt } : {}),
        },
      });
      await recordStep(tx, dispute.commandeId, 'RELEASED');

      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED_RELEASED',
          resolvedByUserId: adminUserId,
          resolvedAt: now,
          verdict: 'RELEASE_REPAIRER',
          resolutionNote,
        },
      });
    });

    // CF4-16 (spec §3.2) / CF4-15 (spec §3). `stripeTransferId` is now ALWAYS
    // truthy by this point: the two ways it could be falsy above (no
    // ConnectAccount, createTransfer throwing) both throw before the
    // $transaction, so this function never reaches here without funds having
    // moved (or having already moved on an earlier call). The `if` stays as a
    // belt-and-braces guard rather than being made unconditional, so a future
    // change to the checks above fails safe (no announce of a transfer that did
    // not happen) instead of silently regressing to the old behaviour.
    if (stripeTransferId) {
      await this.announcer.announce(dispute.commandeId, 'DISPUTE_RELEASED');
    }

    return { ok: true };
  }

  async resolveRefund(
    adminUserId: string,
    disputeId: string,
    input: ResolveDisputeRefundInput,
  ): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { commande: true },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'].includes(dispute.status)) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_RESOLVED);
    }

    // CF4-D task 6 (spec §6). The admin's own chosen breakdown, not a full refund:
    // RefundService.refund throws AppException on every refusal (validation,
    // payability, Stripe failure) before writing anything, so a throw here leaves
    // the dispute row untouched (still open) - the update below only runs once
    // the refund has actually landed.
    const result = await this.refunds.refund(
      adminUserId,
      dispute.commandeId,
      {
        motif: input.motif,
        note: input.resolutionNote,
        repairCents: input.repairCents,
        shippingCents: input.shippingCents,
        protectionCents: input.protectionCents,
      },
      'DISPUTE_REFUNDED',
    );

    const now = new Date();
    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED_REFUNDED',
        resolvedByUserId: adminUserId,
        resolvedAt: now,
        // CF4-D task 6 (spec §6). REFUND_CLIENT only when the admin refunded
        // everything the commande was worth; anything less is a PARTIAL_REFUND,
        // naming the dispute's actual verdict rather than always reading as a
        // full refund.
        verdict: result.refundCents === result.totalCents ? 'REFUND_CLIENT' : 'PARTIAL_REFUND',
        resolutionNote: input.resolutionNote,
      },
    });

    return { ok: true };
  }

  async resolveDismiss(adminUserId: string, disputeId: string, resolutionNote: string): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { commande: true },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'].includes(dispute.status)) {
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_RESOLVED);
    }

    // B11: Cannot dismiss / resume repair on an order that is already refunded.
    if (dispute.commande?.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette commande est déjà remboursée.');
    }

    const now = new Date();
    await this.prisma.commande.update({
      where: { id: dispute.commandeId },
      data: {
        disputedAt: null,
      },
    });

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED_DISMISSED',
        resolvedByUserId: adminUserId,
        resolvedAt: now,
        verdict: 'DISMISSED',
        resolutionNote,
      },
    });

    // CF4-16 (spec §3.2). After the dispute update commits.
    await this.announcer.announce(dispute.commandeId, 'DISPUTE_DISMISSED');

    return { ok: true };
  }
}
