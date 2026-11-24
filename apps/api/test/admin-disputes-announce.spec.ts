import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import type { OpenDisputeInput } from '@revime/shared';

function makePrismaMock() {
  const mock = {
    dispute: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    commande: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    connectAccount: {
      findUnique: vi.fn(),
    },
    commandeStepEvent: {
      create: vi.fn(),
    },
    // CF4-I. Every `openDispute` call now closes a pending request in the same
    // transaction; default to "none pending" (count 0) so tests that do not care
    // about cancellations are unaffected.
    cancellationRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // Self-referential, same pattern as admin-catalog.service.spec.ts / the fixed
    // admin-disputes.service.spec.ts: resolveRelease's ordering assertion needs
    // `tx` inside $transaction to be the same spies as the outer mock.
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(mock);
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
  return mock;
}

describe('AdminDisputesService announces (CF4-16)', () => {
  let prisma: any;
  let refunds: any;
  let announcer: any;
  let service: AdminDisputesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    refunds = { refund: vi.fn().mockResolvedValue(undefined) };
    announcer = { announce: vi.fn().mockResolvedValue(undefined) };
    service = new AdminDisputesService(prisma, refunds, announcer);
  });

  describe('openDispute', () => {
    const input: OpenDisputeInput = {
      reason: 'Colis endommagé à la réception',
      description: 'Le colis est arrivé écrasé par le transporteur.',
      initiator: 'CLIENT',
    };

    it('announces DISPUTE_OPENED after dispute.upsert commits', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-1',
        status: 'PAID',
        dispute: null,
      });
      prisma.dispute.upsert.mockResolvedValue({
        id: 'disp-new',
        commandeId: 'cmd-1',
        status: 'OPEN',
      });

      await service.openDispute('admin-1', 'cmd-1', input);

      expect(announcer.announce).toHaveBeenCalledWith('cmd-1', 'DISPUTE_OPENED');
      const upsertOrder = prisma.dispute.upsert.mock.invocationCallOrder[0];
      const announceOrder = announcer.announce.mock.invocationCallOrder[0];
      expect(announceOrder).toBeGreaterThan(upsertOrder);
    });

    it('does not announce when the commande is not found', async () => {
      prisma.commande.findUnique.mockResolvedValue(null);

      await expect(service.openDispute('admin-1', 'unknown-cmd', input)).rejects.toThrow();
      expect(announcer.announce).not.toHaveBeenCalled();
    });

    it('does not announce when an active dispute already exists', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-disputed',
        status: 'PAID',
        dispute: { id: 'disp-existing', status: 'OPEN' },
      });

      await expect(service.openDispute('admin-1', 'cmd-disputed', input)).rejects.toThrow();
      expect(announcer.announce).not.toHaveBeenCalled();
    });
  });

  describe('resolveDismiss', () => {
    it('announces DISPUTE_DISMISSED after the dispute update commits', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: { id: 'cmd-1', status: 'PAID' },
      });

      await service.resolveDismiss('admin-1', 'disp-1', 'Litige sans fondement, le client a confirmé la réception.');

      expect(announcer.announce).toHaveBeenCalledWith('cmd-1', 'DISPUTE_DISMISSED');
      const updateOrder = prisma.dispute.update.mock.invocationCallOrder[0];
      const announceOrder = announcer.announce.mock.invocationCallOrder[0];
      expect(announceOrder).toBeGreaterThan(updateOrder);
    });

    it('does not announce when the dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_DISMISSED',
      });

      await expect(service.resolveDismiss('admin-1', 'disp-1', 'Note')).rejects.toThrow();
      expect(announcer.announce).not.toHaveBeenCalled();
    });

    it('does not announce when the dispute is not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.resolveDismiss('admin-1', 'disp-404', 'Note')).rejects.toThrow();
      expect(announcer.announce).not.toHaveBeenCalled();
    });
  });

  describe('resolveRelease', () => {
    it('announces DISPUTE_RELEASED when a transfer id is present (existing transfer)', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: 'tr_1',
        },
      });

      await service.resolveRelease('admin-1', 'disp-1', 'Réparation validée après vérification des photos.');

      expect(announcer.announce).toHaveBeenCalledWith('cmd-1', 'DISPUTE_RELEASED');
      const txOrder = prisma.$transaction.mock.invocationCallOrder[0];
      const announceOrder = announcer.announce.mock.invocationCallOrder[0];
      expect(announceOrder).toBeGreaterThan(txOrder);
    });

    // CF4-15 (spec §3). Rule changed: this used to be the silent-degrade path
    // ("release still succeeds" with no funds moved). Now the missing
    // ConnectAccount refuses the whole release outright - see
    // admin-disputes.service.spec.ts for the full assertion on that refusal.
    // This test just confirms no announce fires when resolveRelease throws.
    it('does not announce when there is no stripeTransferId and no connect account (release now refuses)', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
        },
      });
      prisma.connectAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveRelease('admin-1', 'disp-1', 'Note de résolution suffisamment longue.'),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Le réparateur ne peut pas recevoir de paiement.',
      });
      expect(announcer.announce).not.toHaveBeenCalled();
    });

    it('does not announce when the dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_RELEASED',
      });

      await expect(service.resolveRelease('admin-1', 'disp-1', 'Note')).rejects.toThrow();
      expect(announcer.announce).not.toHaveBeenCalled();
    });
  });

  describe('resolveRefund', () => {
    it('delegates DISPUTE_REFUNDED as the 4th argument to RefundService.refund with the admin-chosen breakdown; the dispute service itself never announces', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          repairCents: 8000,
          shippingCents: 500,
          insuranceCents: 0,
          protectionCents: 300,
        },
      });
      refunds.refund.mockResolvedValue({ refundCents: 8800, totalCents: 8800 });

      await service.resolveRefund('admin-1', 'disp-1', {
        motif: 'DISPUTE_DECISION',
        resolutionNote: 'Colis perdu définitivement par le transporteur.',
        repairCents: 8000,
        shippingCents: 500,
        protectionCents: 300,
      });

      expect(refunds.refund).toHaveBeenCalledWith(
        'admin-1',
        'cmd-1',
        {
          motif: 'DISPUTE_DECISION',
          note: 'Colis perdu définitivement par le transporteur.',
          repairCents: 8000,
          shippingCents: 500,
          protectionCents: 300,
        },
        'DISPUTE_REFUNDED',
      );
      expect(announcer.announce).not.toHaveBeenCalled();
    });

    it('does not call refund or announce when the dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_REFUNDED',
      });

      await expect(
        service.resolveRefund('admin-1', 'disp-1', {
          motif: 'DISPUTE_DECISION',
          resolutionNote: 'Note',
          repairCents: 0,
          shippingCents: 0,
          protectionCents: 0,
        }),
      ).rejects.toThrow();
      expect(refunds.refund).not.toHaveBeenCalled();
      expect(announcer.announce).not.toHaveBeenCalled();
    });
  });
});
