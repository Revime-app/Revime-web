import { Injectable } from '@nestjs/common';
import {
  CANCEL_PAYMENT_IN_FLIGHT,
  QUOTE_REQUEST_TTL_DAYS,
  type CreateQuoteRequestInput,
  type DeclineQuoteRequestInput,
  type DemandeDto,
  type RepairerQuoteRequestItem,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { VISIBLE_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { DemandesService } from '../demandes/demandes.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LIVE_OFFER_WHERE } from '../offers/offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide } from '../review-accounts/review-account.js';
import { hasOfferIdentity } from '../verification/gate.js';
import { isMessagingEnabled } from '../conversations/flag.js';
import { quoteCancelledSystemMessage } from '../conversations/system-message.js';
import { postSystemNotice } from '../conversations/system-notice.js';
import { GATEWAY_GRACE_MS } from '../payments/config.js';
import { paymentsGateway } from '../payments/gateway.js';
import {
  QUOTE_ALREADY_ACCEPTED,
  QUOTE_ALREADY_OPEN,
  QUOTE_NOT_OPEN,
  QUOTE_NOTHING_TO_REFUSE,
  QUOTE_SELF,
  QUOTE_TARGET_UNAVAILABLE,
  QUOTE_TARGET_UNVERIFIED,
} from './quote-request-messages.js';

export {
  QUOTE_ALREADY_OPEN,
  QUOTE_SELF,
  QUOTE_TARGET_UNAVAILABLE,
  QUOTE_TARGET_UNVERIFIED,
} from './quote-request-messages.js';

/**
 * CF4-25 (sub-project H, spec §4.2). A private « Demander un devis » request: a `Demande`
 * with `targetRepairerUserId`, readable only by its author, that réparateur and admins.
 * The quote is an ordinary `Offer` (`OffersService.create`), and acceptance is the existing
 * checkout - nothing here touches money.
 *
 * 🛑 EVERY TRANSITION IS A CONDITIONAL WRITE ON `status = 'OPEN'`, demande first, inside a
 * transaction with the offer write that follows it. Postgres re-checks the WHERE of a row it
 * waited on, so of two concurrent transitions (or a transition and `OffersService.create`'s
 * own conditional write) exactly one sees OPEN; the other gets count 0 → 409 and its
 * transaction writes nothing. Notifications go out after commit (emit() never throws).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The request row every transition reads. Live offers only - at most one (H2). */
const REQUEST_SELECT = {
  id: true,
  title: true,
  status: true,
  authorUserId: true,
  targetRepairerUserId: true,
  offers: { where: LIVE_OFFER_WHERE, select: { id: true, repairerUserId: true } },
} satisfies Prisma.DemandeSelect;

type Outcome = { ok: true };

@Injectable()
export class QuoteRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandes: DemandesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    clientId: string,
    repairerUserId: string,
    input: CreateQuoteRequestInput,
  ): Promise<DemandeDto> {
    if (clientId === repairerUserId) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_SELF);
    }
    // PUB-33 (DECP-23): across the store-review seal the réparateur does not exist (404).
    await assertSameSide(this.prisma, clientId, repairerUserId);

    // The target must be able to ANSWER: in réparateur mode, not suspended, not deleted,
    // and past the same identity rule the offer gate applies - otherwise the client waits a
    // week for a quote that cannot come.
    const target = await this.prisma.profile.findFirst({
      where: { userId: repairerUserId },
      select: { deletedAt: true, repairerEnabled: true, repairerSuspendedAt: true },
    });
    if (!target || target.deletedAt !== null || !target.repairerEnabled || target.repairerSuspendedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_TARGET_UNAVAILABLE);
    }
    if (!(await hasOfferIdentity(this.prisma, repairerUserId))) {
      throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_TARGET_UNVERIFIED);
    }

    const { preferredTravel, details, ...demandeInput } = input;
    const dto = await this.demandes
      .create(clientId, demandeInput, {
        targetRepairerUserId: repairerUserId,
        quoteExpiresAt: new Date(Date.now() + QUOTE_REQUEST_TTL_DAYS * DAY_MS),
        quotePreferredTravel: preferredTravel ?? null,
        quoteDetails: details ?? null,
      })
      .catch((e: unknown) => {
        // H6: the partial unique index on (author, target) for OPEN private rows. The only
        // unique constraint a demande insert can hit.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppException('CONFLICT', QUOTE_ALREADY_OPEN);
        }
        throw e;
      });

    // After the write; emit() never throws. The client's HANDLE, never a legal name - the
    // rule `payments.service.ts` states for OFFER_ACCEPTED.
    const client = await this.prisma.user.findFirst({
      where: { id: clientId },
      select: { username: true },
    });
    await this.notifications.emit({
      userId: repairerUserId,
      mode: 'REPAIRER',
      type: 'QUOTE_REQUESTED',
      actorName: client?.username ?? null,
      subject: input.title,
      demandeId: dto.id,
    });

    return dto;
  }

  /** His private requests, OPEN first, then newest. Every status, so closed ones stay listed. */
  async listForRepairer(repairerId: string): Promise<RepairerQuoteRequestItem[]> {
    const rows = await this.prisma.demande.findMany({
      where: { targetRepairerUserId: repairerId, ...VISIBLE_DEMANDE_WHERE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        quoteExpiresAt: true,
        quoteClosedReason: true,
        createdAt: true,
        author: { select: { username: true } },
        offers: {
          where: { repairerUserId: repairerId, ...LIVE_OFFER_WHERE },
          select: { id: true, priceCents: true },
          take: 1,
        },
      },
    });

    const items = rows.map((r) => ({
      demandeId: r.id,
      title: r.title,
      clientName: r.author.username,
      status: r.status,
      expiresAt: r.quoteExpiresAt?.toISOString() ?? null,
      closedReason: r.quoteClosedReason,
      liveQuote: r.offers[0] ? { offerId: r.offers[0].id, priceCents: r.offers[0].priceCents } : null,
      createdAt: r.createdAt.toISOString(),
    }));
    // Stable: newest-first survives within each group.
    return items.sort((a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN'));
  }

  /** The target declines, with a reason the client is shown. */
  async decline(repairerId: string, demandeId: string, input: DeclineQuoteRequestInput): Promise<Outcome> {
    const req = await this.findRequest({ id: demandeId, targetRepairerUserId: repairerId });
    assertOpen(req.status);
    await this.settleCheckoutBeforeClose(demandeId);

    await this.prisma.$transaction(async (tx) => {
      await closeOpen(tx, demandeId, {
        quoteClosedReason: 'DECLINED',
        quoteDeclineNote: input.note,
      });
      // His live quote, if he had sent one: none may remain on a CANCELLED request.
      await tx.offer.updateMany({
        where: { demandeId, ...LIVE_OFFER_WHERE },
        data: { status: 'WITHDRAWN' },
      });
      await reapPendingCheckout(tx, demandeId);
    });

    await this.notifications.emit({
      userId: req.authorUserId,
      mode: 'CLIENT',
      type: 'QUOTE_DECLINED',
      actorName: null,
      subject: req.title,
      demandeId,
    });
    return { ok: true };
  }

  /** The author refuses the quote. H5: that closes the request. */
  async refuse(clientId: string, demandeId: string): Promise<Outcome> {
    const req = await this.findRequest({ id: demandeId, authorUserId: clientId });
    assertOpen(req.status);
    await this.settleCheckoutBeforeClose(demandeId);
    const quote = req.offers[0];
    if (!quote) throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_NOTHING_TO_REFUSE);

    await this.prisma.$transaction(async (tx) => {
      await closeOpen(tx, demandeId, { quoteClosedReason: 'QUOTE_REFUSED' });
      const rejected = await tx.offer.updateMany({
        where: { id: quote.id, ...LIVE_OFFER_WHERE },
        data: { status: 'REJECTED' },
      });
      // He withdrew it between our read and this write: roll the close back rather than
      // record a « Devis refusé » on a quote that no longer exists.
      if (rejected.count === 0) throw new AppException('CONFLICT', QUOTE_NOT_OPEN);
      await reapPendingCheckout(tx, demandeId);
    });

    await this.notifications.emit({
      userId: quote.repairerUserId,
      mode: 'REPAIRER',
      type: 'QUOTE_REFUSED',
      actorName: null,
      subject: req.title,
      demandeId,
    });
    return { ok: true };
  }

  /** The author withdraws the request before accepting anything. */
  async cancel(clientId: string, demandeId: string): Promise<Outcome> {
    const req = await this.findRequest({ id: demandeId, authorUserId: clientId });
    // `findRequest` only returns private requests, so this is the type narrowing, not a branch.
    const targetId = req.targetRepairerUserId;
    if (targetId === null) throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    assertOpen(req.status);
    await this.settleCheckoutBeforeClose(demandeId);

    const now = new Date();
    let conversationId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      await closeOpen(tx, demandeId, { quoteClosedReason: 'CANCELLED_BY_CLIENT' });
      await tx.offer.updateMany({
        where: { demandeId, ...LIVE_OFFER_WHERE },
        data: { status: 'WITHDRAWN' },
      });
      await reapPendingCheckout(tx, demandeId);

      // CF6-12: record the cancellation in the pair's conversation, so it shows in the
      // history on both sides. Gated like every other conversation write.
      if (isMessagingEnabled()) {
        conversationId = await postSystemNotice(tx, {
          demandeId,
          clientUserId: clientId,
          repairerUserId: targetId,
          body: quoteCancelledSystemMessage(),
          now,
        });
      }
    });

    // The existing « Le client a retiré … » - true here, unlike an operator removal.
    // CF6-12: pass conversationId so notification routes directly to the thread.
    await this.notifications.emit({
      userId: targetId,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: req.title,
      demandeId,
      ...(conversationId ? { conversationId } : {}),
    });
    return { ok: true };
  }

  /**
   * The cron job: OPEN private requests past `quoteExpiresAt` with no live quote. Sending a
   * quote clears `quoteExpiresAt` in the same conditional write that admits the offer, so the
   * per-row write below (which re-checks both) cannot close a request that was just answered.
   * One row failing does not stop the others.
   */
  async expireDue(now: Date = new Date()): Promise<{ scanned: number; acted: number; failed: number }> {
    const due = await this.prisma.demande.findMany({
      where: {
        status: 'OPEN',
        targetRepairerUserId: { not: null },
        quoteExpiresAt: { lt: now },
        ...VISIBLE_DEMANDE_WHERE,
        offers: { none: LIVE_OFFER_WHERE },
      },
      select: { id: true, title: true, authorUserId: true },
    });

    let acted = 0;
    let failed = 0;
    for (const row of due) {
      try {
        const closed = await this.prisma.demande.updateMany({
          where: { id: row.id, status: 'OPEN', quoteExpiresAt: { lt: now } },
          data: { status: 'CANCELLED', quoteClosedReason: 'EXPIRED', quoteExpiresAt: null },
        });
        if (closed.count === 0) continue;
        acted += 1;
        await this.notifications.emit({
          userId: row.authorUserId,
          mode: 'CLIENT',
          type: 'QUOTE_EXPIRED',
          actorName: null,
          subject: row.title,
          demandeId: row.id,
        });
      } catch (e: unknown) {
        failed += 1;
        console.error('[cron] failed to expire quote request %s', row.id, e);
      }
    }
    return { scanned: due.length, acted, failed };
  }

  /** A private request the caller is party to, or the same 404 as a nonexistent id. */
  private async findRequest(party: Prisma.DemandeWhereInput) {
    const req = await this.prisma.demande.findFirst({
      where: { ...party, targetRepairerUserId: party.targetRepairerUserId ?? { not: null }, ...VISIBLE_DEMANDE_WHERE },
      select: REQUEST_SELECT,
    });
    if (!req) throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    return req;
  }

  /**
   * Runs BEFORE the close transaction, because it talks to Stripe and a gateway call must not
   * hold a database transaction open. It makes sure no pending checkout of this request can
   * still be paid once the request is closed, or refuses the close:
   *
   * - a PAID commande, or a PaymentIntent / session that has already succeeded (the webhook
   *   simply has not landed yet) -> `QUOTE_ALREADY_ACCEPTED`. Reaping that row would orphan a
   *   charge: the completed event finds a non-pending commande and returns, and nothing refunds.
   * - a PaymentIntent still `processing`, or a row with no Stripe id younger than
   *   `GATEWAY_GRACE_MS` (a sibling request is inside the gateway right now) ->
   *   `CANCEL_PAYMENT_IN_FLIGHT`.
   * - anything else still payable is cancelled at Stripe here, so the PaymentSheet the client
   *   may have left open fails on confirm instead of charging a card for a closed request.
   *
   * The transaction then flips the rows to ABANDONED (`reapPendingCheckout`). A checkout created
   * in the few milliseconds between this scan and that write is not covered; it needs a live
   * offer, which the same transaction withdraws, so it cannot be completed afterwards.
   */
  private async settleCheckoutBeforeClose(demandeId: string, now: Date = new Date()): Promise<void> {
    const paid = await this.prisma.commande.findFirst({
      where: { demandeId, status: 'PAID' },
      select: { id: true },
    });
    if (paid) throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_ALREADY_ACCEPTED);

    const pending = await this.prisma.commande.findMany({
      where: { demandeId, status: 'PENDING_PAYMENT' },
      select: { stripePaymentIntentId: true, stripeSessionId: true, createdAt: true },
    });
    for (const row of pending) {
      if (row.stripePaymentIntentId) {
        await settlePaymentIntent(row.stripePaymentIntentId);
      } else if (row.stripeSessionId) {
        await settleCheckoutSession(row.stripeSessionId);
      } else if (now.getTime() - row.createdAt.getTime() < GATEWAY_GRACE_MS) {
        throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_PAYMENT_IN_FLIGHT);
      }
    }
  }
}

function assertOpen(status: string): void {
  if (status === 'IN_PROGRESS' || status === 'DONE') {
    throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_ALREADY_ACCEPTED);
  }
  if (status !== 'OPEN') {
    throw new AppException('CONFLICT', QUOTE_NOT_OPEN);
  }
}

/** The conditional close. Count 0 = lost the race → 409, which rolls the transaction back. */
async function closeOpen(
  tx: Prisma.TransactionClient,
  demandeId: string,
  reason: { quoteClosedReason: 'DECLINED' | 'QUOTE_REFUSED' | 'CANCELLED_BY_CLIENT'; quoteDeclineNote?: string },
): Promise<void> {
  const closed = await tx.demande.updateMany({
    where: { id: demandeId, status: 'OPEN' },
    data: { status: 'CANCELLED', ...reason, quoteExpiresAt: null },
  });
  if (closed.count === 0) throw new AppException('CONFLICT', QUOTE_NOT_OPEN);
}

/** Flips every unpaid checkout of the request to ABANDONED, in the close transaction (CF6-13). */
async function reapPendingCheckout(tx: Prisma.TransactionClient, demandeId: string): Promise<void> {
  await tx.commande.updateMany({
    where: { demandeId, status: 'PENDING_PAYMENT' },
    data: { status: 'ABANDONED' },
  });
}

/** Maps a PaymentIntent status that must not be reaped to the refusal the caller sees. */
function refuseIfUnreapable(status: string): void {
  if (status === 'succeeded') throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_ALREADY_ACCEPTED);
  if (status === 'processing') throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_PAYMENT_IN_FLIGHT);
}

async function settlePaymentIntent(id: string): Promise<void> {
  const gateway = paymentsGateway();
  const intent = await gateway.retrievePaymentIntent(id);
  refuseIfUnreapable(intent.status);
  if (intent.status === 'canceled') return;
  try {
    await gateway.cancelPaymentIntent(id);
  } catch (e: unknown) {
    // It may have succeeded or started processing between the read and the cancel: Stripe
    // then refuses the cancel. Re-read to refuse with the right reason; otherwise it was a
    // real failure and the request stays open.
    refuseIfUnreapable((await gateway.retrievePaymentIntent(id)).status);
    throw e;
  }
}

async function settleCheckoutSession(id: string): Promise<void> {
  const gateway = paymentsGateway();
  const session = await gateway.retrieveCheckoutSession(id);
  if (session.status === 'complete') throw new AppException('UNPROCESSABLE_ENTITY', QUOTE_ALREADY_ACCEPTED);
  if (session.status === 'expired') return;
  await gateway.expireCheckoutSession(id);
}
