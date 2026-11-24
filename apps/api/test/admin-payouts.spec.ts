import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminPayoutsService } from '../src/admin/admin-payouts.service.js';
import { AdminPayoutsController } from '../src/admin/admin-payouts.controller.js';
import { FISCAL_INCOMPLETE_MESSAGE } from '../src/fiscal/fiscal-gate.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';

const fakePayments = {
  createTransfer: vi.fn(),
};

/** A commande released to its réparateur whose transfer never left: the one state a retry may pay. */
const releasedRow = {
  status: 'PAID',
  step: 'RELEASED',
  disputedAt: null,
  stripeRefundId: null,
  stripeTransferReversalId: null,
};

const fakeConnect = {
  retrieveAccount: vi.fn(),
};

vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));

vi.mock('../src/connect/gateway.js', () => ({
  connectGateway: () => fakeConnect,
}));

describe('AdminPayoutsService', () => {
  let prisma: any;
  let service: AdminPayoutsService;
  let mailer: any;
  let fiscal: any;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      commande: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      connectAccount: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      adminAuditLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    fiscal = { sendFiscalReminders: vi.fn() };
    service = new AdminPayoutsService(prisma, fiscal as never, mailer);
  });

  describe('listPayouts', () => {
    it('applies base status filter and pagination defaults', async () => {
      const mockRow = {
        id: 'cmd-1',
        repairCents: 5000,
        totalCents: 6500,
        transferredCents: 5000,
        status: 'PAID',
        step: 'RELEASED',
        stripeTransferId: 'tr_123',
        stripeChargeId: 'ch_123',
        stripeTransferReversalId: null,
        paidAt: new Date('2026-10-15T10:00:00Z'),
        releasedAt: new Date('2026-10-15T12:00:00Z'),
        createdAt: new Date('2026-10-15T09:00:00Z'),
        repairerUserId: 'user-rep-1',
        repairer: {
          id: 'user-rep-1',
          name: 'Atelier Phone',
          email: 'atelier@phone.fr',
          connectAccount: {
            stripeAccountId: 'acct_123',
            transfersActive: true,
            disabledReason: null,
          },
        },
      };

      prisma.commande.findMany.mockResolvedValue([mockRow]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 25 });

      expect(prisma.commande.findMany).toHaveBeenCalledTimes(1);
      const findArgs = prisma.commande.findMany.mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(25);
      expect(findArgs.where.status.in).toContain('PAID');

      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
      expect(res.totalPages).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({
        id: 'cmd-1',
        status: 'TRANSFERRED',
        amountCents: 5000,
        totalOrderCents: 6500,
        commissionCents: 1500,
        repairerName: 'Atelier Phone',
        repairerEmail: 'atelier@phone.fr',
        canRetry: false,
      });
    });

    it('filters by TRANSFERRED, PENDING, FAILED, and REVERSED statuses', async () => {
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);

      // TRANSFERRED
      await service.listPayouts({ status: 'TRANSFERRED', period: 'all', page: 1, limit: 10 });
      let findArgs = prisma.commande.findMany.mock.calls[0][0];
      expect(findArgs.where.stripeTransferId).toEqual({ not: null });

      // PENDING
      await service.listPayouts({ status: 'PENDING', period: 'all', page: 1, limit: 10 });
      findArgs = prisma.commande.findMany.mock.calls[1][0];
      expect(findArgs.where.status).toBe('PAID');
      expect(findArgs.where.stripeTransferId).toBeNull();
      expect(findArgs.where.stripeRefundId).toBeNull();

      // FAILED
      await service.listPayouts({ status: 'FAILED', period: 'all', page: 1, limit: 10 });
      findArgs = prisma.commande.findMany.mock.calls[2][0];
      expect(findArgs.where.step).toBe('RELEASED');
      expect(findArgs.where.stripeTransferId).toBeNull();

      // REVERSED
      await service.listPayouts({ status: 'REVERSED', period: 'all', page: 1, limit: 10 });
      findArgs = prisma.commande.findMany.mock.calls[3][0];
      expect(findArgs.where.stripeTransferReversalId).toEqual({ not: null });
    });

    it('filters by period (today, 7d, 30d)', async () => {
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);

      await service.listPayouts({ status: 'ALL', period: 'today', page: 1, limit: 10 });
      let findArgs = prisma.commande.findMany.mock.calls[0][0];
      expect(findArgs.where.createdAt.gte).toBeInstanceOf(Date);

      await service.listPayouts({ status: 'ALL', period: '7d', page: 1, limit: 10 });
      findArgs = prisma.commande.findMany.mock.calls[1][0];
      expect(findArgs.where.createdAt.gte).toBeInstanceOf(Date);

      await service.listPayouts({ status: 'ALL', period: '30d', page: 1, limit: 10 });
      findArgs = prisma.commande.findMany.mock.calls[2][0];
      expect(findArgs.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('filters by search term q', async () => {
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);

      await service.listPayouts({ q: 'atelier', status: 'ALL', period: 'all', page: 1, limit: 10 });
      const findArgs = prisma.commande.findMany.mock.calls[0][0];
      expect(findArgs.where.OR).toBeDefined();
      expect(findArgs.where.OR.some((cond: any) => cond.id)).toBe(true);
      expect(findArgs.where.OR.some((cond: any) => cond.repairer?.name)).toBe(true);
      expect(findArgs.where.OR.some((cond: any) => cond.repairer?.email)).toBe(true);
      expect(findArgs.where.OR.some((cond: any) => cond.stripeTransferId)).toBe(true);
    });

    // Amended 2026-11-17 by V8 `ISS8-013` (`DEC8-11` (3)): an inactive Connect account HOLDS the payout
    // (it leaves by itself once the account is active); it was FAILED with a retry the endpoint refused.
    it('holds a payout whose réparateur has an inactive Connect account, with no retry', async () => {
      const mockFailedRow = {
        id: 'cmd-failed-1',
        repairCents: 4500,
        totalCents: 5500,
        transferredCents: null,
        status: 'PAID',
        step: 'RELEASED',
        stripeTransferId: null,
        stripeChargeId: 'ch_456',
        stripeTransferReversalId: null,
        paidAt: new Date('2026-10-14T10:00:00Z'),
        releasedAt: new Date('2026-10-14T12:00:00Z'),
        createdAt: new Date('2026-10-14T09:00:00Z'),
        repairerUserId: 'user-rep-2',
        repairer: {
          id: 'user-rep-2',
          name: 'Reparation Express',
          email: 'express@rep.fr',
          connectAccount: {
            stripeAccountId: 'acct_inactive',
            transfersActive: false,
            disabledReason: 'requirements.past_due',
          },
          repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date('2026-10-01T00:00:00Z') },
          profile: { verificationLevel: 'IDENTITY' },
          businessVerification: null,
        },
      };

      prisma.commande.findMany.mockResolvedValue([mockFailedRow]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 10 });

      expect(res.items[0]!.status).toBe('HELD');
      expect(res.items[0]!.failureReason).toBe('Compte Stripe Connect inactif');
      expect(res.items[0]!.canRetry).toBe(false);
    });
  });

  describe('listPayouts, order held for missing fiscal information (CMP-D3)', () => {
    const heldRow = {
      id: 'cmd-held-1',
      repairCents: 4500,
      totalCents: 5500,
      transferredCents: null,
      status: 'PAID',
      step: 'RELEASED',
      stripeTransferId: null,
      stripeRefundId: null,
      disputedAt: null,
      stripeChargeId: 'ch_held',
      stripeTransferReversalId: null,
      paidAt: new Date('2026-10-14T10:00:00Z'),
      releasedAt: new Date('2026-10-14T12:00:00Z'),
      createdAt: new Date('2026-10-14T09:00:00Z'),
      repairerUserId: 'user-rep-3',
      repairer: {
        id: 'user-rep-3',
        name: 'Sans Fiscal',
        email: 'sf@rep.fr',
        connectAccount: { stripeAccountId: 'acct_ok', transfersActive: true, disabledReason: null },
        repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: null },
        profile: { verificationLevel: 'IDENTITY' },
        businessVerification: null,
      },
    };

    it('says the réparateur is the blocker and offers no retry the server would refuse', async () => {
      prisma.commande.findMany.mockResolvedValue([heldRow]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 10 });

      expect(res.items[0]!.failureReason).toBe('Informations fiscales du réparateur incomplètes (DAC7)');
      expect(res.items[0]!.canRetry).toBe(false);
    });

    it('the same order is retryable once the declaration is complete (badge and endpoint agree)', async () => {
      const done = { ...heldRow, repairer: { ...heldRow.repairer, repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date() } } };
      prisma.commande.findMany.mockResolvedValue([done]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 10 });

      expect(res.items[0]!.canRetry).toBe(true);
    });

    it('a PRO with an approved business verification counts as complete', async () => {
      const pro = {
        ...heldRow,
        repairer: {
          ...heldRow.repairer,
          repairerProfile: { kind: 'PRO', fiscalCompletedAt: null },
          profile: { verificationLevel: 'BUSINESS' },
          businessVerification: { status: 'APPROVED' },
        },
      };
      prisma.commande.findMany.mockResolvedValue([pro]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 10 });

      expect(res.items[0]!.canRetry).toBe(true);
    });
  });

  describe('listIncompleteConnectAccounts', () => {
    it('aggregates pending held escrow orders per incomplete account and sorts desc', async () => {
      const mockAccounts = [
        {
          id: 'ca-1',
          userId: 'usr-1',
          stripeAccountId: 'acct_incomplete_1',
          status: 'PENDING',
          transfersActive: false,
          disabledReason: 'requirements.currently_due',
          createdAt: new Date('2026-10-01T00:00:00Z'),
          lastSyncedAt: new Date('2026-10-10T00:00:00Z'),
          user: { id: 'usr-1', name: 'Reparateur A', email: 'a@rep.fr' },
        },
        {
          id: 'ca-2',
          userId: 'usr-2',
          stripeAccountId: 'acct_incomplete_2',
          status: 'RESTRICTED',
          transfersActive: false,
          disabledReason: 'rejected.fraud',
          createdAt: new Date('2026-10-02T00:00:00Z'),
          lastSyncedAt: null,
          user: { id: 'usr-2', name: 'Reparateur B', email: 'b@rep.fr' },
        },
      ];

      prisma.connectAccount.findMany.mockResolvedValue(mockAccounts);
      prisma.commande.findMany.mockResolvedValue([]); // V8 ISS8-013: no réparateur without an account here
      prisma.commande.groupBy.mockResolvedValue([
        {
          repairerUserId: 'usr-1',
          _count: { id: 2 },
          _sum: { repairCents: 15000 },
        },
        {
          repairerUserId: 'usr-2',
          _count: { id: 5 },
          _sum: { repairCents: 45000 },
        },
      ]);

      const res = await service.listIncompleteConnectAccounts({ page: 1, limit: 10 });

      expect(res.total).toBe(2);
      expect(res.items).toHaveLength(2);
      // usr-2 has 45000 cents vs usr-1's 15000 cents -> usr-2 must be first
      expect(res.items[0]!.userId).toBe('usr-2');
      expect(res.items[0]!.pendingPayoutsTotalCents).toBe(45000);
      expect(res.items[0]!.pendingPayoutsCount).toBe(5);

      expect(res.items[1]!.userId).toBe('usr-1');
      expect(res.items[1]!.pendingPayoutsTotalCents).toBe(15000);
      expect(res.items[1]!.pendingPayoutsCount).toBe(2);
    });
  });

  describe('getPayoutKpis', () => {
    it('calculates transferred, escrow, failed transfers count, and incomplete accounts count', async () => {
      prisma.commande.aggregate
        .mockResolvedValueOnce({ _sum: { transferredCents: 250000 } })
        .mockResolvedValueOnce({ _sum: { repairCents: 35000 } });

      // Amended 2026-11-17 by V8 `ISS8-013`: released, untransferred orders are now read and split into
      // failed and held (`v8-iss8-013-held-payouts.spec.ts` covers the split); none here.
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.connectAccount.count.mockResolvedValue(7);

      const kpis = await service.getPayoutKpis();

      expect(kpis).toEqual({
        totalTransferredCents: 250000,
        pendingEscrowCents: 35000,
        failedTransfersCount: 0,
        heldPayoutsCount: 0,
        heldPayoutsCents: 0,
        incompleteAccountsCount: 7,
      });
    });
  });

  describe('getPayoutDetail', () => {
    it('throws NotFoundException when order does not exist', async () => {
      prisma.commande.findUnique.mockResolvedValue(null);

      await expect(service.getPayoutDetail('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns formatted payout detail item when order exists', async () => {
      const mockRow = {
        id: 'cmd-single',
        repairCents: 8000,
        totalCents: 10000,
        transferredCents: 8000,
        status: 'PAID',
        step: 'RELEASED',
        stripeTransferId: 'tr_single_1',
        stripeChargeId: 'ch_single_1',
        stripeTransferReversalId: null,
        paidAt: new Date('2026-10-15T10:00:00Z'),
        releasedAt: new Date('2026-10-15T12:00:00Z'),
        createdAt: new Date('2026-10-15T09:00:00Z'),
        repairerUserId: 'usr-single',
        repairer: {
          id: 'usr-single',
          name: 'Reparateur Solo',
          email: 'solo@rep.fr',
          connectAccount: {
            stripeAccountId: 'acct_solo',
            transfersActive: true,
            disabledReason: null,
          },
        },
      };

      prisma.commande.findUnique.mockResolvedValue(mockRow);

      const detail = await service.getPayoutDetail('cmd-single');
      expect(detail.id).toBe('cmd-single');
      expect(detail.amountCents).toBe(8000);
      expect(detail.repairerName).toBe('Reparateur Solo');
    });
  });

  describe('retryTransfer', () => {
    it('throws NotFoundException if commande does not exist', async () => {
      prisma.commande.findUnique.mockResolvedValue(null);

      await expect(service.retryTransfer('missing-id', 'op-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if transfer is already completed', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-already-paid',
        stripeTransferId: 'tr_existing',
      });

      await expect(service.retryTransfer('cmd-already-paid', 'op-1')).rejects.toThrow(
        new BadRequestException('Ce versement a déjà été effectué.'),
      );
    });

    it('throws BadRequestException if repairer Connect account is not active', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-to-retry',
        ...releasedRow,
        stripeTransferId: null,
        stripeChargeId: 'ch_to_retry',
        repairer: {
          connectAccount: {
            stripeAccountId: 'acct_inactive',
            transfersActive: false,
          },
          repairerProfile: { fiscalCompletedAt: new Date() },
        },
      });

      await expect(service.retryTransfer('cmd-to-retry', 'op-1')).rejects.toThrow(
        new BadRequestException("Le compte Stripe Connect du réparateur n'est pas actif."),
      );
    });

    it('blocks retry when repairer fiscal declaration is incomplete', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-valid-retry',
        ...releasedRow,
        repairCents: 7500,
        stripeTransferId: null,
        stripeChargeId: 'ch_valid_1',
        repairer: {
          connectAccount: {
            stripeAccountId: 'acct_active_1',
            transfersActive: true,
          },
          repairerProfile: {
            kind: 'INDIVIDUAL',
            fiscalCompletedAt: null,
          },
        },
      });

      // The exact refusal, not just any BadRequestException: another blocker would have passed the
      // bare class check, which is how the fiscal rule once went untested.
      await expect(service.retryTransfer('cmd-valid-retry', 'op-admin-1')).rejects.toThrow(
        new BadRequestException(FISCAL_INCOMPLETE_MESSAGE),
      );
      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    });

    it('allows retry for PRO repairer with approved business verification even if fiscalCompletedAt is null', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-valid-retry-pro',
        ...releasedRow,
        repairCents: 7500,
        stripeTransferId: null,
        stripeChargeId: 'ch_valid_pro',
        repairer: {
          connectAccount: {
            stripeAccountId: 'acct_active_pro',
            transfersActive: true,
          },
          repairerProfile: {
            kind: 'PRO',
            fiscalCompletedAt: null,
          },
          profile: {
            verificationLevel: 'BUSINESS',
          },
          businessVerification: {
            status: 'APPROVED',
          },
        },
      });

      fakePayments.createTransfer.mockResolvedValue({ id: 'tr_new_transfer_pro' });
      prisma.user.findUnique.mockResolvedValue({ id: 'op-admin-1', email: 'admin@repareme.fr' });
      prisma.commande.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.retryTransfer('cmd-valid-retry-pro', 'op-admin-1');

      expect(result).toEqual({ success: true, transferId: 'tr_new_transfer_pro' });
    });

    it('executes transfer via paymentsGateway, updates order, and records audit row on success', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-valid-retry',
        ...releasedRow,
        repairCents: 7500,
        stripeTransferId: null,
        stripeChargeId: 'ch_valid_1',
        repairer: {
          connectAccount: {
            stripeAccountId: 'acct_active_1',
            transfersActive: true,
          },
          repairerProfile: {
            fiscalCompletedAt: new Date(),
          },
        },
      });

      fakePayments.createTransfer.mockResolvedValue({ id: 'tr_new_transfer_1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'op-admin-1', email: 'admin@repareme.fr' });
      prisma.commande.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.retryTransfer('cmd-valid-retry', 'op-admin-1');

      expect(result).toEqual({ success: true, transferId: 'tr_new_transfer_1' });
      expect(fakePayments.createTransfer).toHaveBeenCalledWith(
        {
          amountCents: 7500,
          destination: 'acct_active_1',
          sourceTransaction: 'ch_valid_1',
          transferGroup: 'cmd-valid-retry',
        },
        'release:cmd-valid-retry',
      );

      // Guarded write: only a row still waiting for its transfer is written, and releasedAt is left alone.
      expect(prisma.commande.updateMany).toHaveBeenCalledWith({
        where: { id: 'cmd-valid-retry', status: 'PAID', step: 'RELEASED', stripeTransferId: null },
        // The date the money moved: the DAC7 file dates a payout by it, and a held order paid later
        // keeps its release date.
        data: { stripeTransferId: 'tr_new_transfer_1', transferredCents: 7500, transferredAt: expect.any(Date) },
      });

      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'op-admin-1',
          actorEmail: 'admin@repareme.fr',
          action: 'payout.transfer_retry',
          targetType: 'Commande',
          targetId: 'cmd-valid-retry',
          statusCode: 200,
        }),
      });
    });
  });

  describe('retryTransfer: it must never pay what the normal release path would refuse', () => {
    const activeRepairer = {
      banned: false,
      connectAccount: { stripeAccountId: 'acct_ok', transfersActive: true },
      repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date() },
    };
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'cmd-safe',
      ...releasedRow,
      repairCents: 7500,
      stripeTransferId: null,
      stripeChargeId: 'ch_safe',
      repairer: activeRepairer,
      ...over,
    });

    it('uses the same idempotency key as the normal release, so Stripe replays instead of paying twice', async () => {
      prisma.commande.findUnique.mockResolvedValue(row());
      prisma.commande.updateMany.mockResolvedValue({ count: 1 });
      fakePayments.createTransfer.mockResolvedValue({ id: 'tr_1' });

      await service.retryTransfer('cmd-safe', 'op-1');
      await service.retryTransfer('cmd-safe', 'op-1');

      const keys = fakePayments.createTransfer.mock.calls.map((c) => c[1]);
      expect(keys).toEqual(['release:cmd-safe', 'release:cmd-safe']);
    });

    it.each([
      ['a refunded order', { status: 'REFUNDED' }],
      ['an order with a refund id', { stripeRefundId: 're_1' }],
      ['a disputed order', { disputedAt: new Date() }],
      ['a reversed transfer', { stripeTransferReversalId: 'trr_1' }],
      ['an order still in escrow', { step: 'REPAIR_STARTED' }],
      ['an unpaid order', { status: 'PENDING_PAYMENT', step: null }],
    ])('refuses %s and creates no transfer', async (_label, over) => {
      prisma.commande.findUnique.mockResolvedValue(row(over));

      await expect(service.retryTransfer('cmd-safe', 'op-1')).rejects.toThrow(BadRequestException);
      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    });

    it('refuses an order that has no Stripe charge to draw the transfer from', async () => {
      prisma.commande.findUnique.mockResolvedValue(row({ stripeChargeId: null }));

      await expect(service.retryTransfer('cmd-safe', 'op-1')).rejects.toThrow(BadRequestException);
      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    });

    it('refuses a banned réparateur', async () => {
      prisma.commande.findUnique.mockResolvedValue(row({ repairer: { ...activeRepairer, banned: true } }));

      await expect(service.retryTransfer('cmd-safe', 'op-1')).rejects.toThrow(BadRequestException);
      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    });

    it('reports a Stripe failure instead of a success and writes nothing', async () => {
      prisma.commande.findUnique.mockResolvedValue(row());
      fakePayments.createTransfer.mockRejectedValueOnce(new Error('stripe down'));

      await expect(service.retryTransfer('cmd-safe', 'op-1')).rejects.toThrow(BadRequestException);
      expect(prisma.commande.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('payout status: FAILED means released but not delivered, and the filters agree with the badge', () => {
    const base = {
      id: 'cmd-s',
      repairCents: 5000,
      totalCents: 6500,
      transferredCents: null,
      stripeTransferId: null,
      stripeChargeId: 'ch_s',
      stripeTransferReversalId: null,
      createdAt: new Date('2026-10-14T09:00:00Z'),
      repairerUserId: 'u',
      repairer: {
        id: 'u',
        name: 'R',
        email: 'r@r.fr',
        connectAccount: { stripeAccountId: 'acct_x', transfersActive: false, disabledReason: null },
      },
    };

    it('an order still in escrow with an inactive Connect account is PENDING, not FAILED, and cannot be retried', async () => {
      prisma.commande.findMany.mockResolvedValue([{ ...base, ...releasedRow, step: 'REPAIR_STARTED' }]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 10 });

      expect(res.items[0]!.status).toBe('PENDING');
      expect(res.items[0]!.canRetry).toBe(false);
    });

    it('the PENDING filter leaves out released-but-undelivered orders, which the FAILED filter returns', async () => {
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);

      await service.listPayouts({ status: 'PENDING', period: 'all', page: 1, limit: 10 });
      await service.listPayouts({ status: 'FAILED', period: 'all', page: 1, limit: 10 });

      const pending = prisma.commande.findMany.mock.calls[0][0].where;
      const failed = prisma.commande.findMany.mock.calls[1][0].where;
      expect(pending.step).toEqual({ not: 'RELEASED' });
      expect(failed).toMatchObject({ status: 'PAID', step: 'RELEASED', stripeTransferId: null });
    });

    it('the failed-transfers KPI counts only paid orders, like the FAILED filter', async () => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.connectAccount.count.mockResolvedValue(0);

      await service.getPayoutKpis();

      // Amended 2026-11-17 by V8 `ISS8-013`: read with findMany (then split), same where.
      expect(prisma.commande.findMany.mock.calls[0][0].where).toMatchObject({ status: 'PAID', step: 'RELEASED' });
    });
  });

  describe('syncConnectAccount: a Stripe failure is reported, not hidden', () => {
    it('throws and does not stamp lastSyncedAt when Stripe cannot be reached', async () => {
      prisma.connectAccount.findUnique.mockResolvedValue({
        id: 'ca-1',
        userId: 'u-1',
        stripeAccountId: 'acct_1',
        status: 'PENDING',
        transfersActive: false,
        disabledReason: null,
        user: { id: 'u-1', name: 'N', email: 'n@n.fr' },
      });
      fakeConnect.retrieveAccount.mockRejectedValueOnce(new Error('stripe down'));

      await expect(service.syncConnectAccount('u-1', 'op-1')).rejects.toThrow();
      expect(prisma.connectAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('syncConnectAccount: the payout IBAN (CMP-D4)', () => {
    const existing = {
      id: 'ca-iban',
      userId: 'u-iban',
      stripeAccountId: 'acct_iban',
      status: 'PENDING',
      transfersActive: false,
      disabledReason: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      lastSyncedAt: null,
      user: { id: 'u-iban', name: 'N', email: 'n@n.fr' },
    };
    const live = (ibanLast4: string | null, ibanFingerprint: string | null = null) => ({
      id: 'acct_iban',
      entityType: 'INDIVIDUAL',
      transfersActive: true,
      detailsSubmitted: true,
      requirementsOutstanding: false,
      rejected: false,
      disabledReason: null,
      ibanLast4,
      ibanFingerprint,
    });

    beforeEach(() => {
      prisma.connectAccount.findUnique.mockResolvedValue(existing);
      prisma.connectAccount.update.mockResolvedValue({ ...existing, lastSyncedAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({ id: 'op-1', email: 'op@x.fr' });
      prisma.commande.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { repairCents: 0 } });
    });

    it('stores the last four of the IBAN Stripe reports', async () => {
      fakeConnect.retrieveAccount.mockResolvedValueOnce(live('0412'));

      await service.syncConnectAccount('u-iban', 'op-1');

      expect(prisma.connectAccount.update.mock.calls[0][0].data).toMatchObject({ ibanLast4: '0412' });
    });

    it('keeps the IBAN already known when this read shows no bank account', async () => {
      fakeConnect.retrieveAccount.mockResolvedValueOnce(live(null));

      await service.syncConnectAccount('u-iban', 'op-1');

      const data = prisma.connectAccount.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('ibanLast4');
      expect(data).not.toHaveProperty('ibanFingerprint');
    });

    it("stores the bank account's fingerprint too, for the duplicate-IBAN alert (RU-29)", async () => {
      fakeConnect.retrieveAccount.mockResolvedValueOnce(live('0412', 'fp_abc'));

      await service.syncConnectAccount('u-iban', 'op-1');

      expect(prisma.connectAccount.update.mock.calls[0][0].data).toMatchObject({
        ibanLast4: '0412',
        ibanFingerprint: 'fp_abc',
      });
    });
  });

  describe('syncConnectAccount', () => {
    it('throws NotFoundException if user Connect account does not exist', async () => {
      prisma.connectAccount.findUnique.mockResolvedValue(null);

      await expect(service.syncConnectAccount('usr-missing', 'op-1')).rejects.toThrow(NotFoundException);
    });

    it('updates lastSyncedAt, writes audit log, and returns updated account DTO', async () => {
      const existingAccount = {
        id: 'ca-sync-1',
        userId: 'usr-sync-1',
        stripeAccountId: 'acct_sync_1',
        status: 'PENDING',
        transfersActive: false,
        disabledReason: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        lastSyncedAt: null,
        user: { id: 'usr-sync-1', name: 'Sync User', email: 'sync@user.fr' },
      };

      const updatedAccount = {
        ...existingAccount,
        lastSyncedAt: new Date('2026-10-16T12:00:00Z'),
      };

      prisma.connectAccount.findUnique.mockResolvedValue(existingAccount);
      prisma.connectAccount.update.mockResolvedValue(updatedAccount);
      prisma.user.findUnique.mockResolvedValue({ id: 'op-admin-1', email: 'admin@repareme.fr' });
      prisma.commande.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _sum: { repairCents: 5000 },
      });

      const dto = await service.syncConnectAccount('usr-sync-1', 'op-admin-1');

      expect(dto.userId).toBe('usr-sync-1');
      expect(dto.repairerName).toBe('Sync User');
      expect(dto.lastSyncedAt).toBeDefined();

      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'connect.sync',
          targetType: 'User',
          targetId: 'usr-sync-1',
        }),
      });
    });
  });

  describe('sendConnectReminder', () => {
    it('throws NotFoundException if user or connectAccount is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.sendConnectReminder('usr-unknown', 'op-1')).rejects.toThrow(NotFoundException);
    });

    it('emails the réparateur what is waiting on the account, writes the audit log and returns success', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'usr-remind-1',
          name: 'Remind Me',
          firstName: 'Remi',
          email: 'remind@user.fr',
          connectAccount: { id: 'ca-remind-1', stripeAccountId: 'acct_remind_1' },
        })
        .mockResolvedValueOnce({ id: 'op-admin-1', email: 'admin@repareme.fr' });
      prisma.commande.aggregate.mockResolvedValue({ _count: { id: 2 }, _sum: { repairCents: 12500 } });

      const res = await service.sendConnectReminder('usr-remind-1', 'op-admin-1');

      expect(res).toEqual({ success: true });
      expect(mailer.send).toHaveBeenCalledTimes(1);
      const mail = mailer.send.mock.calls[0][0];
      expect(mail.to).toBe('remind@user.fr');
      expect(mail.text).toContain('Remi');
      expect(mail.text).toContain('125,00');
      expect(mail.text).toContain('Configurez vos virements');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'connect.remind',
          targetType: 'User',
          targetId: 'usr-remind-1',
        }),
      });
    });
  });

  describe('exportCsv', () => {
    it('generates RFC 4180 CSV with UTF-8 BOM, sanitized formula injections, and correct headers', async () => {
      const mockRows = [
        {
          id: 'cmd-csv-1',
          repairCents: 6000,
          totalCents: 7500,
          transferredCents: 6000,
          status: 'PAID',
          step: 'RELEASED',
          stripeTransferId: 'tr_csv_1',
          stripeChargeId: 'ch_csv_1',
          stripeTransferReversalId: null,
          paidAt: new Date('2026-10-15T10:00:00Z'),
          releasedAt: new Date('2026-10-15T12:00:00Z'),
          createdAt: new Date('2026-10-15T09:00:00Z'),
          repairerUserId: 'usr-csv-1',
          repairer: {
            id: 'usr-csv-1',
            name: '=MaliciousFormula',
            email: '+dangerous@email.fr',
            connectAccount: {
              stripeAccountId: 'acct_csv_1',
              transfersActive: true,
              disabledReason: null,
            },
          },
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockRows);

      const { filename, content } = await service.exportCsv({
        status: 'ALL',
        period: 'all',
        page: 1,
        limit: 50,
      });

      expect(filename).toMatch(/^versements-reparateurs-revime-\d{4}-\d{2}-\d{2}\.csv$/);
      // UTF-8 BOM
      expect(content.startsWith('\uFEFF')).toBe(true);

      const lines = content.slice(1).split('\r\n');
      expect(lines[0]).toBe(
        'ID Commande,Date,Réparateur,Email Réparateur,Montant Versé (€),Total Commande (€),Commission Revime (€),Statut Virement,ID Transfert Stripe,ID Compte Connect',
      );

      // Formula injection sanitization check: '=' and '+' should be prefixed by single quote `'`
      expect(lines[1]).toContain("'=MaliciousFormula");
      expect(lines[1]).toContain("'+dangerous@email.fr");
      expect(lines[1]).toContain('60.00');
      expect(lines[1]).toContain('75.00');
      expect(lines[1]).toContain('15.00');
    });
  });

  describe('triggerFiscalReminders', () => {
    it('delegates to fiscalService, records audit log, and returns formatted counts', async () => {
      const mockFiscalResult = { scanned: 10, reminded1: 3, reminded2: 1, frozen: 2, failed: 0 };
      fiscal.sendFiscalReminders.mockResolvedValue(mockFiscalResult);
      prisma.user.findUnique.mockResolvedValue({ id: 'op-admin-1', email: 'admin@repareme.fr' });

      const res = await service.triggerFiscalReminders('op-admin-1');

      expect(res).toEqual(mockFiscalResult);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'payout.fiscal_remind',
          targetType: 'payout',
          targetId: 'all',
          actorEmail: 'admin@repareme.fr',
        }),
      });
    });
  });

  describe('AdminPayoutsController', () => {
    let controller: AdminPayoutsController;

    beforeEach(() => {
      controller = new AdminPayoutsController(service);
    });

    it('delegates listPayouts to service with parsed query', async () => {
      const mockResult: any = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
      const spy = vi.spyOn(service, 'listPayouts').mockResolvedValue(mockResult);

      const res = await controller.listPayouts({ status: 'TRANSFERRED', page: '2', limit: '10' });

      expect(spy).toHaveBeenCalledWith({
        status: 'TRANSFERRED',
        page: 2,
        limit: 10,
        period: 'all',
      });
      expect(res).toBe(mockResult);
    });

    it('delegates listIncompleteAccounts to service with parsed query', async () => {
      const mockResult: any = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
      const spy = vi.spyOn(service, 'listIncompleteConnectAccounts').mockResolvedValue(mockResult);

      const res = await controller.listIncompleteAccounts({ page: '1', limit: '20', q: 'atelier' });

      expect(spy).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        q: 'atelier',
      });
      expect(res).toBe(mockResult);
    });

    it('delegates payoutKpis to service', async () => {
      const mockKpis: any = {
        totalTransferredCents: 100000,
        pendingEscrowCents: 20000,
        failedTransfersCount: 1,
        incompleteAccountsCount: 2,
      };
      const spy = vi.spyOn(service, 'getPayoutKpis').mockResolvedValue(mockKpis);

      const res = await controller.payoutKpis();

      expect(spy).toHaveBeenCalled();
      expect(res).toBe(mockKpis);
    });

    it('delegates exportCsv to service and streams response headers and body', async () => {
      const spy = vi.spyOn(service, 'exportCsv').mockResolvedValue({
        filename: 'payouts-export.csv',
        content: '\uFEFFcol1,col2',
      });

      const mockRes: any = {
        setHeader: vi.fn(),
        send: vi.fn(),
      };

      await controller.exportCsv({ status: 'ALL' }, mockRes);

      expect(spy).toHaveBeenCalledWith({
        status: 'ALL',
        page: 1,
        limit: 25,
        period: 'all',
      });
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="payouts-export.csv"',
      );
      expect(mockRes.send).toHaveBeenCalledWith('\uFEFFcol1,col2');
    });

    it('delegates syncAccount to service with userId and operatorUserId', async () => {
      const mockResult: any = { id: 'acct-1', userId: 'user-1' };
      const spy = vi.spyOn(service, 'syncConnectAccount').mockResolvedValue(mockResult);

      const session: any = { user: { id: 'admin-op-1' } };
      const res = await controller.syncAccount('user-1', session);

      expect(spy).toHaveBeenCalledWith('user-1', 'admin-op-1');
      expect(res).toBe(mockResult);
    });

    it('delegates remindAccount to service with userId and operatorUserId', async () => {
      const mockResult = { success: true };
      const spy = vi.spyOn(service, 'sendConnectReminder').mockResolvedValue(mockResult);

      const session: any = { user: { id: 'admin-op-2' } };
      const res = await controller.remindAccount('user-2', session);

      expect(spy).toHaveBeenCalledWith('user-2', 'admin-op-2');
      expect(res).toBe(mockResult);
    });

    it('delegates retryTransfer to service with id and operatorUserId', async () => {
      const mockResult = { success: true, transferId: 'tr_retry_1' };
      const spy = vi.spyOn(service, 'retryTransfer').mockResolvedValue(mockResult);

      const session: any = { user: { id: 'admin-op-3' } };
      const res = await controller.retryTransfer('cmd-100', session);

      expect(spy).toHaveBeenCalledWith('cmd-100', 'admin-op-3');
      expect(res).toBe(mockResult);
    });

    it('delegates payoutDetail to service with id', async () => {
      const mockResult: any = { id: 'cmd-200', amountCents: 5000 };
      const spy = vi.spyOn(service, 'getPayoutDetail').mockResolvedValue(mockResult);

      const res = await controller.payoutDetail('cmd-200');

      expect(spy).toHaveBeenCalledWith('cmd-200');
      expect(res).toBe(mockResult);
    });

    it('delegates triggerFiscalReminders to service with session operatorUserId', async () => {
      const mockResult: any = { scanned: 5, reminded1: 2, reminded2: 0, frozen: 1, remindersSent: 2, candidatesEvaluated: 5 };
      const spy = vi.spyOn(service, 'triggerFiscalReminders').mockResolvedValue(mockResult);

      const session: any = { user: { id: 'admin-op-4' } };
      const res = await controller.triggerFiscalReminders(session);

      expect(spy).toHaveBeenCalledWith('admin-op-4');
      expect(res).toBe(mockResult);
    });

    it('attaches exact RBAC permissions to controller methods', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.listIncompleteAccounts)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.payoutKpis)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.exportCsv)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.syncAccount)).toBe('payments.manage');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.remindAccount)).toBe('payments.manage');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.retryTransfer)).toBe('payments.manage');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.triggerFiscalReminders)).toBe('users.moderate');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.payoutDetail)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.listPayouts)).toBe('dashboard.read');
    });
  });
});

