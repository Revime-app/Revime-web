import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { RefundService } from '../src/commandes/refund.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { RefundBreakdownInput } from '@revime/shared';

const fakePayments = {
  createRefund: vi.fn(),
  retrieveRefund: vi.fn(),
  reverseTransfer: vi.fn(),
  createTransfer: vi.fn(),
};

vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));

function makePrismaMock() {
  const mock = {
    dispute: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    commande: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cancellationRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    demande: {
      update: vi.fn().mockResolvedValue({}),
    },
    connectAccount: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((opsOrCb: any) => {
      if (typeof opsOrCb === 'function') {
        return opsOrCb(mock);
      }
      return Promise.all(opsOrCb);
    }),
  } as any;
  return mock;
}

describe('Bug B11 - Single Authoritative Status Consistency', () => {
  let prisma: any;
  let refundsService: any;
  let announcer: any;
  let adminDisputesService: AdminDisputesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    refundsService = { refund: vi.fn() };
    announcer = { announce: vi.fn().mockResolvedValue(undefined) };
    adminDisputesService = new AdminDisputesService(prisma, refundsService, announcer);
  });

  it('AdminDisputesService.list: reconciles RESOLVED_DISMISSED dispute on REFUNDED commande to RESOLVED_REFUNDED', async () => {
    // Production case: #LIT-0006 on #CMD-A9DB011E
    const conflictingDispute = {
      id: 'disp-6',
      number: 6,
      commandeId: 'cmd-a9db011e',
      status: 'RESOLVED_DISMISSED',
      initiator: 'CLIENT',
      reason: 'Écran cassé',
      verdict: 'DISMISSED',
      createdAt: new Date('2026-10-01T10:00:00Z'),
      resolvedAt: new Date('2026-10-02T10:00:00Z'),
      commande: {
        id: 'cmd-a9db011e',
        status: 'REFUNDED',
        totalCents: 10636,
        repairCents: 8500,
        refundedCents: 10636,
        client: { name: 'Client Test', email: 'client@test.invalid' },
        repairer: { name: 'Réparateur Test', email: 'repairer@test.invalid' },
      },
    };

    prisma.dispute.count.mockResolvedValue(1);
    prisma.dispute.findMany.mockResolvedValue([conflictingDispute]);

    const res = await adminDisputesService.list();
    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item).toBeDefined();

    // Single authoritative status: must be RESOLVED_REFUNDED, verdict REFUND_CLIENT, NOT RESOLVED_DISMISSED
    expect(item!.status).toBe('RESOLVED_REFUNDED');
    expect(item!.verdict).toBe('REFUND_CLIENT');
    expect((item as any).commandeStatus).toBe('REFUNDED');
    // The stored row keeps how the operator closed it: a read derives, it never rewrites.
    expect(prisma.dispute.update).not.toHaveBeenCalled();
  });

  it('AdminDisputesService.getDossier: reconciles RESOLVED_DISMISSED dispute on REFUNDED commande to RESOLVED_REFUNDED', async () => {
    const conflictingDispute = {
      id: 'disp-6',
      number: 6,
      commandeId: 'cmd-a9db011e',
      status: 'RESOLVED_DISMISSED',
      initiator: 'CLIENT',
      reason: 'Écran cassé',
      verdict: 'DISMISSED',
      resolutionNote: 'La réparation reprend',
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-02T10:00:00Z'),
      commande: {
        id: 'cmd-a9db011e',
        status: 'REFUNDED',
        totalCents: 10636,
        repairCents: 8500,
        refundedCents: 10636,
        client: { id: 'c1', name: 'Client Test', email: 'client@test.invalid' },
        repairer: { id: 'r1', name: 'Réparateur Test', email: 'repairer@test.invalid' },
      },
    };

    prisma.dispute.findUnique.mockResolvedValue(conflictingDispute);

    const dossier = await adminDisputesService.getDossier('disp-6');
    expect(dossier.dispute.status).toBe('RESOLVED_REFUNDED');
    expect(dossier.dispute.verdict).toBe('REFUND_CLIENT');
    expect(dossier.commande.status).toBe('REFUNDED');
    expect(prisma.dispute.update).not.toHaveBeenCalled();
  });

  it('AdminDisputesService.resolveDismiss: refuses to dismiss a dispute on a REFUNDED commande', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'disp-6',
      commandeId: 'cmd-a9db011e',
      status: 'OPEN',
      commande: { id: 'cmd-a9db011e', status: 'REFUNDED' },
    });

    await expect(
      adminDisputesService.resolveDismiss('admin-1', 'disp-6', 'Reprise impossible'),
    ).rejects.toThrow('Cette commande est déjà remboursée.');
  });

  it('AdminDisputesService.resolveRelease: refuses to release escrow funds on a REFUNDED commande', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'disp-6',
      commandeId: 'cmd-a9db011e',
      status: 'OPEN',
      commande: {
        id: 'cmd-a9db011e',
        status: 'REFUNDED',
        stripeTransferId: 'tr_existing_123',
        transferredCents: 10000,
        repairerUserId: 'usr-r',
      },
    });

    await expect(
      adminDisputesService.resolveRelease('admin-1', 'disp-6', 'Versement impossible'),
    ).rejects.toThrow('Cette commande est déjà remboursée.');
  });

  it('RefundService.refund: updates dispute to RESOLVED_REFUNDED and clears disputedAt on commande', async () => {
    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as any;
    const shipments = { cancelUnshipped: vi.fn().mockResolvedValue(undefined) } as any;
    const refundAnnouncer = { announce: vi.fn().mockResolvedValue(undefined) } as any;
    const realRefundService = new RefundService(prisma, notifications, shipments, refundAnnouncer);

    fakePayments.createRefund.mockResolvedValue({ id: 're_123', status: 'succeeded' });
    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_123', status: 'succeeded' });

    prisma.commande.findUnique.mockResolvedValue({
      id: 'cmd-1',
      status: 'PAID',
      demandeId: 'dem-1',
      totalCents: 10000,
      repairCents: 8000,
      shippingCents: 1500,
      insuranceCents: 0,
      protectionCents: 500,
      stripeChargeId: 'ch_1',
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
      stripeRefundId: null,
      clientUserId: 'usr-c',
      repairerUserId: 'usr-r',
      repairer: { banned: false },
      demande: { title: 'Test demande' },
    });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeRefundId: null,
    });

    const breakdown: RefundBreakdownInput = {
      motif: 'CLIENT_CANCELLED',
      note: 'Annulation demandée par le client',
      repairCents: 8000,
      shippingCents: 1500,
      protectionCents: 500,
    };

    await realRefundService.refund('admin-1', 'cmd-1', breakdown);

    // Verify commande update in $transaction included disputedAt: null
    const commandeUpdate = prisma.commande.updateMany.mock.calls.find((c: any) =>
      c[0]?.data?.status === 'REFUNDED',
    );
    expect(commandeUpdate).toBeDefined();
    expect(commandeUpdate[0].data.disputedAt).toBeNull();

    // Verify dispute was updated to RESOLVED_REFUNDED in $transaction
    const disputeUpdate = prisma.dispute.updateMany.mock.calls.find((c: any) =>
      c[0]?.where?.commandeId === 'cmd-1',
    );
    expect(disputeUpdate).toBeDefined();
    expect(disputeUpdate[0].data.status).toBe('RESOLVED_REFUNDED');
    expect(disputeUpdate[0].data.verdict).toBe('REFUND_CLIENT');
    // Only a dispute still open is settled by the refund; a closed one keeps its verdict.
    expect(disputeUpdate[0].where.status).toEqual({ in: ['OPEN', 'IN_REVIEW'] });
  });
});
