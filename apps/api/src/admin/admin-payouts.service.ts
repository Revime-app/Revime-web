import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  orderNumberFor,
  orderIdPrefix,
  type AdminPayoutListQuery,
  type AdminPayoutListResponse,
  type AdminPayoutListItem,
  type AdminIncompleteAccountsQuery,
  type AdminIncompleteConnectAccount,
  type AdminIncompleteAccountsResponse,
  type AdminPayoutKpis,
  type PayoutStatus,
  type ConnectAccountStatus,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { paymentsGateway } from '../payments/gateway.js';
import { connectGateway } from '../connect/gateway.js';
import { writeAuditRow } from './admin-audit-write.js';
import type { Prisma } from '../generated/prisma/client.js';
import { COLLECTED_COMMANDE_STATUSES, GENUINE_COLLECTED_COMMANDE_WHERE } from './admin-constants.js';
import { escapeCsvValue } from './admin-csv.js';
import { heldReasonOf, payoutStatusOf } from './payout-status.js';

import { FiscalService, type FiscalRemindersResult } from '../fiscal/fiscal.service.js';
import { FISCAL_INCOMPLETE_MESSAGE, isFiscalComplete } from '../fiscal/fiscal-gate.js';
import { mailSender, type MailSender } from '../mail/mail.service.js';

/** What every payout row needs from the commande: the réparateur and the state of his Connect account. */
const PAYOUT_INCLUDE = {
  repairer: {
    select: {
      id: true,
      name: true,
      email: true,
      connectAccount: {
        select: {
          stripeAccountId: true,
          transfersActive: true,
          disabledReason: true,
        },
      },
      repairerProfile: { select: { kind: true, fiscalCompletedAt: true } },
      profile: { select: { verificationLevel: true } },
      businessVerification: { select: { status: true } },
    },
  },
} satisfies Prisma.CommandeInclude;

type PayoutRow = Prisma.CommandeGetPayload<{ include: typeof PAYOUT_INCLUDE }>;

type PayoutGuardFields = Pick<
  PayoutRow,
  'status' | 'step' | 'stripeTransferId' | 'stripeRefundId' | 'stripeTransferReversalId' | 'disputedAt'
>;

/**
 * Why a payout may NOT be (re)attempted, or null when it may. A payout is owed when the order is paid,
 * its escrow was released to the réparateur (`step` RELEASED) and no transfer left yet; that is the
 * same predicate `CommandesService.payoutStrandedCommandes` pays on, and the two must agree: if this
 * one were looser, an admin click would pay an order the automatic path refuses, such as a refunded
 * or disputed one, or one whose client has not validated the repair. The badge (`canRetry`) and the
 * server both read it, so the button and the endpoint cannot disagree either.
 *
 * `fiscalComplete` is required, not defaulted (CMP-D3): an order held for the réparateur's missing
 * fiscal information is not a failed transfer and not a retryable one, and a caller that forgot to
 * ask would offer a button the endpoint then refuses.
 */
export function payoutBlocker(row: PayoutGuardFields, fiscalComplete: boolean): string | null {
  if (row.stripeTransferId) return 'Ce versement a déjà été effectué.';
  if (row.status !== 'PAID') return 'Seule une commande payée et non remboursée peut être versée.';
  if (row.stripeRefundId) return 'Cette commande a été remboursée.';
  if (row.disputedAt) return 'Cette commande est contestée : le versement est suspendu.';
  if (row.stripeTransferReversalId) return 'Le transfert de cette commande a été annulé.';
  if (row.step !== 'RELEASED') return "Les fonds de cette commande n'ont pas encore été libérés au réparateur.";
  if (!fiscalComplete) return FISCAL_INCOMPLETE_MESSAGE;
  return null;
}

@Injectable()
export class AdminPayoutsService {
  private readonly logger = new Logger(AdminPayoutsService.name);
  private readonly mailer: MailSender;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: FiscalService,
    @Optional() @Inject('PAYOUTS_MAILER') mailer?: MailSender,
  ) {
    this.mailer = mailer ?? mailSender();
  }

  private mapToPayoutListItem(row: PayoutRow): AdminPayoutListItem {
    const connectActive = row.repairer?.connectAccount?.transfersActive ?? false;
    const fiscalComplete = isFiscalComplete({
      kind: row.repairer?.repairerProfile?.kind,
      fiscalCompletedAt: row.repairer?.repairerProfile?.fiscalCompletedAt,
      verificationLevel: row.repairer?.profile?.verificationLevel,
      businessStatus: row.repairer?.businessVerification?.status,
    });

    // V8 `ISS8-013`: a released payout waiting on the réparateur's setup is HELD, not FAILED.
    const held = heldReasonOf({
      hasAccount: row.repairer?.connectAccount != null,
      transfersActive: connectActive,
      fiscalComplete,
    });
    const status: PayoutStatus = payoutStatusOf(row, held === null);

    let failureReason: string | null = null;
    if (status === 'REVERSED') {
      failureReason = 'Transfert annulé ou contesté';
    } else if (status === 'HELD') {
      // CMP-D3 and V8 B2: waiting on the réparateur, not on Stripe; say what he still has to do.
      failureReason = held;
    } else if (status === 'FAILED') {
      failureReason = row.repairer?.connectAccount?.disabledReason ?? 'Échec du versement Stripe';
    }

    // A held payout leaves by itself once his setup is done (`payoutStrandedCommandes`); no retry.
    const canRetry = status !== 'HELD' && payoutBlocker(row, fiscalComplete) === null && row.stripeChargeId != null;

    return {
      id: row.id,
      orderNumber: orderNumberFor(row.id),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt)) : null,
      releasedAt: row.releasedAt
        ? row.releasedAt instanceof Date
          ? row.releasedAt.toISOString()
          : String(row.releasedAt)
        : null,
      amountCents: row.transferredCents ?? row.repairCents,
      totalOrderCents: row.totalCents,
      commissionCents: Math.max(0, row.totalCents - row.repairCents),
      status,
      repairerId: row.repairerUserId,
      repairerName: row.repairer?.name ?? 'Inconnu',
      repairerEmail: row.repairer?.email ?? '',
      stripeAccountId: row.repairer?.connectAccount?.stripeAccountId ?? null,
      transfersActive: connectActive,
      stripeTransferId: row.stripeTransferId ?? null,
      stripeChargeId: row.stripeChargeId ?? null,
      failureReason,
      canRetry,
    };
  }

  private buildPayoutsWhere(query: Partial<AdminPayoutListQuery> = {}): Prisma.CommandeWhereInput {
    const where: Prisma.CommandeWhereInput = {
      status: { in: COLLECTED_COMMANDE_STATUSES },
    };

    if (query.status && query.status !== 'ALL') {
      switch (query.status) {
        case 'TRANSFERRED':
          where.stripeTransferId = { not: null };
          where.stripeTransferReversalId = null;
          break;
        case 'PENDING':
          // Escrow not yet released. A released order with no transfer is FAILED, never both.
          where.status = 'PAID';
          where.step = { not: 'RELEASED' };
          where.stripeTransferId = null;
          where.stripeRefundId = null;
          break;
        case 'FAILED':
        case 'HELD':
          // Same database shape; `listPayouts` tells them apart per row (V8 `ISS8-013`).
          where.status = 'PAID';
          where.step = 'RELEASED';
          where.stripeTransferId = null;
          break;
        case 'REVERSED':
          where.stripeTransferReversalId = { not: null };
          break;
      }
    }

    // Period filtering
    const now = Date.now();
    let createdAt: Prisma.DateTimeFilter = {};
    if (query.period === 'today') {
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);
      createdAt = { ...createdAt, gte: startOfTodayUtc };
    } else if (query.period === '7d') {
      createdAt = { ...createdAt, gte: new Date(now - 7 * 86_400_000) };
    } else if (query.period === '30d') {
      createdAt = { ...createdAt, gte: new Date(now - 30 * 86_400_000) };
    }

    if (query.startDate || query.endDate) {
      createdAt = {
        ...createdAt,
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    // Text search query q
    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      const orderPrefix = orderIdPrefix(term);

      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        ...(orderPrefix ? [{ id: { startsWith: orderPrefix } }] : []),
        { stripeTransferId: { contains: term, mode: 'insensitive' } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async listPayouts(query: Partial<AdminPayoutListQuery> = {}): Promise<AdminPayoutListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const take = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * take;

    const where = this.buildPayoutsWhere(query);

    // V8 `ISS8-013`: FAILED and HELD share one database shape and differ by the réparateur's setup,
    // so those two filters classify every candidate row, then count and page what they keep. The set
    // is small (released, untransferred orders).
    if (query.status === 'FAILED' || query.status === 'HELD') {
      const candidates = await this.prisma.commande.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: PAYOUT_INCLUDE,
      });
      const kept = candidates.map((r) => this.mapToPayoutListItem(r)).filter((i) => i.status === query.status);
      return {
        items: kept.slice(skip, skip + take),
        total: kept.length,
        page,
        pageSize: take,
        totalPages: kept.length === 0 ? 0 : Math.ceil(kept.length / take),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.commande.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: PAYOUT_INCLUDE,
      }),
      this.prisma.commande.count({ where }),
    ]);

    const items = rows.map((r) => this.mapToPayoutListItem(r));
    const totalPages = total === 0 ? 0 : Math.ceil(total / take);

    return {
      items,
      total,
      page,
      pageSize: take,
      totalPages,
    };
  }

  async listIncompleteConnectAccounts(
    query: Partial<AdminIncompleteAccountsQuery> = {},
  ): Promise<AdminIncompleteAccountsResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const where: Record<string, any> = {
      OR: [{ transfersActive: false }, { status: { not: 'VERIFIED' } }],
    };

    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      where.AND = [
        {
          OR: [
            { stripeAccountId: { contains: term, mode: 'insensitive' } },
            { user: { name: { contains: term, mode: 'insensitive' } } },
            { user: { email: { contains: term, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const accounts = await this.prisma.connectAccount.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const userIds = accounts.map((a: any) => a.userId);

    // Group pending payouts by repairerUserId
    const pendingStats =
      userIds.length > 0
        ? await this.prisma.commande.groupBy({
            by: ['repairerUserId'],
            where: {
              repairerUserId: { in: userIds },
              status: 'PAID',
              stripeTransferId: null,
            },
            _count: { id: true },
            _sum: { repairCents: true },
          })
        : [];

    const statsMap = new Map<string, { count: number; totalCents: number }>();
    for (const stat of pendingStats) {
      statsMap.set(stat.repairerUserId, {
        count: stat._count.id,
        totalCents: stat._sum.repairCents ?? 0,
      });
    }

    const mappedAccounts: AdminIncompleteConnectAccount[] = accounts.map((acc: any) => {
      const stats = statsMap.get(acc.userId) ?? { count: 0, totalCents: 0 };
      return {
        id: acc.id,
        userId: acc.userId,
        repairerName: acc.user?.name ?? 'Inconnu',
        repairerEmail: acc.user?.email ?? '',
        stripeAccountId: acc.stripeAccountId,
        status: acc.status as ConnectAccountStatus,
        transfersActive: acc.transfersActive,
        disabledReason: acc.disabledReason ?? null,
        pendingPayoutsCount: stats.count,
        pendingPayoutsTotalCents: stats.totalCents,
        createdAt: acc.createdAt instanceof Date ? acc.createdAt.toISOString() : String(acc.createdAt),
        lastSyncedAt: acc.lastSyncedAt
          ? acc.lastSyncedAt instanceof Date
            ? acc.lastSyncedAt.toISOString()
            : String(acc.lastSyncedAt)
          : null,
      };
    });

    // V8 `ISS8-013`: a réparateur with held payouts and NO Connect account at all (B2's case) has no row
    // above; list him too, so the operator sees who must create one.
    mappedAccounts.push(...(await this.noAccountHeldRows(query.q)));

    // Sort descending by pendingPayoutsTotalCents
    mappedAccounts.sort((a, b) => b.pendingPayoutsTotalCents - a.pendingPayoutsTotalCents);

    const total = mappedAccounts.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const skip = (page - 1) * pageSize;
    const items = mappedAccounts.slice(skip, skip + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /** V8 `ISS8-013`: one « Comptes Stripe incomplets » row per réparateur with held payouts and no account. */
  private async noAccountHeldRows(q?: string): Promise<AdminIncompleteConnectAccount[]> {
    const rows = await this.prisma.commande.findMany({
      where: {
        status: 'PAID',
        step: 'RELEASED',
        stripeTransferId: null,
        repairer: { connectAccount: { is: null } },
      },
      select: {
        repairerUserId: true,
        repairCents: true,
        releasedAt: true,
        repairer: { select: { name: true, email: true } },
      },
    });
    const term = q?.trim().toLowerCase() ?? '';
    const byRepairer = new Map<string, AdminIncompleteConnectAccount>();
    for (const r of rows) {
      const name = r.repairer?.name ?? 'Inconnu';
      const email = r.repairer?.email ?? '';
      if (term && !name.toLowerCase().includes(term) && !email.toLowerCase().includes(term)) continue;
      const released = r.releasedAt instanceof Date ? r.releasedAt.toISOString() : String(r.releasedAt ?? '');
      const acc = byRepairer.get(r.repairerUserId) ?? {
        id: `no-account-${r.repairerUserId}`,
        userId: r.repairerUserId,
        repairerName: name,
        repairerEmail: email,
        stripeAccountId: null,
        status: null,
        transfersActive: false,
        disabledReason: null,
        pendingPayoutsCount: 0,
        pendingPayoutsTotalCents: 0,
        createdAt: released,
        lastSyncedAt: null,
      };
      acc.pendingPayoutsCount += 1;
      acc.pendingPayoutsTotalCents += r.repairCents;
      if (released && released < acc.createdAt) acc.createdAt = released;
      byRepairer.set(r.repairerUserId, acc);
    }
    return [...byRepairer.values()];
  }

  async getPayoutKpis(): Promise<AdminPayoutKpis> {
    const [transferredAgg, pendingAgg, releasedUntransferred, incompleteCount] = await Promise.all([
      // PRE-3: the three order figures count real orders only. `pendingEscrowCents` is what an operator
      // reads as « money held for réparateurs », and a fixture order PAID without Stripe holds none.
      this.prisma.commande.aggregate({
        where: GENUINE_COLLECTED_COMMANDE_WHERE,
        _sum: { transferredCents: true },
      }),
      this.prisma.commande.aggregate({
        where: {
          status: 'PAID',
          stripeTransferId: null,
          stripeRefundId: null,
          ...GENUINE_COLLECTED_COMMANDE_WHERE,
        },
        _sum: { repairCents: true },
      }),
      // V8 `ISS8-013`: released and untransferred, then split per row into FAILED and HELD.
      this.prisma.commande.findMany({
        where: {
          status: 'PAID',
          step: 'RELEASED',
          stripeTransferId: null,
          ...GENUINE_COLLECTED_COMMANDE_WHERE,
        },
        include: PAYOUT_INCLUDE,
      }),
      this.prisma.connectAccount.count({
        where: {
          OR: [{ transfersActive: false }, { status: { not: 'VERIFIED' } }],
        },
      }),
    ]);

    const items = releasedUntransferred.map((r) => this.mapToPayoutListItem(r));
    const heldItems = items.filter((i) => i.status === 'HELD');
    const noAccountRepairers = new Set(
      releasedUntransferred.filter((r) => r.repairer?.connectAccount == null).map((r) => r.repairerUserId),
    );

    return {
      totalTransferredCents: transferredAgg._sum.transferredCents ?? 0,
      pendingEscrowCents: pendingAgg._sum.repairCents ?? 0,
      failedTransfersCount: items.length - heldItems.length,
      heldPayoutsCount: heldItems.length,
      heldPayoutsCents: heldItems.reduce((sum, i) => sum + i.amountCents, 0),
      incompleteAccountsCount: incompleteCount + noAccountRepairers.size,
    };
  }

  async getPayoutDetail(id: string): Promise<AdminPayoutListItem> {
    const row = await this.prisma.commande.findUnique({
      where: { id },
      include: PAYOUT_INCLUDE,
    });

    if (!row) {
      throw new NotFoundException(`Versement ou commande introuvable (${id})`);
    }

    return this.mapToPayoutListItem(row);
  }

  async retryTransfer(
    commandeId: string,
    operatorUserId?: string,
  ): Promise<{ success: boolean; transferId: string }> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: {
        repairer: {
          select: {
            id: true,
            email: true,
            banned: true,
            connectAccount: {
              select: {
                stripeAccountId: true,
                transfersActive: true,
                disabledReason: true,
              },
            },
            repairerProfile: {
              select: {
                kind: true,
                fiscalCompletedAt: true,
              },
            },
            profile: {
              select: {
                verificationLevel: true,
              },
            },
            businessVerification: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (!commande) {
      throw new NotFoundException('Commande introuvable.');
    }

    // The same refusals as the automatic payout, enforced HERE and not only by the button: the
    // endpoint is reachable without the page, and it moves money.
    const blocker = payoutBlocker(
      commande,
      isFiscalComplete({
        kind: commande.repairer?.repairerProfile?.kind,
        fiscalCompletedAt: commande.repairer?.repairerProfile?.fiscalCompletedAt,
        verificationLevel: commande.repairer?.profile?.verificationLevel,
        businessStatus: commande.repairer?.businessVerification?.status,
      }),
    );
    if (blocker) {
      throw new BadRequestException(blocker);
    }

    const chargeId = commande.stripeChargeId;
    if (!chargeId) {
      throw new BadRequestException("Aucun paiement Stripe n'est rattaché à cette commande.");
    }

    if (commande.repairer?.banned) {
      throw new BadRequestException('Le compte du réparateur est suspendu : le versement est bloqué.');
    }

    const connectAccount = commande.repairer?.connectAccount;
    if (!connectAccount || !connectAccount.transfersActive) {
      throw new BadRequestException("Le compte Stripe Connect du réparateur n'est pas actif.");
    }

    // 🛑 `release:<id>` is the key CommandesService uses for the normal release AND for the stranded
    // payout. A key of our own (it used to carry Date.now()) made every click a new transfer, so a
    // double click, or a release that had paid but failed to write its row, paid the réparateur twice.
    // With the shared key Stripe replays the first transfer and the row is written once.
    let transfer: { id: string };
    try {
      transfer = await paymentsGateway().createTransfer(
        {
          amountCents: commande.repairCents,
          destination: connectAccount.stripeAccountId,
          sourceTransaction: chargeId,
          transferGroup: commande.id,
        },
        `release:${commande.id}`,
      );
    } catch (err) {
      this.logger.error(`Payout retry failed for commande ${commande.id}`, err);
      throw new BadRequestException('Le transfert Stripe a échoué. Aucun versement effectué.');
    }

    // Guarded like the automatic path: only a row still waiting for its transfer is written, and
    // releasedAt keeps the date the escrow was really released.
    const written = await this.prisma.commande.updateMany({
      where: { id: commande.id, status: 'PAID', step: 'RELEASED', stripeTransferId: null },
      data: {
        stripeTransferId: transfer.id,
        transferredCents: commande.repairCents,
        transferredAt: new Date(),
      },
    });
    if (written.count === 0) {
      // Money HAS moved: a sibling request wrote the same replayed transfer first. Benign, but it is
      // the one branch that would otherwise go silent after a real transfer.
      this.logger.error(`Transfer ${transfer.id} succeeded but wrote no row for commande ${commande.id}`);
    }

    let actorEmail: string | null = null;
    if (operatorUserId) {
      const operator = await this.prisma.user.findUnique({
        where: { id: operatorUserId },
        select: { email: true },
      });
      actorEmail = operator?.email ?? null;
    }

    await writeAuditRow(
      this.prisma,
      {
        actorUserId: operatorUserId ?? null,
        actorEmail,
        action: 'payout.transfer_retry',
        targetType: 'Commande',
        targetId: commandeId,
        statusCode: 200,
        detail: {
          transferId: transfer.id,
          amountCents: commande.repairCents,
          destination: connectAccount.stripeAccountId,
        },
      },
      (message, err) => this.logger.error(message, err),
    );

    return { success: true, transferId: transfer.id };
  }

  async syncConnectAccount(
    userId: string,
    operatorUserId?: string,
  ): Promise<AdminIncompleteConnectAccount> {
    const account = await this.prisma.connectAccount.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Compte Stripe Connect introuvable pour l'utilisateur ${userId}`);
    }

    let transfersActive = account.transfersActive;
    let status = account.status;
    let disabledReason = account.disabledReason;
    let ibanLast4: string | null = null;
    let ibanFingerprint: string | null = null;

    try {
      const live = await connectGateway().retrieveAccount(account.stripeAccountId);
      if (live) {
        transfersActive = live.transfersActive;
        disabledReason = live.disabledReason;
        ibanLast4 = live.ibanLast4;
        ibanFingerprint = live.ibanFingerprint;
        if (live.rejected) {
          status = 'REJECTED';
        } else if (live.transfersActive && !live.requirementsOutstanding) {
          status = 'VERIFIED';
        } else if (live.detailsSubmitted) {
          status = 'RESTRICTED';
        } else {
          status = 'PENDING';
        }
      }
    } catch (err) {
      // Reporting « synchronisé » over a failed call would hide that the account was NOT refreshed.
      this.logger.error(`Connect sync failed for user ${userId}`, err);
      throw new BadGatewayException('Stripe est injoignable : le compte Connect n\'a pas été synchronisé.');
    }

    const updated = await this.prisma.connectAccount.update({
      where: { id: account.id },
      data: {
        transfersActive,
        status,
        disabledReason,
        // Same rule as the webhook sync: a read that shows no bank account keeps the one we know.
        ...(ibanLast4 ? { ibanLast4 } : {}),
        ...(ibanFingerprint ? { ibanFingerprint } : {}),
        lastSyncedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    let actorEmail: string | null = null;
    if (operatorUserId) {
      const operator = await this.prisma.user.findUnique({
        where: { id: operatorUserId },
        select: { email: true },
      });
      actorEmail = operator?.email ?? null;
    }

    await writeAuditRow(
      this.prisma,
      {
        actorUserId: operatorUserId ?? null,
        actorEmail,
        action: 'connect.sync',
        targetType: 'User',
        targetId: userId,
        statusCode: 200,
        detail: {
          stripeAccountId: account.stripeAccountId,
          status: updated.status,
          transfersActive: updated.transfersActive,
        },
      },
      (message, err) => this.logger.error(message, err),
    );

    const pending = await this.prisma.commande.aggregate({
      where: {
        repairerUserId: userId,
        status: 'PAID',
        stripeTransferId: null,
      },
      _count: { id: true },
      _sum: { repairCents: true },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      repairerName: updated.user?.name ?? 'Inconnu',
      repairerEmail: updated.user?.email ?? '',
      stripeAccountId: updated.stripeAccountId,
      status: updated.status as ConnectAccountStatus,
      transfersActive: updated.transfersActive,
      disabledReason: updated.disabledReason ?? null,
      pendingPayoutsCount: pending._count?.id ?? 0,
      pendingPayoutsTotalCents: pending._sum?.repairCents ?? 0,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
      lastSyncedAt: updated.lastSyncedAt
        ? updated.lastSyncedAt instanceof Date
          ? updated.lastSyncedAt.toISOString()
          : String(updated.lastSyncedAt)
        : null,
    };
  }

  async sendConnectReminder(userId: string, operatorUserId?: string): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { connectAccount: true },
    });

    if (!user || !user.connectAccount) {
      throw new NotFoundException(`Utilisateur ou compte Stripe Connect introuvable (${userId})`);
    }

    const pending = await this.prisma.commande.aggregate({
      where: { repairerUserId: userId, status: 'PAID', stripeTransferId: null },
      _count: { id: true },
      _sum: { repairCents: true },
    });
    const count = pending._count?.id ?? 0;
    const euros = ((pending._sum?.repairCents ?? 0) / 100).toFixed(2).replace('.', ',');
    const recipientName = user.firstName || user.name || 'Réparateur';
    const waiting =
      count > 0
        ? `${count} versement${count > 1 ? 's' : ''} (${euros} €) ${count > 1 ? 'sont' : 'est'} en attente de votre compte.`
        : 'Vos prochains versements ne pourront pas vous être envoyés.';

    // Email only: a push needs a NotificationType, which is a Prisma enum plus a mobile mapping and
    // therefore a native build. The mail is what the screen promises; the push is owed (ISS in the review).
    await this.mailer.send({
      to: user.email,
      subject: 'Finalisez votre compte de versement REVIME',
      text: `Bonjour ${recipientName},\n\nVotre compte de versement Stripe n'est pas encore finalisé. ${waiting}\n\nOuvrez l'application REVIME, rubrique Profil, puis « Configurez vos virements » pour terminer la vérification.\n\nL'équipe REVIME`,
    });

    let actorEmail: string | null = null;
    if (operatorUserId) {
      const operator = await this.prisma.user.findUnique({
        where: { id: operatorUserId },
        select: { email: true },
      });
      actorEmail = operator?.email ?? null;
    }

    await writeAuditRow(
      this.prisma,
      {
        actorUserId: operatorUserId ?? null,
        actorEmail,
        action: 'connect.remind',
        targetType: 'User',
        targetId: userId,
        statusCode: 200,
        detail: {
          stripeAccountId: user.connectAccount.stripeAccountId,
          pendingPayoutsCount: count,
        },
      },
      (message, err) => this.logger.error(message, err),
    );

    return { success: true };
  }

  async exportCsv(query: Partial<AdminPayoutListQuery> = {}): Promise<{ filename: string; content: string }> {
    const where = this.buildPayoutsWhere(query);

    const rows = await this.prisma.commande.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' },
      include: PAYOUT_INCLUDE,
    });

    const header =
      'ID Commande,Date,Réparateur,Email Réparateur,Montant Versé (€),Total Commande (€),Commission Revime (€),Statut Virement,ID Transfert Stripe,ID Compte Connect';

    const dataRows = rows.map((row) => {
      const item = this.mapToPayoutListItem(row);
      const amountEur = (item.amountCents / 100).toFixed(2);
      const totalEur = (item.totalOrderCents / 100).toFixed(2);
      const commissionEur = (item.commissionCents / 100).toFixed(2);

      return [
        escapeCsvValue(item.id),
        escapeCsvValue(item.createdAt),
        escapeCsvValue(item.repairerName),
        escapeCsvValue(item.repairerEmail),
        escapeCsvValue(amountEur),
        escapeCsvValue(totalEur),
        escapeCsvValue(commissionEur),
        escapeCsvValue(item.status),
        escapeCsvValue(item.stripeTransferId ?? ''),
        escapeCsvValue(item.stripeAccountId ?? ''),
      ].join(',');
    });

    const content = '\uFEFF' + [header, ...dataRows].join('\r\n');
    const filename = `versements-reparateurs-revime-${new Date().toISOString().slice(0, 10)}.csv`;

    return { filename, content };
  }

  /**
   * CMP-D3: On-demand administrative trigger for end-of-year DAC7 fiscal reminders.
   */
  async triggerFiscalReminders(operatorUserId?: string): Promise<FiscalRemindersResult> {
    const result = await this.fiscal.sendFiscalReminders();

    let actorEmail: string | null = null;
    if (operatorUserId) {
      const operator = await this.prisma.user.findUnique({
        where: { id: operatorUserId },
        select: { email: true },
      });
      actorEmail = operator?.email ?? null;
    }

    await writeAuditRow(
      this.prisma,
      {
        actorUserId: operatorUserId ?? null,
        actorEmail,
        action: 'payout.fiscal_remind',
        targetType: 'payout',
        targetId: 'all',
        statusCode: 200,
        detail: {
          scanned: result.scanned,
          reminded1: result.reminded1,
          reminded2: result.reminded2,
          frozen: result.frozen,
        },
      },
      (message, err) => this.logger.error(message, err),
    );

    return result;
  }
}
