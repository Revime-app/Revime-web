import { Injectable } from '@nestjs/common';
import type {
  AdminAttentionItem,
  AttentionReason,
  CronJobResult,
  CronRunResponse,
} from '@revime/shared';
import { ATTENTION_UNDISMISSABLE_REASONS, VALIDATION_WINDOW_DAYS } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { CommandesService } from '../commandes/commandes.service.js';
import {
  PaymentsService,
  SESSION_TTL_SECONDS,
} from '../payments/payments.service.js';
import { STALE_UNSTARTED_PAYMENT_AFTER_MS, staleUnstartedPaymentWhere } from '../payments/stale-payment.js';
import { paymentsGateway } from '../payments/gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { ShipmentsService } from '../shipping/shipments.service.js';
import { UsersService } from '../users/users.service.js';
import type { DisputeStatus } from '../generated/prisma/enums.js';
import { QuoteRequestsService } from '../quote-requests/quote-requests.service.js';
import { storageGateway, isStorageConfigured } from '../storage/gateway.js';
import { PHOTO_BUCKET } from '../storage/photo-paths.js';
import { shouldPurge } from './photo-orphans.js';
import { sendAttentionMail } from './attention-mail.js';
import { shipmentAttentionItems } from './shipment-attention.js';
import { reversalExpected, shareOwedCents } from '../commandes/refund-plan.js';
import { FiscalService } from '../fiscal/fiscal.service.js';
import { identityGateway } from '../identity/gateway.js';
import { SetupRemindersService } from '../setup/setup-reminders.service.js';
import { ensureReviewAccounts } from '../review-accounts/ensure-review-accounts.js';

/** Money still owed: these dossiers stay in the queue after the order is settled. */
const MONEY_OWED_REASONS: ReadonlySet<AttentionReason> = new Set(['SHARE_OWED', 'REVERSAL_FAILED']);

/** Disputes that are over: the dossier is settled and leaves the queue. */
const SETTLED_DISPUTE_STATUSES: ReadonlySet<string> = new Set<DisputeStatus>([
  'RESOLVED_REFUNDED',
  'RESOLVED_RELEASED',
  'RESOLVED_DISMISSED',
]);

@Injectable()
export class CronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandes: CommandesService,
    private readonly payments: PaymentsService,
    private readonly shipments: ShipmentsService,
    private readonly push: PushService,
    private readonly users: UsersService,
    private readonly quoteRequests: QuoteRequestsService,
    private readonly fiscal: FiscalService,
    // V8 E1. Last, so the constructor's existing positions stay where the hand-rolled specs pass them.
    private readonly setupReminders: SetupRemindersService,
  ) {}

  async run(): Promise<CronRunResponse> {
    // Sequential and each wrapped, so one job's failure cannot hide another's
    // result. The response is the only place a partial run is visible.
    return {
      jobs: [
        await this.guard('autoRelease', () => this.autoRelease()),
        // J2 is deliberately not a job at all: it is the existing-transfer
        // precondition already living inside `releaseInternal` (Task 6). P3's
        // stranded-release query selects the SAME rows J1 acts on, so running them
        // as two jobs would be a race whose losing outcome is a second real
        // transfer - paying a réparateur twice. Task 6 closed it structurally.
        await this.guard('backfillChargeIds', () => this.backfillChargeIds()),
        await this.guard('settleOrphanSessions', () =>
          this.settleOrphanSessions(),
        ),
        await this.guard('attention', () => this.attention()),
        await this.guard('purgeOrphanPhotos', () => this.purgeOrphanPhotos()),
        // Livraison Boxtal (spec §8.4): labels a webhook missed, tracking gone quiet for a day.
        await this.guard('shipmentSweep', () => this.shipments.sweep()),
        // CF-44 (spec §8): push receipts - dead tokens disabled, InvalidCredentials counted as failed.
        await this.guard('pushReceipts', () => this.push.receipts()),
        // GDPR Pre-Launch Item 7: 2-year inactive account cleanup
        await this.guard('purgeInactiveAccounts', () =>
          this.purgeInactiveAccounts(),
        ),
        // GDPR Pre-Launch Item 7: Log purging (1-year retention)
        await this.guard('purgeOldLogs', () => this.purgeOldLogs()),
        // CF4-25: private quote requests unanswered after 7 days.
        await this.guard('expireQuoteRequests', () =>
          this.expireQuoteRequests(),
        ),
        // Bug B13: erasures stuck in PROCESSING are settled from Stripe's own report
        await this.guard('settlePendingErasures', () =>
          this.settlePendingErasures(),
        ),
        // CMP-D3: DAC7 fiscal reminders sweep
        await this.guard('fiscalReminders', () => this.fiscalReminders()),
        // V8 E1: the 3- and 8-day « finish your setup » reminders (daytime in Paris only, each sent once).
        await this.guard('setupReminders', () => this.setupReminders.sweep()),
        // CMP-D3: retries the payouts held for missing fiscal information or an inactive account.
        // Not a second release path: it selects RELEASED rows with no transfer, never J1's
        // AWAITING_VALIDATION rows, and shares the double-pay guards of the triggered call.
        await this.guard('heldPayouts', () => this.commandes.payoutHeldCommandes()),
        // PUB-33 (DECP-23): the two store-review accounts back to their starting point. Last, so a
        // failure here (a missing password on Render) can never delay a money job.
        await this.guard('ensureReviewAccounts', () => ensureReviewAccounts(this.prisma)),
      ],
    };
  }

  /** CMP-D3. Public so its delegation is testable. */
  async fiscalReminders() {
    const result = await this.fiscal.sendFiscalReminders();
    return {
      scanned: result.scanned,
      acted: result.reminded1 + result.reminded2,
      failed: result.failed,
    };
  }

  /** CF4-25. Public so its delegation is testable without running every other job. */
  async expireQuoteRequests() {
    return this.quoteRequests.expireDue();
  }

  private async guard(
    job: string,
    body: () => Promise<Omit<CronJobResult, 'job' | 'error'>>,
  ): Promise<CronJobResult> {
    try {
      return { job, error: null, ...(await body()) };
    } catch (e: unknown) {
      console.error('[cron] job %s threw', job, e);
      return {
        job,
        scanned: 0,
        acted: 0,
        failed: 0,
        error: e instanceof Error ? e.message : 'unknown',
      };
    }
  }

  private async autoRelease() {
    // Computed in JavaScript from VALIDATION_WINDOW_DAYS, never a hard-coded
    // `interval '7 days'` - which would be a second copy of that constant and the
    // exact drift `computeAmounts` exists to prevent on the other side of the
    // ledger.
    const cutoff = new Date(Date.now() - VALIDATION_WINDOW_DAYS * 86_400_000);
    const due = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        // Belt-and-braces, kept for self-documentation: `releaseRequestedAt` is
        // stamped only when advancing to AWAITING_VALIDATION, the step can only
        // move to RELEASED (which sets `stripeTransferId`), and a refund sets
        // `status: 'REFUNDED'`. So non-null `releaseRequestedAt` + `PAID` + no
        // transfer already implies this step. The filter is redundant and cannot be
        // tested without constructing a state the application cannot produce.
        step: 'AWAITING_VALIDATION',
        releaseRequestedAt: { lte: cutoff },
        stripeTransferId: null,
        // Load-bearing, not defensive: releasing while a chargeback is open pays
        // the réparateur out of money that is being taken back - a double loss.
        disputedAt: null,
        // C-1: Exclude rows carrying either refund id. `refund.service.ts` persists
        // `stripeRefundId` BEFORE the $transaction that flips status to REFUNDED, so
        // a failed transaction leaves status PAID + refundId SET + all criteria met.
        //
        // A refund id does NOT prove the client was repaid - `syncRefundState` puts
        // a FAILED refund's row back to PAID and keeps the id for traceability, and
        // telling those two states apart needs Stripe, which `releaseInternal` now
        // does. This job deliberately does not: the cron must not pay a réparateur
        // on a row an operator tried to refund, whichever state it is in. A human
        // decides, and J5's REFUND_INCOMPLETE is what puts the row in front of one.
        // Where the client's money DID go back, what stops a double payment is also
        // not our code: Stripe refuses a source_transaction transfer on a
        // fully-refunded charge. That disappears the day partial refunds exist.
        stripeRefundId: null,
        stripeTransferReversalId: null,
        // CF4-27 (spec §4.3). A pending cancellation freezes auto-release exactly as it
        // freezes a hand release - same reasoning `releaseInternal`'s own guard states.
        cancellationRequestedAt: null,
      },
      select: { id: true },
    });

    let acted = 0;
    let failed = 0;
    for (const { id } of due) {
      // Each row in its own try/catch. One réparateur with a stale connected
      // account must not stall every other release in the batch.
      try {
        const outcome = await this.commandes.releaseInternal(id);
        if (outcome === 'released' || outcome === 'healed') acted += 1;
      } catch (e: unknown) {
        if (e instanceof AppException) {
          console.warn(
            '[cron] auto-release refused for commande %s: %s',
            id,
            e.message,
          );
        } else {
          failed += 1;
          console.error('[cron] auto-release failed for commande %s', id, e);
        }
      }
    }

    // M-6: A misconfigured environment (PAYMENTS_ENABLED or CONNECT_ENABLED off)
    // yields skipped releases, which read as { scanned: N, acted: 0, failed: 0 }
    // - a healthy idle run, while no money ever moves. Log once when this pattern
    // appears so the operator knows the likely cause.
    if (due.length > 0 && acted === 0 && failed === 0) {
      console.warn(
        '[cron] %d due rows found but 0 acted and 0 failed - likely cause: PAYMENTS_ENABLED or CONNECT_ENABLED is off',
        due.length,
      );
    }

    return { scanned: due.length, acted, failed };
  }

  private async backfillChargeIds() {
    // Only scan rows that CAN be backfilled: they must have a Stripe session or payment intent to
    // retrieve. Rows with status=PAID but stripeSessionId=null and stripePaymentIntentId=null are legacy test
    // data that will never be resolvable — scanning them every 6 hours produces
    // permanent CI failures for no gain. The attention job surfaces them anyway.
    const rows = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        stripeChargeId: null,
        OR: [
          { stripeSessionId: { not: null } },
          { stripePaymentIntentId: { not: null } },
        ],
      },
      select: { id: true, stripeSessionId: true, stripePaymentIntentId: true },
    });

    let acted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        let chargeId: string | null = null;
        if (row.stripePaymentIntentId) {
          const intent = await paymentsGateway().retrievePaymentIntent(
            row.stripePaymentIntentId,
          );
          chargeId = intent.chargeId;
        } else if (row.stripeSessionId) {
          const session = await paymentsGateway().retrieveCheckoutSession(
            row.stripeSessionId,
          );
          chargeId = session.chargeId;
        }

        if (chargeId) {
          await this.prisma.commande.update({
            where: { id: row.id },
            data: { stripeChargeId: chargeId },
          });
          acted += 1;
        } else {
          // The session/intent exists but has no charge. Such a row is permanently
          // unreleasable - release refuses it, and the PAID early return means no
          // webhook redelivery will ever backfill it. Count it as failed so the
          // attention job surfaces it.
          failed += 1;
          console.error(
            '[cron] session/intent %s for commande %s has no charge id',
            row.stripePaymentIntentId ?? row.stripeSessionId,
            row.id,
          );
        }
      } catch (e: unknown) {
        failed += 1;
        console.error(
          '[cron] failed to backfill charge id for commande %s',
          row.id,
          e,
        );
      }
    }
    return { scanned: rows.length, acted, failed };
  }

  private async settleOrphanSessions() {
    // A session or payment intent older than the 1-hour TTL and still PENDING_PAYMENT. This closes
    // the hole PROJECT_ROADMAP.md names as the catastrophe of flipping
    // PAYMENTS_ENABLED: a real card charged, webhook never
    // arriving, and the row stuck forever.
    const cutoff = new Date(Date.now() - SESSION_TTL_SECONDS * 1000);
    const rows = await this.prisma.commande.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        createdAt: { lt: cutoff },
        OR: [
          { stripeSessionId: { not: null } },
          { stripePaymentIntentId: { not: null } },
        ],
      },
      select: { id: true, stripeSessionId: true, stripePaymentIntentId: true },
    });

    let acted = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.stripePaymentIntentId) {
        try {
          const intent = await paymentsGateway().retrievePaymentIntent(
            row.stripePaymentIntentId,
          );

          if (intent.status === 'succeeded') {
            await this.payments.completeByPaymentIntent(
              row.stripePaymentIntentId,
              intent.chargeId ?? undefined,
            );
            acted += 1;
          } else if (intent.status === 'canceled') {
            await this.payments.abandonByPaymentIntentId(
              row.stripePaymentIntentId,
            );
            acted += 1;
          }
          // else: still open (requires_payment_method, etc.). Leave it alone.
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '';
          if (
            msg.includes('No such payment_intent') ||
            msg.includes('No such fake payment intent')
          ) {
            console.warn(
              '[cron] orphan payment intent %s does not exist on Stripe, abandoning commande %s',
              row.stripePaymentIntentId,
              row.id,
            );
            try {
              await this.payments.abandonByPaymentIntentId(
                row.stripePaymentIntentId,
              );
              acted += 1;
              continue;
            } catch (abandonErr) {
              console.error(
                '[cron] failed to abandon missing payment intent for commande %s',
                row.id,
                abandonErr,
              );
            }
          }
          failed += 1;
          console.error(
            '[cron] failed to settle orphan payment intent for commande %s',
            row.id,
            e,
          );
        }
        continue;
      }

      if (!row.stripeSessionId) continue;

      try {
        const session = await paymentsGateway().retrieveCheckoutSession(
          row.stripeSessionId,
        );

        if (session.status === 'complete') {
          // A real card charged and the webhook never arrived. No StripeEvent claim
          // protects this path because there is no event - but the accept
          // transaction carries its own idempotency layer (`status !==
          // 'PENDING_PAYMENT'`), so racing a late webhook is safe.
          await this.payments.completeBySessionId(row.stripeSessionId);
          acted += 1;
        } else if (session.status === 'expired') {
          await this.payments.abandonBySessionId(row.stripeSessionId);
          acted += 1;
        }
        // else: still open. Leave it alone and do not count as failed - the user
        // has not finished paying, which is not a fault.
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (
          msg.includes('No such checkout.session') ||
          msg.includes('No such fake session')
        ) {
          console.warn(
            '[cron] orphan session %s does not exist on Stripe, abandoning commande %s',
            row.stripeSessionId,
            row.id,
          );
          try {
            await this.payments.abandonBySessionId(row.stripeSessionId);
            acted += 1;
            continue;
          } catch (abandonErr) {
            console.error(
              '[cron] failed to abandon missing session for commande %s',
              row.id,
              abandonErr,
            );
          }
        }
        failed += 1;
        console.error(
          '[cron] failed to settle orphan session for commande %s',
          row.id,
          e,
        );
      }
    }

    // P11, « abandon automatique »: a checkout nobody started has no Stripe object to settle.
    const unstarted = await this.prisma.commande.updateMany({
      where: staleUnstartedPaymentWhere(),
      data: { status: 'ABANDONED' },
    });
    acted += unstarted.count;

    return { scanned: rows.length + unstarted.count, acted, failed };
  }

  private async attention() {
    const items = await this.attentionItems();
    await sendAttentionMail(items);
    return { scanned: items.length, acted: 0, failed: 0 };
  }

  /**
   * Task 11's admin endpoint reuses this. Five reasons, all derived - no column
   * records "needs attention", which would be a second representation of state
   * these rows already carry.
   */
  /**
   * P15: Commandes à surveiller. Groups anomalies by order, excludes settled dossiers,
   * includes parcel anomalies and pending payments >24h, and filters out anomalies
   * dismissed via AdminAuditLog within 7 days.
   */
  async attentionItems(): Promise<AdminAttentionItem[]> {
    const now = new Date();
    const rawAnomalies: Array<{
      commandeId: string;
      demandeTitle: string;
      clientName?: string;
      repairerName?: string;
      reason: AttentionReason;
      status: string;
      step: string | null;
      totalCents: number;
      since: string;
      stripePaymentIntentId?: string | null;
      stripeSessionId?: string | null;
      disputeStatus?: string | null;
    }> = [];

    // CF4-27 (spec §4.3). CANCELLATION_REQUESTED, listed FIRST: a client waiting on REVIME's
    // decision is the most time-sensitive item on this list. `since` is when the request was
    // made (`cancellationRequestedAt`), not when it was noticed.
    const cancelling = await this.prisma.commande.findMany({
      where: {
        cancellationRequestedAt: { not: null },
        status: { notIn: ['REFUNDED', 'ABANDONED'] },
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        cancellationRequestedAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of cancelling) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'CANCELLATION_REQUESTED',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.cancellationRequestedAt!.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // STALLED: `autoReleaseDueAt` has passed and the step is earlier than
    // `AWAITING_VALIDATION`. Auto-releasing a commande whose réparateur never
    // finished pays for work not done - worse than the stall. It is a human's call.
    const stalled = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        autoReleaseDueAt: { lte: now },
        step: { notIn: ['AWAITING_VALIDATION', 'RELEASED'] },
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        autoReleaseDueAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of stalled) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'STALLED',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.autoReleaseDueAt!.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // DISPUTED: `disputedAt` is set on an active (not refunded or abandoned) commande.
    // B12: a terminal order never leaks in under DISPUTED. Refunding clears the flag in the
    // refund transaction; the filter below covers an order whose flag outlived its status.
    const disputed = await this.prisma.commande.findMany({
      where: {
        disputedAt: { not: null },
        status: { notIn: ['REFUNDED', 'ABANDONED'] },
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        disputedAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of disputed) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'DISPUTED',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.disputedAt!.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // CF4-32. DISPUTE_REPLY: in either confidential space of an OPEN / IN_REVIEW
    // dispute, the latest message is PARTY and newer than REVIME's latest there.
    // Clears once REVIME replies or the dispute resolves.
    const activeDisputes = (this.prisma as any).dispute
      ? await this.prisma.dispute.findMany({
          where: {
            status: { in: ['OPEN', 'IN_REVIEW'] },
          },
          select: {
            id: true,
            status: true,
            commande: {
              select: {
                id: true,
                totalCents: true,
                status: true,
                step: true,
                demande: { select: { title: true } },
                client: { select: { name: true } },
                repairer: { select: { name: true } },
              },
            },
            messages: {
              select: {
                space: true,
                author: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        })
      : [];

    for (const d of activeDisputes) {
      let latestPartyReplyDate: Date | null = null;
      for (const space of ['CLIENT', 'REPAIRER'] as const) {
        const spaceMsgs = (d.messages ?? []).filter(
          (m: any) => m.space === space,
        );
        const partyMsgs = spaceMsgs.filter((m: any) => m.author === 'PARTY');
        const revimeMsgs = spaceMsgs.filter((m: any) => m.author === 'REVIME');
        if (partyMsgs.length > 0 && revimeMsgs.length > 0) {
          const latestPartyTime = Math.max(
            ...partyMsgs.map((m: any) => new Date(m.createdAt).getTime()),
          );
          const latestRevimeTime = Math.max(
            ...revimeMsgs.map((m: any) => new Date(m.createdAt).getTime()),
          );
          if (latestPartyTime > latestRevimeTime) {
            if (
              !latestPartyReplyDate ||
              latestPartyTime > latestPartyReplyDate.getTime()
            ) {
              latestPartyReplyDate = new Date(latestPartyTime);
            }
          }
        }
      }
      if (latestPartyReplyDate && d.commande) {
        rawAnomalies.push({
          commandeId: d.commande.id,
          demandeTitle: d.commande.demande?.title ?? 'Commande',
          clientName: d.commande.client?.name,
          repairerName: d.commande.repairer?.name,
          reason: 'DISPUTE_REPLY',
          status: d.commande.status,
          step: d.commande.step,
          totalCents: d.commande.totalCents,
          since: latestPartyReplyDate.toISOString(),
          disputeStatus: d.status,
        });
      }
    }

    // REVERSAL_FAILED: status is `REFUNDED`, a transfer succeeded, but no reversal
    // id - the operator clawed back the platform's money and the réparateur kept
    // his. A failed clawback is what Task 7 records.
    const reversalFailed = (
      await this.prisma.commande.findMany({
        where: {
          status: 'REFUNDED',
          stripeTransferId: { not: null },
          stripeTransferReversalId: null,
        },
        select: {
          id: true,
          totalCents: true,
          status: true,
          step: true,
          refundedAt: true,
          repairCents: true,
          transferredCents: true,
          refundRepairCents: true,
          stripeTransferId: true,
          stripeTransferReversalId: true,
          demande: { select: { title: true } },
          client: { select: { name: true } },
          repairer: { select: { name: true } },
          dispute: { select: { status: true } },
        },
      })
    ).filter(reversalExpected);
    for (const row of reversalFailed) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'REVERSAL_FAILED',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.refundedAt ? new Date(row.refundedAt).toISOString() : now.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // SHARE_OWED: CF4-D task 5 (spec §3, §7). Status `REFUNDED`, no transfer yet,
    // AND a breakdown recorded (`refundRepairCents` not null).
    const shareOwed = (
      await this.prisma.commande.findMany({
        where: {
          status: 'REFUNDED',
          stripeTransferId: null,
          refundRepairCents: { not: null },
        },
        select: {
          id: true,
          totalCents: true,
          status: true,
          step: true,
          refundedAt: true,
          repairCents: true,
          refundRepairCents: true,
          stripeTransferId: true,
          demande: { select: { title: true } },
          client: { select: { name: true } },
          repairer: { select: { name: true } },
          dispute: { select: { status: true } },
        },
      })
    ).filter((row) => shareOwedCents(row) > 0);
    for (const row of shareOwed) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'SHARE_OWED',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.refundedAt ? new Date(row.refundedAt).toISOString() : now.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // CHARGE_MISSING: status is `PAID` but `stripeChargeId` is null.
    const chargeMissing = await this.prisma.commande.findMany({
      where: { status: 'PAID', stripeChargeId: null },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        paidAt: true,
        createdAt: true,
        stripePaymentIntentId: true,
        stripeSessionId: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of chargeMissing) {
      const sinceDate = row.paidAt ?? (row as any).createdAt ?? now;
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'CHARGE_MISSING',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: new Date(sinceDate).toISOString(),
        stripePaymentIntentId: row.stripePaymentIntentId,
        stripeSessionId: row.stripeSessionId,
        disputeStatus: row.dispute?.status,
      });
    }

    // REFUND_INCOMPLETE: a `PAID` row carrying EITHER Stripe id.
    const refundIncomplete = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        OR: [
          { stripeTransferReversalId: { not: null } },
          { stripeRefundId: { not: null } },
        ],
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        paidAt: true,
        createdAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of refundIncomplete) {
      const sinceDate = row.paidAt ?? (row as any).createdAt ?? now;
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'REFUND_INCOMPLETE',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: new Date(sinceDate).toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // RELEASE_FAILING: J1-eligible (PAID, AWAITING_VALIDATION, past cutoff, no
    // transfer, not disputed, not refunded) yet still unreleased.
    const cutoff = new Date(Date.now() - VALIDATION_WINDOW_DAYS * 86_400_000);
    const releaseFailing = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        releaseRequestedAt: { lte: cutoff },
        stripeTransferId: null,
        disputedAt: null,
        stripeRefundId: null,
        stripeTransferReversalId: null,
        stripeChargeId: { not: null },
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        releaseRequestedAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of releaseFailing) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'RELEASE_FAILING',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.releaseRequestedAt ? new Date(row.releaseRequestedAt).toISOString() : now.toISOString(),
        disputeStatus: row.dispute?.status,
      });
    }

    // PAYMENT_PENDING_STALE: orders in PENDING_PAYMENT created > 24 hours ago
    const cutoff24h = new Date(Date.now() - STALE_UNSTARTED_PAYMENT_AFTER_MS);
    const pendingStale = await this.prisma.commande.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        createdAt: { lt: cutoff24h },
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        createdAt: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
      },
    });
    for (const row of pendingStale) {
      rawAnomalies.push({
        commandeId: row.id,
        demandeTitle: row.demande?.title ?? 'Commande',
        clientName: row.client?.name,
        repairerName: row.repairer?.name,
        reason: 'PAYMENT_PENDING_STALE',
        status: row.status,
        step: row.step,
        totalCents: row.totalCents,
        since: row.createdAt.toISOString(),
        stripeSessionId: row.stripeSessionId,
        stripePaymentIntentId: row.stripePaymentIntentId,
        disputeStatus: row.dispute?.status,
      });
    }

    // PARCEL_BLOCKED / PARCEL_INCIDENT (spec §4.2)
    const withShipments = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        OR: [{ shipments: { some: {} } }, { delivery: 'PARCEL' }],
      },
      select: {
        id: true,
        totalCents: true,
        status: true,
        step: true,
        updatedAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { status: true } },
        shipments: {
          select: {
            leg: true,
            status: true,
            updatedAt: true,
            events: {
              select: { status: true, occurredAt: true },
              orderBy: { occurredAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    const parcelItems = shipmentAttentionItems(
      withShipments.map((c) => ({
        commandeId: c.id,
        demandeTitle: c.demande?.title ?? 'Commande',
        clientName: c.client?.name,
        repairerName: c.repairer?.name,
        status: c.status,
        step: c.step,
        totalCents: c.totalCents,
        updatedAt: c.updatedAt,
        shipments: c.shipments ?? [],
      })),
    );
    for (const pi of parcelItems) {
      const match = withShipments.find((w) => w.id === pi.commandeId);
      const reasonsList = pi.reasons && pi.reasons.length > 0 ? pi.reasons : (pi.reason ? [pi.reason] : []);
      for (const r of reasonsList) {
        rawAnomalies.push({
          commandeId: pi.commandeId,
          demandeTitle: pi.demandeTitle,
          clientName: pi.clientName ?? (match as any)?.client?.name,
          repairerName: pi.repairerName ?? (match as any)?.repairer?.name,
          reason: r as AttentionReason,
          status: pi.status,
          step: pi.step,
          totalCents: pi.totalCents,
          since: pi.since,
          disputeStatus: (match as any)?.dispute?.status,
        });
      }
    }

    // Settled Dossier Exclusion:
    // 1. Exclude terminal orders (REFUNDED or ABANDONED) unless handling owed share or failed reversal
    // 2. Exclude dossiers where associated dispute status is RESOLVED_REFUNDED, RESOLVED_REPAIRER_PAID, or CLOSED
    const validAnomalies = rawAnomalies.filter((entry) => {
      // Money still owed outlives a settled order and a closed dispute: a refunded order whose
      // clawback failed is exactly the dossier the operator must not lose sight of.
      if (MONEY_OWED_REASONS.has(entry.reason)) return true;
      if (entry.status === 'REFUNDED' || entry.status === 'ABANDONED') return false;
      return !(entry.disputeStatus && SETTLED_DISPUTE_STATUSES.has(entry.disputeStatus));
    });

    // Grouping anomalies by order into unified rows with reasons: AttentionReason[]
    const map = new Map<string, AdminAttentionItem>();
    const newestSince = new Map<string, number>();
    for (const entry of validAnomalies) {
      newestSince.set(entry.commandeId, Math.max(newestSince.get(entry.commandeId) ?? 0, new Date(entry.since).getTime()));
      const existing = map.get(entry.commandeId);
      if (existing) {
        if (!existing.reasons) {
          existing.reasons = existing.reason ? [existing.reason as AttentionReason] : [];
        }
        if (!existing.reasons.includes(entry.reason)) {
          existing.reasons.push(entry.reason);
        }
        if (new Date(entry.since).getTime() < new Date(existing.since).getTime()) {
          existing.since = entry.since;
        }
        if (!existing.clientName && entry.clientName) existing.clientName = entry.clientName;
        if (!existing.repairerName && entry.repairerName) existing.repairerName = entry.repairerName;
        if (!existing.stripePaymentIntentId && entry.stripePaymentIntentId) {
          existing.stripePaymentIntentId = entry.stripePaymentIntentId;
        }
        if (!existing.stripeSessionId && entry.stripeSessionId) {
          existing.stripeSessionId = entry.stripeSessionId;
        }
      } else {
        map.set(entry.commandeId, {
          commandeId: entry.commandeId,
          demandeTitle: entry.demandeTitle,
          clientName: entry.clientName,
          repairerName: entry.repairerName,
          reasons: [entry.reason],
          reason: entry.reason,
          status: entry.status,
          step: entry.step,
          totalCents: entry.totalCents,
          since: entry.since,
          stripePaymentIntentId: entry.stripePaymentIntentId,
          stripeSessionId: entry.stripeSessionId,
        });
      }
    }

    // Dismissal persistence & filtering via AdminAuditLog within the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dismissLogs = await this.prisma.adminAuditLog.findMany({
      where: {
        action: 'attention.dismiss',
        targetType: 'Commande',
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        targetId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestDismissMap = new Map<string, Date>();
    for (const log of dismissLogs) {
      if (log.targetId && !latestDismissMap.has(log.targetId)) {
        latestDismissMap.set(log.targetId, new Date(log.createdAt));
      }
    }

    const finalItems: AdminAttentionItem[] = [];
    for (const item of map.values()) {
      const dismissedAt = latestDismissMap.get(item.commandeId);
      const undismissable = item.reasons?.some((r) => ATTENTION_UNDISMISSABLE_REASONS.includes(r)) ?? false;
      // A dismissal covers what was reported when it was made: a reason that arrived afterwards
      // (its own `since` is later than the dismissal) brings the order back.
      const arrivedAfter = (newestSince.get(item.commandeId) ?? 0) > (dismissedAt?.getTime() ?? 0);
      if (dismissedAt && !undismissable && !arrivedAfter) continue;
      finalItems.push(item);
    }

    return finalItems;
  }

  private async purgeOrphanPhotos() {
    // When storage is not configured, return zeros immediately rather than throwing.
    // An unconfigured environment must report an honest no-op, not a failed job.
    if (!isStorageConfigured()) {
      return { scanned: 0, acted: 0, failed: 0 };
    }

    const gateway = storageGateway();
    /**
     * 🛑 THIS ANCHOR IS LOAD-BEARING AND KEEPS BECOMING MORE SO. The bucket is no longer demande
     * photos only: profile photos live in it under `avatars/` (`CF-23`) and réparateur banners under
     * `banners/` (`CF-24`), because the bucket name is not a parameter anywhere in the gateway.
     * Neither has a `DemandePhoto` row, so both look unreferenced to `shouldPurge`, and this job
     * would delete every user's profile photo and every réparateur's banner 24 hours after upload -
     * silently and with no error.
     *
     * So do NOT widen this to the bucket root, and do NOT replace the three explicit levels below
     * with a recursive list. `test/cron-photo-orphans.spec.ts` seeds one object under EACH
     * profile-media prefix and asserts neither is even scanned.
     *
     * 🛑 And the list of things this protects has grown twice in two days, so do not treat it as
     * closed: the test to write when a fourth prefix appears is another seed in that spec, not a
     * change here.
     */
    const prefix = 'demandes';

    // Three-level explicit walk, because listPrefix returns only DIRECT children. This depth
    // was verified against the fake only. On the first real run: confirm Supabase returns
    // only direct children per prefix (not a recursive flat list).
    const allObjects: { fullPath: string; createdAt: string }[] = [];

    // Level 1: list user segments
    const userEntries = await gateway.listPrefix(prefix);

    for (const userEntry of userEntries) {
      const userPrefix = `${prefix}/${userEntry.name}`;

      // Level 2: list draft segments under this user
      const draftEntries = await gateway.listPrefix(userPrefix);

      for (const draftEntry of draftEntries) {
        const draftPrefix = `${userPrefix}/${draftEntry.name}`;

        // Level 3: list objects under this draft
        const objectEntries = await gateway.listPrefix(draftPrefix);

        for (const objEntry of objectEntries) {
          // Only collect actual objects (files ending in .jpg or .png), not directory-like entries.
          if (
            objEntry.name.endsWith('.jpg') ||
            objEntry.name.endsWith('.png')
          ) {
            allObjects.push({
              fullPath: `${draftPrefix}/${objEntry.name}`,
              createdAt: objEntry.createdAt,
            });
          }
        }
      }
    }

    // Warn if we saw prefixes but found no files - makes silent listing-depth failures observable.
    if (userEntries.length > 0 && allObjects.length === 0) {
      console.warn(
        '[cron] purgeOrphanPhotos: saw %d user prefixes but found 0 leaf objects - listing depth may be wrong',
        userEntries.length,
      );
    }

    // Load all referenced storage paths into a Set for O(1) lookup.
    const referenced = new Set(
      (
        await this.prisma.demandePhoto.findMany({
          select: { storagePath: true },
        })
      ).map((r) => r.storagePath),
    );

    // Apply the predicate: unreferenced AND older than 24h.
    const now = new Date();
    const toDelete: string[] = [];
    for (const obj of allObjects) {
      const isReferenced = referenced.has(obj.fullPath);
      if (
        shouldPurge({ createdAt: obj.createdAt, referenced: isReferenced }, now)
      ) {
        toDelete.push(obj.fullPath);
      }
    }

    // Batch delete. remove() is a no-op for an empty array.
    if (toDelete.length > 0) {
      await gateway.remove(toDelete);
    }

    // `failed` is deliberately 0 because remove() is all-or-nothing: it either succeeds for
    // the whole batch or throws, so there is no per-item count to accumulate. A failure
    // surfaces in the outer guard() as CronJobResult.error.
    return { scanned: allObjects.length, acted: toDelete.length, failed: 0 };
  }

  private async purgeInactiveAccounts() {
    const cutoff = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years

    // Find users with no active session, whose updatedAt is older than 2 years.
    const inactiveUsers = await this.prisma.user.findMany({
      where: {
        updatedAt: { lt: cutoff },
        sessions: { none: {} },
      },
      select: { id: true },
    });

    let acted = 0;
    let failed = 0;
    for (const user of inactiveUsers) {
      try {
        await this.users.deleteAccount(user.id);
        acted++;
      } catch (e: unknown) {
        if (e instanceof AppException && e.code === 'CONFLICT') {
          // They are in escrow, leave them alone
        } else {
          failed++;
          console.error(
            '[cron] failed to purge inactive account %s',
            user.id,
            e,
          );
        }
      }
    }

    return { scanned: inactiveUsers.length, acted, failed };
  }

  private async purgeOldLogs() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year for logs

    // In Prisma, we can do these sequentially or in a transaction.
    // They don't need to be in a transaction because they are independent tables.
    // We will do them sequentially to not hold a big transaction lock.
    const stripe = await this.prisma.stripeEvent.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });
    const boxtal = await this.prisma.boxtalEvent.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });
    const verification = await this.prisma.verificationAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const adminAudit = await this.prisma.adminAuditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const acted =
      stripe.count + boxtal.count + verification.count + adminAudit.count;
    return { scanned: acted, acted, failed: 0 };
  }

  /**
   * Bug B13: an erasure left in `PROCESSING` is settled from what Stripe reports, never from the
   * clock. Four days is Stripe's maximum, not a confirmation: stamping REDACTED because the window
   * elapsed would record an erasure Stripe has not confirmed, and overwrite a session's status
   * with a guess. A session Stripe still reports as processing is left as it is.
   * Public so testable without running all cron jobs.
   */
  async settlePendingErasures() {
    const pending = await this.prisma.identityVerification.findMany({
      where: { redactionStatus: 'PROCESSING' },
      select: { id: true, stripeSessionId: true },
    });

    let acted = 0;
    let failed = 0;
    for (const record of pending) {
      try {
        const live = await identityGateway().retrieveSession(record.stripeSessionId);
        if (!live.redactionStatus || live.redactionStatus === 'PROCESSING') continue;
        await this.prisma.identityVerification.update({
          where: { id: record.id },
          data: {
            redactionStatus: live.redactionStatus,
            status: live.status,
            lastSyncedAt: new Date(),
          },
        });
        acted++;
      } catch (e: unknown) {
        failed++;
        console.error(
          '[cron] failed to settle pending erasure for %s',
          record.id,
          e,
        );
      }
    }
    return { scanned: pending.length, acted, failed };
  }
}
