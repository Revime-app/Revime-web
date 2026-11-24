import { Injectable } from '@nestjs/common';
import {
  type AdminCancellationDetail,
  type AdminCancellationListItem,
  type AdminCancellationListQuery,
  type CancellationRequesterRole,
  type RefundBreakdownInput,
  DELETED_USER_NAME,
  isDeletedUser,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RefundService } from '../commandes/refund.service.js';

const NOT_FOUND = 'Ressource introuvable.';
const NOT_PENDING = "Cette demande d'annulation n'est plus en attente.";

/** What both the queue and the drawer read of an order: the parties and the money that is frozen. */
const PARTIES_SELECT = {
  clientUserId: true,
  repairerUserId: true,
  step: true,
  totalCents: true,
  stripeTransferId: true,
  demande: { select: { title: true } },
  client: { select: { name: true, profile: { select: { deletedAt: true } } } },
  repairer: { select: { name: true, profile: { select: { deletedAt: true } } } },
} as const;

type NamedUser = { name: string; profile: { deletedAt: Date | null } | null };

/** A deleted account is shown as « Utilisateur supprimé », never as its `deleted+…@revime.invalid` name. */
function displayName(user: NamedUser | null | undefined, missing: string = DELETED_USER_NAME): string {
  if (!user) return missing;
  return user.profile?.deletedAt || isDeletedUser(user.name) ? DELETED_USER_NAME : user.name;
}

/**
 * P14 « qui a demandé et accepté ». Only a client can open a request, so the role is the client's
 * unless the id matches the réparateur; any other id is staff. The decider is the admin who
 * approved or refused (`decidedByUserId`); a WITHDRAWN request was closed by whoever asked, and
 * an approval by the no-charge path records no decider, so it stays null rather than guessing.
 */
function attribution(
  r: {
    requestedByUserId: string;
    decidedByUserId: string | null;
    status: string;
    commande: { clientUserId: string; repairerUserId: string; client: NamedUser | null; repairer: NamedUser | null };
  },
  people: Map<string, NamedUser>,
): { requestedByName: string; requestedByRole: CancellationRequesterRole; decidedByName: string | null } {
  const { commande } = r;
  const role: CancellationRequesterRole =
    r.requestedByUserId === commande.clientUserId
      ? 'CLIENT'
      : r.requestedByUserId === commande.repairerUserId
        ? 'REPAIRER'
        : 'ADMIN';
  const requestedByName =
    role === 'CLIENT'
      ? displayName(commande.client)
      : role === 'REPAIRER'
        ? displayName(commande.repairer)
        : displayName(people.get(r.requestedByUserId), 'Admin');
  const decidedByName =
    r.status === 'WITHDRAWN'
      ? requestedByName
      : r.decidedByUserId
        ? displayName(people.get(r.decidedByUserId), 'Admin')
        : null;
  return { requestedByName, requestedByRole: role, decidedByName };
}

/**
 * CF4-27 (spec §4.2, §4.4, §4.5) & P14:
 * Admin decisions: refuse, approve, list, and detail with requester attribution & decision metadata.
 */
@Injectable()
export class AdminCancellationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundService,
  ) {}

  /** PENDING oldest first (the queue, worked in arrival order); HISTORY newest first. */
  async list(query: Partial<AdminCancellationListQuery> = {}): Promise<AdminCancellationListItem[]> {
    const status = query.status ?? 'PENDING';
    const rows = await this.prisma.cancellationRequest.findMany({
      where: status === 'PENDING' ? { status: 'PENDING' } : { status: { not: 'PENDING' } },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      select: {
        id: true,
        commandeId: true,
        requestedByUserId: true,
        decidedByUserId: true,
        decidedAt: true,
        reason: true,
        status: true,
        createdAt: true,
        commande: { select: PARTIES_SELECT },
      },
    });

    const people = await this.peopleById(rows.flatMap((r) => [r.requestedByUserId, r.decidedByUserId]));
    return rows.map((r) => ({
      id: r.id,
      commandeId: r.commandeId,
      demandeTitle: r.commande.demande.title,
      clientName: displayName(r.commande.client),
      repairerName: displayName(r.commande.repairer),
      totalCents: r.commande.totalCents,
      step: r.commande.step,
      transferred: r.commande.stripeTransferId !== null,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      ...attribution(r, people),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }));
  }

  async getDetail(id: string): Promise<AdminCancellationDetail> {
    const r = await this.prisma.cancellationRequest.findFirst({
      where: { id },
      select: {
        id: true,
        commandeId: true,
        requestedByUserId: true,
        decidedByUserId: true,
        reason: true,
        comment: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        refusalNote: true,
        commande: {
          select: {
            ...PARTIES_SELECT,
            delivery: true,
            status: true,
            refundedCents: true,
            repairCents: true,
            shippingCents: true,
            insuranceCents: true,
            protectionCents: true,
            dispute: { select: { id: true, number: true, status: true, verdict: true } },
          },
        },
      },
    });
    if (!r) throw new AppException('NOT_FOUND', NOT_FOUND);

    const people = await this.peopleById([r.requestedByUserId, r.decidedByUserId]);
    return {
      id: r.id,
      commandeId: r.commandeId,
      demandeTitle: r.commande.demande.title,
      clientName: displayName(r.commande.client),
      repairerName: displayName(r.commande.repairer),
      totalCents: r.commande.totalCents,
      step: r.commande.step,
      transferred: r.commande.stripeTransferId !== null,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      ...attribution(r, people),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      comment: r.comment,
      refusalNote: r.refusalNote,
      delivery: r.commande.delivery,
      conversationId: null,
      refund: {
        repairCents: r.commande.repairCents,
        shippingCents: r.commande.shippingCents,
        protectionCents: r.commande.protectionCents,
        insuranceCents: r.commande.insuranceCents,
      },
      disputeNumber: r.commande.dispute?.number ?? null,
      disputeStatus: r.commande.dispute
        ? effectiveDisputeStatus({
            status: r.commande.dispute.status,
            verdict: r.commande.dispute.verdict,
            commande: r.commande,
          }).status
        : null,
    };
  }

  /** The users behind a set of ids, one query: the names the queue shows for who asked and who decided. */
  private async peopleById(ids: Array<string | null>): Promise<Map<string, NamedUser>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, name: true, profile: { select: { deletedAt: true } } },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  /** I8: the note is required (schema-enforced upstream) and shown to the client verbatim. */
  async refuse(adminUserId: string, id: string, input: { note: string }): Promise<{ ok: true }> {
    const r = await this.prisma.cancellationRequest.findFirst({
      where: { id },
      select: {
        commandeId: true,
        status: true,
        commande: { select: { repairerUserId: true, clientUserId: true, demande: { select: { title: true } } } },
      },
    });
    if (!r) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (r.status !== 'PENDING') {
      throw new AppException('CONFLICT', NOT_PENDING);
    }

    await this.prisma.$transaction(async (tx) => {
      const decided = await tx.cancellationRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REFUSED', refusalNote: input.note, decidedAt: new Date(), decidedByUserId: adminUserId },
      });
      if (decided.count === 0) {
        throw new AppException('CONFLICT', NOT_PENDING);
      }
      await tx.commande.updateMany({
        where: { id: r.commandeId },
        data: { cancellationRequestedAt: null },
      });
    });

    const title = r.commande.demande.title;
    await this.notifications.emit({
      userId: r.commande.clientUserId,
      mode: 'CLIENT',
      type: 'CANCELLATION_REFUSED',
      actorName: null,
      subject: title,
      commandeId: r.commandeId,
    });
    await this.notifications.emit({
      userId: r.commande.repairerUserId,
      mode: 'REPAIRER',
      type: 'CANCELLATION_REFUSED',
      actorName: null,
      subject: title,
      commandeId: r.commandeId,
    });

    return { ok: true };
  }

  /**
   * I9: always the existing refund engine, motif forced to `CLIENT_CANCELLED` regardless of
   * what the admin's body carries - the request IS the reason, not a choice he makes twice.
   * `RefundService.refund` re-checks PAID/not-RELEASED itself and refuses a zero total
   * (`RefundPlanError`), which this method does not catch: on a refusal the request stays
   * PENDING (nothing here has written to it yet), matching the plan's own transition table.
   *
   * The `requirePendingCancellation` flag closes Review Focus 1's race: the PENDING check
   * just above is a pre-check, not a guard, so a client's `withdraw` can still commit before
   * `refund()`'s own transaction runs. Passing `true` adds `cancellationRequestedAt: { not: null }`
   * to that transaction's CAS, so a withdrawal that wins the race makes the refund's own write
   * lose (count 0, the existing `STATE_CHANGED` refusal) instead of moving money against a
   * request that no longer exists.
   */
  async approve(adminUserId: string, id: string, input: RefundBreakdownInput): Promise<{ ok: true }> {
    const r = await this.prisma.cancellationRequest.findFirst({
      where: { id },
      select: { commandeId: true, status: true },
    });
    if (!r) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (r.status !== 'PENDING') {
      throw new AppException('CONFLICT', NOT_PENDING);
    }

    await this.refunds.refund(adminUserId, r.commandeId, { ...input, motif: 'CLIENT_CANCELLED' }, 'REFUNDED', true);

    return { ok: true };
  }
}
