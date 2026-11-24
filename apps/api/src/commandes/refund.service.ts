import { Inject, Injectable, forwardRef } from '@nestjs/common';
import type { RefundBreakdownInput } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { repairerFiscalComplete } from '../fiscal/fiscal-gate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paymentsGateway } from '../payments/gateway.js';
import { connectGateway } from '../connect/gateway.js';
import { refundPlan, RefundPlanError, shareOwedCents } from './refund-plan.js';
import { sendRefundShareOpsMail } from './ops-mail.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShipmentsService } from '../shipping/shipments.service.js';
import { CommandeAnnouncer } from './commande-announcer.service.js';
import { closePendingCancellation } from '../cancellations/close-pending.js';

const NOT_FOUND = 'Ressource introuvable.';
const NOT_REFUNDABLE = 'Cette commande ne peut pas être remboursée.';
const ALREADY_REFUNDED = 'Cette commande a déjà été remboursée.';
const NO_CHARGE = "Ce paiement n'a pas de transaction à rembourser.";
const REFUND_FAILED = 'Le remboursement a échoué. Réessayez dans quelques minutes.';
const REFUND_REJECTED = 'Le remboursement a été refusé par Stripe.';
const REPAIRER_NOT_PAYABLE =
  'Le réparateur ne peut pas recevoir de paiement : remboursez la totalité de la réparation ou réessayez plus tard.';
const REPAIRER_FISCAL_INCOMPLETE =
  "Le réparateur n'a pas complété ses informations fiscales (DAC7) : sa part ne peut pas être versée. Remboursez la totalité de la réparation ou attendez qu'il les complète.";
const NO_SHARE_OWED = 'Aucune part due pour cette commande.';
const REFUND_NOT_CONFIRMED = "Le remboursement n'est pas encore confirmé par Stripe.";
const SHARE_TRANSFER_FAILED = 'Le versement au réparateur a échoué. Réessayez dans quelques minutes.';
const STATE_CHANGED = "La commande a déjà changé d'état.";
const CANCEL_ONLY_PAID =
  "Seule une commande payée dont la charge Stripe est introuvable peut être annulée ici. Une commande en attente de paiement est abandonnée automatiquement.";
const CANCEL_HAS_CHARGE =
  "Cette commande dispose d'une charge Stripe : utilisez le formulaire de remboursement.";
const CANCEL_STRIPE_UNREADABLE =
  "Impossible de vérifier ce paiement auprès de Stripe : la commande n'a pas été annulée. Réessayez dans quelques minutes.";

/**
 * The operator's one remedy, in its own service because it is the only operation
 * in this project that makes TWO Stripe writes with a partial-failure path
 * between them.
 *
 * NOT flag-guarded, for the reason the colis route already records: gating the
 * operator's remedy on PAYMENTS_ENABLED locks the one person able to unstick a
 * stuck order out with the same switch that created the situation. It is
 * unreachable in production regardless - no commande can be PAID while the flag
 * is off.
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    // Livraison Boxtal (spec §8.7). forwardRef: ShipmentsService depends on CommandesService,
    // which lives in this module.
    @Inject(forwardRef(() => ShipmentsService)) private readonly shipments: ShipmentsService,
    // CF4-16/CF4-29 (spec §3.2). No forwardRef needed: CommandeAnnouncer lives in this same
    // module and depends only on Prisma + NotificationsService, so there is no cycle back to
    // RefundService for Nest to break.
    private readonly announcer: CommandeAnnouncer,
  ) {}

  /**
   * CF4-D (spec §3, D3). Live Stripe check, not the row: mirrors
   * `CommandesService.releaseInternal`'s reasoning exactly - a `ConnectAccount`
   * row is only as fresh as the last `account.updated` webhook, so payability is
   * asked of Stripe itself, right before the money would move. Public because
   * Task 5's pay-share retry needs the identical guard.
   */
  async assertRepairerPayable(repairerUserId: string, banned: boolean): Promise<string> {
    if (banned) {
      throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_NOT_PAYABLE);
    }

    // CMP-D3, the golden rule: the réparateur's share of a partial refund is a payout like any
    // other. Refused here, BEFORE the client's refund is created, so a refund is never issued
    // against a share that cannot be paid.
    if (!(await repairerFiscalComplete(this.prisma, repairerUserId))) {
      throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_FISCAL_INCOMPLETE);
    }

    const account = await this.prisma.connectAccount.findUnique({
      where: { userId: repairerUserId },
      select: { stripeAccountId: true },
    });
    if (!account) {
      throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_NOT_PAYABLE);
    }

    const live = await connectGateway()
      .retrieveAccount(account.stripeAccountId)
      .catch((e: unknown) => {
        console.error('[refund] could not read the connected account', account.stripeAccountId, e);
        throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_NOT_PAYABLE);
      });
    if (!live.transfersActive) {
      throw new AppException('UNPROCESSABLE_ENTITY', REPAIRER_NOT_PAYABLE);
    }

    return account.stripeAccountId;
  }

  /**
   * B3 (RU-12 review). « Annuler la commande » for a CHARGE_MISSING row: PAID, `stripeChargeId`
   * null. A null charge id does NOT prove nothing was charged - `backfillChargeIds` exists because
   * Stripe-collected orders reach us without one - so Stripe is asked before the row is touched, and
   * a charge it reveals is written back so the refund form can take over. An order whose payment
   * cannot be read is refused: cancelling it blind would strand a captured payment on an ABANDONED
   * row that neither the backfill nor `refund()` will ever look at again.
   *
   * Mirrors what `refund()` does to the demande (CANCELLED), the pending cancellation request and the
   * unshipped label, in ONE transaction gated on the same state this method read.
   */
  async cancelWithoutCharge(commandeId: string): Promise<void> {
    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        id: true,
        status: true,
        demandeId: true,
        stripeChargeId: true,
        stripePaymentIntentId: true,
        stripeSessionId: true,
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    if (row.status === 'ABANDONED') {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette commande est déjà annulée.');
    }
    if (row.status !== 'PAID') {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_ONLY_PAID);
    }
    if (row.stripeChargeId) {
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_HAS_CHARGE);
    }

    // Nothing to ask Stripe about when the row never carried a Stripe id: legacy test data.
    const known = await this.stripeCollected(row);
    if (known.collected) {
      if (known.chargeId) {
        // Make the order refundable. The CAS keeps this from overwriting a charge id the
        // backfill wrote while we were talking to Stripe.
        await this.prisma.commande.updateMany({
          where: { id: commandeId, stripeChargeId: null },
          data: { stripeChargeId: known.chargeId },
        });
      }
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_HAS_CHARGE);
    }

    await this.prisma.$transaction(async (tx) => {
      const won = await tx.commande.updateMany({
        where: { id: commandeId, status: 'PAID', stripeChargeId: null },
        data: { status: 'ABANDONED' },
      });
      // Throwing is what rolls the demande write back: it must not be cancelled for an order
      // that moved under us (refunded, charge id backfilled) between the read and here.
      if (won.count === 0) throw new AppException('UNPROCESSABLE_ENTITY', STATE_CHANGED);
      await tx.demande.update({ where: { id: row.demandeId }, data: { status: 'CANCELLED' } });
      await closePendingCancellation(tx, commandeId, 'APPROVED', null);
    });

    // After the commit, never throws: a label Boxtal will not release is mailed to ops.
    await this.shipments.cancelUnshipped(commandeId);
  }

  /** Did Stripe collect money for this row? Throws (refusing the cancel) when it cannot tell. */
  private async stripeCollected(row: {
    stripePaymentIntentId: string | null;
    stripeSessionId: string | null;
  }): Promise<{ collected: boolean; chargeId: string | null }> {
    try {
      if (row.stripePaymentIntentId) {
        const intent = await paymentsGateway().retrievePaymentIntent(row.stripePaymentIntentId);
        return { collected: intent.chargeId !== null || intent.status === 'succeeded', chargeId: intent.chargeId };
      }
      if (row.stripeSessionId) {
        const session = await paymentsGateway().retrieveCheckoutSession(row.stripeSessionId);
        return { collected: session.chargeId !== null || session.status === 'complete', chargeId: session.chargeId };
      }
    } catch (e: unknown) {
      console.error('[refund] could not read the Stripe payment of a CHARGE_MISSING commande', e);
      throw new AppException('UNPROCESSABLE_ENTITY', CANCEL_STRIPE_UNREADABLE);
    }
    return { collected: false, chargeId: null };
  }

  async refund(
    adminUserId: string,
    commandeId: string,
    input: RefundBreakdownInput,
    announce: 'REFUNDED' | 'DISPUTE_REFUNDED' = 'REFUNDED',
    // CF4-I (Review Focus 1, whole-branch review fix pass). Set by
    // `AdminCancellationsService.approve`: the CAS gains `cancellationRequestedAt: { not: null }`
    // so a withdraw racing between approve's own PENDING pre-check and this transaction closes
    // the TOCTOU window - the write loses (count 0, `STATE_CHANGED`) instead of refunding a
    // request the client just withdrew. `false` for every other caller (the plain admin refund,
    // dispute resolution), which must succeed whether or not a request ever existed.
    requirePendingCancellation = false,
  ): Promise<{ refundCents: number; totalCents: number }> {
    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        id: true,
        status: true,
        demandeId: true,
        totalCents: true,
        repairCents: true,
        shippingCents: true,
        insuranceCents: true,
        protectionCents: true,
        stripeChargeId: true,
        stripeTransferId: true,
        transferredCents: true,
        stripeTransferReversalId: true,
        stripeRefundId: true,
        clientUserId: true,
        repairerUserId: true,
        repairer: { select: { banned: true } },
        demande: { select: { title: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    // F3: Sentinel state - a transient refund error left both parties' money on
    // the platform. Log it loudly so monitoring can surface it.
    if (row.status === 'PAID' && row.stripeTransferReversalId) {
      console.error(
        '[refund] commande %s is PAID with reversal %s already recorded - client and réparateur money both on platform',
        commandeId,
        row.stripeTransferReversalId,
      );
    }

    // Distinct messages, deliberately: "already refunded" and "never paid" are
    // different situations and an operator acting on the wrong one needs to know
    // which.
    if (row.status === 'REFUNDED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REFUNDED);
    }
    if (row.status !== 'PAID') {
      // A PENDING_PAYMENT row has no charge to refund. J4 turns one into a
      // refundable PAID row within six hours, so this sequences automatically
      // rather than needing a documented work-around. See the P5 spec §6.1.
      const message =
        row.status === 'PENDING_PAYMENT'
          ? 'Cette commande est en attente de paiement (non payée) et ne peut pas être remboursée.'
          : NOT_REFUNDABLE;
      throw new AppException('UNPROCESSABLE_ENTITY', message);
    }
    if (!row.stripeChargeId) {
      // J3 backfills this. Until it has, there is nothing to refund.
      console.error('[refund] PAID commande with no charge id', commandeId);
      throw new AppException('UNPROCESSABLE_ENTITY', NO_CHARGE);
    }

    // CF4-D step 2 (spec §3). The admin's three amounts against THIS order's
    // ceilings, throwing the French RefundPlanError message the admin sees when
    // out of bounds or when the total is zero.
    let plan;
    try {
      plan = refundPlan(input, row);
    } catch (e: unknown) {
      if (e instanceof RefundPlanError) {
        throw new AppException('UNPROCESSABLE_ENTITY', e.message);
      }
      throw e;
    }

    // F7: Log when reverseFirst is false but a transfer id exists - money is with
    // the réparateur un-clawed because we cannot account for the amount.
    if (!plan.reverseFirst && row.stripeTransferId) {
      console.error(
        '[refund] commande %s has transfer %s but no recorded transferredCents - cannot claw back',
        commandeId,
        row.stripeTransferId,
      );
    }

    // CF4-D step 3 (spec §3, D3). Payability BEFORE any Stripe write: a client
    // refund whose share cannot be paid is money we cannot get back. Only when the
    // plan actually needs a transfer.
    let destination: string | null = null;
    if (plan.needsPayabilityCheck) {
      destination = await this.assertRepairerPayable(row.repairerUserId, row.repairer.banned ?? false);
    }

    // REVERSAL FIRST, persisted the moment it succeeds. An idempotency key is a
    // convenience for a same-hour retry; the recorded id is the durable guard -
    // the same reasoning that puts `stripeTransferId @unique` on the transfer
    // side. Stripe's "up to the unreversed amount remaining" check combined with
    // the arithmetic accident that we always reverse the full amount means a
    // second attempt past 24 hours is refused rather than double-debiting, but
    // that manifests as a recorded clawback failure when it actually succeeded.
    let reversalId: string | null = row.stripeTransferReversalId;
    let attemptedReversal = false;
    if (plan.reverseFirst && row.stripeTransferId && !reversalId) {
      attemptedReversal = true;
      reversalId = await paymentsGateway()
        .reverseTransfer(
          { transferId: row.stripeTransferId, amountCents: plan.reverseCents },
          `reverse:${commandeId}`,
        )
        .then((r) => r.id)
        .catch((e: unknown) => {
          console.error(
            '[refund] clawback failed for commande %s - the money is with the réparateur',
            commandeId,
            e,
          );
          return null;
        });

      // Persist it immediately, before attempting the refund. The state - clawed
      // back, not yet refunded - is truthful and is what an operator needs to see.
      // A refund that throws here leaves the row PAID with reversalId set, so a
      // retry performs only the refund. Stripe refuses a reversal once the funds
      // have left the réparateur's balance (designed-for, not exceptional), so
      // the failure is recorded by reversalId staying null on a REFUNDED row,
      // which is what J5 looks for.
      if (reversalId) {
        await this.prisma.commande.update({
          where: { id: commandeId },
          data: { stripeTransferReversalId: reversalId, reversedCents: plan.reverseCents },
        });
      }
    }

    // F2a: Re-read immediately before createRefund and re-plan if a concurrent
    // release has committed. releaseInternal has three Stripe round-trips between
    // its read and its write, so this window is real. Fires ONLY when we did not
    // already try a reversal AND the first read saw no transfer at all - a
    // transfer that was present when we planned and whose clawback failed must
    // NOT be retried here (that failure is a recorded outcome, and the null
    // reversal id is what the operator's list reads), and NEITHER must a transfer
    // the first read already saw and legitimately decided not to reverse (CF4-D:
    // X=0 already-paid keeps the réparateur's money, `reverseFirst` is correctly
    // false, and this is not a concurrent release - it is the same row).
    // Invariant: at most ONE reverseTransfer call per refund() invocation.
    //
    // CF4-D step 5 (spec §3). A release landing in this window means the plan we
    // built from the first read is now stale (it saw no transfer at all) - re-plan
    // against the fresh transfer state so the reversal, if any, and the (now
    // necessarily zero) share transfer both match what actually happened.
    const fresh = await this.prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
      select: { stripeTransferId: true, transferredCents: true, stripeTransferReversalId: true },
    });
    if (
      !attemptedReversal &&
      !row.stripeTransferId &&
      fresh.stripeTransferId &&
      fresh.transferredCents &&
      !fresh.stripeTransferReversalId
    ) {
      // A transfer landed between our first read and now, and no reversal has been
      // recorded. Re-plan against the fresh transfer state (its transferCents is
      // necessarily 0: the réparateur is now already paid). Only reverse when the
      // re-plan actually calls for it - of the RE-PLANNED reverseCents, not the
      // full transferred amount: the admin may still be choosing to leave the
      // réparateur his share (X < the full repair), same as any other
      // already-paid case.
      plan = refundPlan(input, { ...row, ...fresh });

      if (plan.reverseFirst) {
        reversalId = await paymentsGateway()
          .reverseTransfer(
            { transferId: fresh.stripeTransferId, amountCents: plan.reverseCents },
            `reverse:${commandeId}`,
          )
          .then((r) => r.id)
          .catch((e: unknown) => {
            console.error(
              '[refund] clawback failed for commande %s - the money is with the réparateur',
              commandeId,
              e,
            );
            return null;
          });
        if (reversalId) {
          await this.prisma.commande.update({
            where: { id: commandeId },
            data: { stripeTransferReversalId: reversalId, reversedCents: plan.reverseCents },
          });
        }
      }
    }

    // F1: The refund itself DOES throw on failure: a refund that did not happen
    // must not leave a row claiming the client was repaid.
    //
    // F1 + final-review C1. Two different situations leave a PAID row carrying a
    // stripeRefundId, and they need OPPOSITE remedies:
    //   - the refund succeeded or is pending and the transaction below failed:
    //     finish the job, and do NOT refund a second time;
    //   - the refund FAILED and `refund.updated` put the row back to PAID while
    //     keeping the id: no money moved, so refund again.
    // The two states are byte-identical in the row, so ask Stripe - the same
    // reasoning that makes releaseInternal read the connected account FROM
    // STRIPE rather than from a row that is only as fresh as the last webhook.
    let refundId: string | null = null;
    let refundStatus: 'succeeded' | 'pending' | 'requires_action' = 'succeeded';
    if (row.stripeRefundId) {
      const existing = await paymentsGateway()
        .retrieveRefund(row.stripeRefundId)
        .catch((e: unknown) => {
          // Refuse rather than refund blind. A second refund against a charge
          // that was already refunded is money we cannot get back.
          console.error(
            '[refund] could not read refund %s for commande %s',
            row.stripeRefundId,
            commandeId,
            e,
          );
          throw new AppException('UNPROCESSABLE_ENTITY', REFUND_FAILED);
        });

      if (existing.status === 'failed' || existing.status === 'canceled') {
        console.error(
          '[refund] recorded refund %s for commande %s is %s - no money moved, creating a new refund',
          row.stripeRefundId,
          commandeId,
          existing.status,
        );
      } else {
        // succeeded or pending: the refund is real and the client's money is on
        // its way back. requires_action lands here too, and there the money has
        // NOT moved and may never - but a second refund is still the wrong
        // answer, because the first is live at Stripe and can still complete.
        // So finish the disposition and let `refund.updated` un-do it if Stripe
        // cancels, which is the same treatment the createRefund path below has
        // always given requires_action.
        refundId = row.stripeRefundId;
        refundStatus = existing.status;
      }
    }

    if (!refundId) {
      // A distinct idempotency key when replacing a failed refund: keys live 24
      // hours, so reusing `refund:<id>` would replay the SAME failed refund
      // object and guarantee the retry fails too. Derived from the failed id so
      // it is deterministic - retrying the retry replays correctly.
      const idempotencyKey = row.stripeRefundId
        ? `refund:${commandeId}:after:${row.stripeRefundId}`
        : `refund:${commandeId}`;
      const refund = await paymentsGateway()
        .createRefund(
          { chargeId: row.stripeChargeId, amountCents: plan.refundCents },
          idempotencyKey,
        )
        .catch((e: unknown) => {
          console.error('[refund] refund failed for commande', commandeId, e);
          throw new AppException('UNPROCESSABLE_ENTITY', REFUND_FAILED);
        });

      // A refund that Stripe reports as failed or canceled did NOT happen - no
      // money moved. Log it loudly and throw, leaving the row PAID. The
      // distinction is that 'pending' means the refund WAS created and will settle
      // later, while 'failed' means Stripe refused it. See the P5 spec §7.
      if (refund.status === 'failed' || refund.status === 'canceled') {
        console.error(
          '[refund] Stripe reported refund %s as %s for commande %s - no money moved',
          refund.id,
          refund.status,
          commandeId,
        );
        // F6: Distinct message with no retry promise, because a retry inside 24h
        // replays the same failed refund object and is guaranteed to fail again.
        throw new AppException('UNPROCESSABLE_ENTITY', REFUND_REJECTED);
      }

      refundId = refund.id;
      refundStatus = refund.status;

      if (row.stripeRefundId) {
        // Both ids in one line, because the write below drops the old one from the
        // row and this log is then the only place the pair appears together.
        console.error(
          '[refund] commande %s: replacing failed refund %s with %s',
          commandeId,
          row.stripeRefundId,
          refundId,
        );
      }

      // F1: Persist immediately, before the transaction. Stripe idempotency keys
      // expire after 24 hours, so the recorded id is what carries the guard past
      // that window - but since C1 the id alone no longer decides anything. It is
      // the id PLUS Stripe's verdict on it that stops a second refund, because a
      // FAILED refund's id must not suppress a retry. That is the one way this
      // differs from stripeTransferId, which needs no verdict.
      //
      // On the replacement path this OVERWRITES a failed refund's id, dropping it
      // from the row. Deliberate: Stripe holds the charge's full refund history, so
      // traceability lives with the authority rather than with us, and the
      // "replacing failed refund" line just above names both ids.
      await this.prisma.commande.update({
        where: { id: commandeId },
        data: { stripeRefundId: refundId },
      });
    }

    // F2b: One transaction for both writes, but as a CAS, because a concurrent
    // release can commit between our re-read and here. Partially applied, a client
    // would have his money back against a demande still reading IN_PROGRESS, so he
    // could neither proceed nor start again.
    //
    // `status: 'PAID'` alone CANNOT detect that release: a release writes `step`,
    // `releasedAt`, `stripeTransferId` and `transferredCents`, and leaves `status`
    // at `PAID`. On its own it detects only a concurrent second refund. Pinning
    // `stripeTransferId` to the value the F2a re-read observed is what makes a
    // release detectable - nothing but a release writes that column, so there is no
    // benign write to trip over.
    //
    // CF4-D step 7 (spec §1, §4). Also writes the breakdown and motif this refund
    // decided on, so both the operator's own record and every reader downstream
    // (attention list, mobile payment card, admin summary) see exactly what moved.
    const written = await this.prisma.$transaction([
      this.prisma.commande.updateMany({
        where: {
          id: commandeId,
          status: 'PAID',
          stripeTransferId: fresh.stripeTransferId,
          // CF4-I (Review Focus 1, whole-branch review fix pass). Only for
          // `approve()`: closes the TOCTOU window against a client withdrawing between
          // approve's own PENDING pre-check and this write. A withdrawn/already-decided
          // request has cleared the flag, so this condition alone makes the CAS lose
          // (count 0 below, the existing `STATE_CHANGED` refusal) instead of refunding a
          // request that no longer exists. Absent for every other caller.
          ...(requirePendingCancellation ? { cancellationRequestedAt: { not: null } } : {}),
        },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedCents: plan.refundCents,
          refundedByUserId: adminUserId,
          refundReason: input.note,
          refundRepairCents: input.repairCents,
          refundShippingCents: input.shippingCents,
          refundProtectionCents: input.protectionCents,
          refundMotif: input.motif,
          // CF4-I (spec §4.2, Review Focus 1, 2). A refund from « Remboursement » closes any
          // pending cancellation request the same way approving it would - the request ends
          // APPROVED and the flag clears in this SAME transaction, never a REFUNDED order
          // still reading « Annulation demandée ». Index 0 stays the commande CAS.
          cancellationRequestedAt: null,
          // B11: A refunded order is terminally resolved, so disputedAt is cleared.
          disputedAt: null,
        },
      }),
      // CANCELLED already exists, nothing else writes it, and mobile already
      // renders it as « Annulée » with a neutral badge - so this closes the loop
      // with no new enum member and no new mobile state. The OFFER is left
      // ACCEPTED: it was accepted, and rewriting it to REJECTED would tell a
      // réparateur he lost a bid he won and would reopen the ACCEPTED/REJECTED
      // cluster already in the backlog. See the P5 spec §6.3.
      this.prisma.demande.update({
        where: { id: row.demandeId },
        data: { status: 'CANCELLED' },
      }),
      // CF4-I. A no-op (0 rows) when no request was pending on this commande.
      closePendingCancellation(this.prisma, commandeId, 'APPROVED', adminUserId),
      // B11: a refund settles the dispute still open on this commande. A dispute already closed
      // keeps how it was closed; the admin surfaces derive « refunded » for it instead.
      this.prisma.dispute.updateMany({
        where: { commandeId, status: { in: ['OPEN', 'IN_REVIEW'] } },
        data: {
          status: 'RESOLVED_REFUNDED',
          resolvedByUserId: adminUserId,
          resolvedAt: new Date(),
          verdict: plan.refundCents === row.totalCents ? 'REFUND_CLIENT' : 'PARTIAL_REFUND',
          resolutionNote: input.note,
        },
      }),
    ]);

    // F2b: The row moved under us. Either a release committed and recorded a
    // transfer id the re-read did not see, or a concurrent refund already took the
    // row out of PAID. Log loudly and throw rather than reporting success. Any
    // residual leaves a row that is detectably wrong instead of silently lossy.
    if (written[0].count === 0) {
      console.error(
        '[refund] commande %s did not match on status PAID + transfer %s - concurrent release or concurrent refund?',
        commandeId,
        fresh.stripeTransferId,
      );
      throw new AppException('UNPROCESSABLE_ENTITY', "La commande a déjà changé d'état.");
    }

    // Livraison Boxtal (spec §8.7). After the money has moved, before the notifications. Never
    // throws; a label Boxtal will not release is mailed to ops and the refund stands.
    await this.shipments.cancelUnshipped(commandeId);

    // CF4-D step 9 (spec §3, D2-D3). The réparateur's unrefunded share, only when
    // the plan called for a transfer AND the refund actually succeeded - a pending
    // or requires_action refund has not moved the client's money yet, so paying
    // the réparateur first would leave him paid against a refund that could still
    // fail. Wrapped so a transfer failure (or a non-succeeded refund) NEVER
    // escapes refund() once the refund itself is disposed of: the refund already
    // stands, and the share becomes ops's job (spec §3's owed-share table).
    if (plan.transferCents > 0) {
      if (refundStatus !== 'succeeded') {
        console.error(
          '[refund] commande %s: refund is %s, not succeeded - the réparateur share stays owed',
          commandeId,
          refundStatus,
        );
        await sendRefundShareOpsMail({
          commandeId,
          demandeTitle: row.demande.title,
          shareCents: plan.transferCents,
          reason: 'remboursement en attente chez Stripe',
        }).catch(() => undefined);
      } else if (destination) {
        try {
          const transfer = await paymentsGateway().createTransfer(
            {
              amountCents: plan.transferCents,
              destination,
              sourceTransaction: row.stripeChargeId,
              transferGroup: commandeId,
            },
            `refund-share:${commandeId}`,
          );
          // Written AFTER the CAS transaction, same reasoning as the CAS itself:
          // the refund already stands, so this write is best-effort and must
          // never make a successful refund look like it failed.
          await this.prisma.commande.updateMany({
            where: { id: commandeId, stripeTransferId: null },
            data: {
              stripeTransferId: transfer.id,
              transferredCents: plan.transferCents,
              transferredAt: new Date(),
            },
          });
        } catch (e: unknown) {
          console.error(
            '[refund] commande %s: transfer of the réparateur share failed - the share stays owed',
            commandeId,
            e,
          );
          await sendRefundShareOpsMail({
            commandeId,
            demandeTitle: row.demande.title,
            shareCents: plan.transferCents,
            reason: 'transfert échoué',
          }).catch(() => undefined);
        }
      }
    }

    // CF4-16/CF4-29 (spec §3.2). System-message announce, after the DB write commits and
    // before the COMMANDE_REFUNDED notification loop below - RefundService keeps emitting
    // COMMANDE_REFUNDED itself; `announce` only posts the conversation line (no second
    // notification pair for 'REFUNDED' / 'DISPUTE_REFUNDED'). CF4-D: the partial amount, or
    // null on a full refund, so the system line matches what the notifications say below.
    await this.announcer.announce(
      commandeId,
      announce,
      plan.refundCents < row.totalCents ? plan.refundCents : null,
    );

    // CLIENT: unchanged - always COMMANDE_REFUNDED for the full amount moved off
    // the platform, whether or not it was a partial refund.
    await this.notifications.emit({
      userId: row.clientUserId,
      mode: 'CLIENT',
      type: 'COMMANDE_REFUNDED',
      amountCents: plan.refundCents,
      subject: row.demande.title,
      commandeId: row.id,
    });

    // RÉPARATEUR: CF4-D / D7. A full refund of the repair (nothing left owed to
    // him) reads exactly as today - COMMANDE_REFUNDED. Anything less is the new,
    // honest COMMANDE_PARTIALLY_REFUNDED, naming what he keeps or is still owed
    // (repair − X) rather than reusing a type whose existing rows mean "the
    // client's total", which a partial-amount rule would misrepresent.
    if (input.repairCents < row.repairCents) {
      await this.notifications.emit({
        userId: row.repairerUserId,
        mode: 'REPAIRER',
        type: 'COMMANDE_PARTIALLY_REFUNDED',
        amountCents: row.repairCents - input.repairCents,
        subject: row.demande.title,
        commandeId: row.id,
      });
    } else {
      await this.notifications.emit({
        userId: row.repairerUserId,
        mode: 'REPAIRER',
        type: 'COMMANDE_REFUNDED',
        amountCents: plan.refundCents,
        subject: row.demande.title,
        commandeId: row.id,
      });
    }

    return { refundCents: plan.refundCents, totalCents: row.totalCents };
  }

  /**
   * CF4-D task 5 (spec §3, §7). The operator's retry for the ops-mail cases
   * `refund()` above already logs: a réparateur share that stayed owed because the
   * refund had not yet settled, or because the share transfer itself failed. Reads
   * the row fresh each call rather than trusting a stale mail - `shareOwedCents` is
   * derived from the SAME columns `refund()` writes, so this refuses correctly the
   * moment either a prior retry already succeeded (`stripeTransferId` set) or the
   * order never carried a breakdown to begin with.
   *
   * Order of checks matters and mirrors `refund()`: the share amount is decided
   * before any Stripe call, `retrieveRefund` confirms the client's money actually
   * moved (a `pending`/`requires_action` refund must not pay the réparateur first -
   * same reasoning as `plan.transferCents` in `refund()`), THEN payability, THEN the
   * transfer. `createTransfer` reuses `refund-share:<id>` - the exact key `refund()`
   * used for this same commande - so a retry after a lost response replays the
   * original Stripe object rather than creating a second, real payout.
   */
  async payShare(adminUserId: string, commandeId: string): Promise<{ transferredCents: number }> {
    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      select: {
        id: true,
        status: true,
        repairCents: true,
        refundRepairCents: true,
        stripeTransferId: true,
        stripeChargeId: true,
        stripeRefundId: true,
        repairerUserId: true,
        repairer: { select: { banned: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    const owedCents = shareOwedCents(row);
    if (owedCents <= 0) {
      throw new AppException('UNPROCESSABLE_ENTITY', NO_SHARE_OWED);
    }

    // Live Stripe check, not the row: `stripeRefundId` is set the moment `refund()`
    // creates the refund, before Stripe has necessarily settled it - the same
    // "ask Stripe, not the row" reasoning `refund()` itself uses for
    // `assertRepairerPayable`.
    const refundStatus = await paymentsGateway()
      .retrieveRefund(row.stripeRefundId!)
      .catch((e: unknown) => {
        console.error('[refund] payShare: could not read refund %s for commande %s', row.stripeRefundId, commandeId, e);
        throw new AppException('UNPROCESSABLE_ENTITY', REFUND_NOT_CONFIRMED);
      });
    if (refundStatus.status !== 'succeeded') {
      throw new AppException('UNPROCESSABLE_ENTITY', REFUND_NOT_CONFIRMED);
    }

    const destination = await this.assertRepairerPayable(row.repairerUserId, row.repairer.banned ?? false);

    // Same idempotency key as `refund()`'s share transfer for this commande, so a
    // retry after a lost response replays rather than double-pays the réparateur.
    const transfer = await paymentsGateway()
      .createTransfer(
        {
          amountCents: owedCents,
          destination,
          sourceTransaction: row.stripeChargeId!,
          transferGroup: commandeId,
        },
        `refund-share:${commandeId}`,
      )
      .catch((e: unknown) => {
        console.error('[refund] payShare: transfer of the réparateur share failed for commande %s', commandeId, e);
        throw new AppException('UNPROCESSABLE_ENTITY', SHARE_TRANSFER_FAILED);
      });

    // CAS, same shape as `refund()`'s own share-transfer write: a concurrent retry
    // (or a webhook-driven write) may have already set `stripeTransferId` between
    // our read and here.
    const written = await this.prisma.commande.updateMany({
      where: { id: commandeId, stripeTransferId: null },
      data: { stripeTransferId: transfer.id, transferredCents: owedCents, transferredAt: new Date() },
    });
    if (written.count === 0) {
      console.error(
        '[refund] payShare: commande %s did not match on stripeTransferId null - concurrent write?',
        commandeId,
      );
      throw new AppException('UNPROCESSABLE_ENTITY', STATE_CHANGED);
    }

    return { transferredCents: owedCents };
  }
}
