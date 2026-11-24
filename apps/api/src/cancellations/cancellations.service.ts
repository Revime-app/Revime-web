import { Injectable } from '@nestjs/common';
import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_DISPUTED,
  CANCELLATION_NOT_PENDING,
  CANCELLATION_REASON_LABEL,
  CANCELLATION_RELEASED,
  type CancellationRequestInfo,
  type CreateCancellationRequestInput,
} from '@revime/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';

const NOT_FOUND = 'Ressource introuvable.';
const ALREADY_REFUNDED = 'Ce paiement a déjà été remboursé.';
const NOT_PAID = "Cette commande n'est pas encore payée.";

type RequestRow = {
  id: string;
  status: string;
  reason: string;
  comment: string | null;
  refusalNote: string | null;
  createdAt: Date;
};

/** `Prisma`'s generated type maps CANCELLATION_REASON_LABEL's keys exactly (Task 1's schema
 * order matches the migration's enum order), so this cast is total, not a widening escape. */
function present(row: RequestRow): CancellationRequestInfo {
  return {
    id: row.id,
    status: row.status as CancellationRequestInfo['status'],
    reason: row.reason as CancellationRequestInfo['reason'],
    comment: row.comment,
    refusalNote: row.refusalNote,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * CF4-27 (spec §4.2, §4.4). The post-payment cancellation request: `request` and `withdraw`.
 * A standalone module (not folded into `CommandesService`) so `CommandesModule` need not import
 * `NotificationsModule` a second way - same shape as `QuoteRequestsModule` beside `DemandesModule`.
 */
@Injectable()
export class CancellationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * I1-I4, I11 (spec §4.2's transition table, Review Focus 3). One `$transaction`: the
   * conditional flag write first (index 0, mirroring `RefundService.refund`'s own CAS
   * convention - Review Focus 1, 2), then the request row. A P2002 on the partial unique
   * index (two requests racing the same commande) reads identically to the write losing the
   * race: both are `CANCELLATION_ALREADY_PENDING`, 409.
   */
  async request(
    userId: string,
    commandeId: string,
    input: CreateCancellationRequestInput,
  ): Promise<CancellationRequestInfo> {
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, clientUserId: userId },
      select: {
        status: true,
        step: true,
        stripeTransferId: true,
        disputedAt: true,
        cancellationRequestedAt: true,
        demande: { select: { title: true } },
        repairerUserId: true,
        dispute: { select: { status: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    if (row.status !== 'PAID') {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PAID);
    }
    if (row.step === 'RELEASED' || row.stripeTransferId !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCELLATION_RELEASED);
    }
    if (row.disputedAt !== null || isDisputeOpen(row.dispute)) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCELLATION_DISPUTED);
    }
    // Already pending, read off the flag directly - the RACE against a second request
    // (two calls in flight at once) is a separate case, caught below by the conditional
    // write's count and the partial unique index's P2002, both answering the same message.
    if (row.cancellationRequestedAt !== null) {
      throw new AppException('CONFLICT', CANCELLATION_ALREADY_PENDING);
    }

    const info = await this.prisma
      .$transaction(async (tx) => {
        // The conditional CAS write: PAID, no transfer, not RELEASED, no dispute, no pending
        // request. Losing this re-check (a race against release or another request) 409s
        // with the SAME message as the P2002 branch below - the client cannot tell which
        // guard caught it, and does not need to.
        const flagged = await tx.commande.updateMany({
          where: {
            id: commandeId,
            status: 'PAID',
            stripeTransferId: null,
            step: { not: 'RELEASED' },
            disputedAt: null,
            cancellationRequestedAt: null,
          },
          data: { cancellationRequestedAt: new Date() },
        });
        if (flagged.count === 0) {
          throw new AppException('CONFLICT', CANCELLATION_ALREADY_PENDING);
        }

        return tx.cancellationRequest.create({
          data: {
            commandeId,
            requestedByUserId: userId,
            reason: input.reason,
            comment: input.comment ?? null,
            status: 'PENDING',
          },
          select: { id: true, status: true, reason: true, comment: true, refusalNote: true, createdAt: true },
        });
      })
      .catch((e: unknown) => {
        // I11: the partial unique index on (commandeId) WHERE status = 'PENDING'. Reached
        // only if the flag-write above raced past `cancellationRequestedAt: null` and the
        // row already had a PENDING request under some other write path - same remedy.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppException('CONFLICT', CANCELLATION_ALREADY_PENDING);
        }
        throw e;
      });

    await this.notifications.emit({
      userId: row.repairerUserId,
      mode: 'REPAIRER',
      type: 'CANCELLATION_REQUESTED',
      actorName: CANCELLATION_REASON_LABEL[input.reason],
      subject: row.demande.title,
      commandeId,
    });

    return present(info);
  }

  /**
   * I7. The requesting client only - a réparateur has no withdraw affordance (`cancellationPolicy`
   * never grants him `canWithdraw`), and this route is reached only via that button, so no
   * further ownership check on `requestedByUserId` is needed beyond `clientUserId`.
   */
  async withdraw(userId: string, commandeId: string): Promise<{ ok: true }> {
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, clientUserId: userId },
      select: { repairerUserId: true, demande: { select: { title: true } } },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    await this.prisma.$transaction(async (tx) => {
      const withdrawn = await tx.cancellationRequest.updateMany({
        where: { commandeId, status: 'PENDING' },
        data: { status: 'WITHDRAWN', decidedAt: new Date() },
      });
      if (withdrawn.count === 0) {
        throw new AppException('CONFLICT', CANCELLATION_NOT_PENDING);
      }
      await tx.commande.updateMany({
        where: { id: commandeId },
        data: { cancellationRequestedAt: null },
      });
    });

    await this.notifications.emit({
      userId: row.repairerUserId,
      mode: 'REPAIRER',
      type: 'CANCELLATION_WITHDRAWN',
      actorName: null,
      subject: row.demande.title,
      commandeId,
    });

    return { ok: true };
  }
}
