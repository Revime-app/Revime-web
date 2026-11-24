import { beforeEach, describe, expect, it, vi } from 'vitest';
import { motifsFor } from '@revime/shared';

const fakePayments = {
  createTransfer: vi.fn(),
  findTransferBySource: vi.fn(),
  retrieveRefund: vi.fn(),
};
const fakeConnect = { retrieveAccount: vi.fn() };
const fakeShipping = { cancelOrder: vi.fn() };

vi.mock('../src/payments/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/payments/gateway.js')>()),
  paymentsGateway: () => fakePayments,
}));
vi.mock('../src/connect/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/connect/gateway.js')>()),
  connectGateway: () => fakeConnect,
}));
vi.mock('../src/shipping/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/shipping/gateway.js')>()),
  shippingGateway: () => fakeShipping,
}));
vi.mock('../src/payments/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/payments/config.js')>()),
  arePaymentsEnabled: () => true,
}));
vi.mock('../src/connect/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/connect/config.js')>()),
  isConnectEnabled: () => true,
}));
vi.mock('../src/disputes/dispute-create.js', () => ({
  createDispute: vi.fn(async () => ({ id: 'dsp-1', number: 14 })),
}));

import { CommandesService } from '../src/commandes/commandes.service.js';
import { DisputesService } from '../src/disputes/disputes.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { ShipmentsService } from '../src/shipping/shipments.service.js';

/**
 * RU-25 / F7. `AdminAlertsService.createAlert` had no caller anywhere: the bell and the OPS email were
 * built and wired to nothing, so none of the four alerts the client asked for could ever fire. Each
 * test below drives ONE real producer and asserts the alert it must raise.
 */
describe('F7 alert producers', () => {
  let alerts: { raise: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    alerts = { raise: vi.fn().mockResolvedValue(undefined) };
  });

  describe('DISPUTE_NEW: a party opens a dispute', () => {
    it('raises a CRITICAL-by-default alert that deep-links the dispute', async () => {
      const motif = motifsFor('CLIENT')[0]!;
      const prisma = {
        commande: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cmd-1',
            clientUserId: 'client-1',
            repairerUserId: 'rep-1',
            status: 'PAID',
            stripeTransferId: null,
            stripeTransferReversalId: null,
            dispute: null,
          }),
        },
        $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
          fn({ commande: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }),
        ),
      };
      const announcer = { announce: vi.fn().mockResolvedValue(undefined) };
      const service = new DisputesService(prisma as never, announcer as never, alerts as never);

      await service.open('client-1', 'cmd-1', { motif, description: 'Écran toujours fissuré', attachments: [] } as never);

      expect(alerts.raise).toHaveBeenCalledTimes(1);
      expect(alerts.raise.mock.calls[0]![0]).toMatchObject({
        type: 'DISPUTE_NEW',
        targetType: 'Dispute',
        targetId: 'dsp-1',
        link: '/litiges?disputeId=dsp-1',
      });
      expect(alerts.raise.mock.calls[0]![0].title).toContain('14');
    });

    it('still opens the dispute when no alerts service is wired', async () => {
      const motif = motifsFor('CLIENT')[0]!;
      const prisma = {
        commande: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cmd-1', clientUserId: 'client-1', repairerUserId: 'rep-1', status: 'PAID',
            stripeTransferId: null, stripeTransferReversalId: null, dispute: null,
          }),
        },
        $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
          fn({ commande: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }),
        ),
      };
      const service = new DisputesService(prisma as never, { announce: vi.fn() } as never);

      await expect(
        service.open('client-1', 'cmd-1', { motif, description: 'x', attachments: [] } as never),
      ).resolves.toMatchObject({ number: 14 });
    });
  });

  describe('DISPUTE_NEW: Stripe reports a chargeback', () => {
    it('raises an alert for the dispute it upserts', async () => {
      const prisma = {
        commande: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findFirst: vi.fn().mockResolvedValue({ id: 'cmd-9' }),
        },
        dispute: { upsert: vi.fn().mockResolvedValue({ id: 'dsp-9' }) },
      };
      const service = new PaymentsService(prisma as never, {} as never, {} as never, undefined, alerts as never);

      await (service as unknown as { markDisputed(o: Record<string, unknown>): Promise<void> }).markDisputed({
        charge: 'ch_1',
        id: 'dp_1',
      });

      expect(alerts.raise.mock.calls[0]![0]).toMatchObject({
        type: 'DISPUTE_NEW',
        targetType: 'Dispute',
        targetId: 'dsp-9',
        link: '/litiges?disputeId=dsp-9',
      });
    });

    it('raises nothing for a charge that belongs to no commande', async () => {
      const prisma = {
        commande: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn().mockResolvedValue(null) },
        dispute: { upsert: vi.fn() },
      };
      const service = new PaymentsService(prisma as never, {} as never, {} as never, undefined, alerts as never);

      await (service as unknown as { markDisputed(o: Record<string, unknown>): Promise<void> }).markDisputed({
        charge: 'ch_unknown',
        id: 'dp_2',
      });

      expect(alerts.raise).not.toHaveBeenCalled();
    });
  });

  describe('PAYMENT_FAILED: Stripe refuses a transfer to the réparateur', () => {
    const repairerProfile = { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date(), user: {} };

    it('on the stranded-payout path', async () => {
      const prisma = {
        commande: {
          findMany: vi.fn().mockResolvedValue([{ id: 'cmd-s', repairCents: 5000, stripeChargeId: 'ch_s' }]),
          update: vi.fn(),
        },
        connectAccount: { findUnique: vi.fn().mockResolvedValue({ stripeAccountId: 'acct_1' }) },
        user: { findUnique: vi.fn().mockResolvedValue({ banned: false }) },
        repairerProfile: { findUnique: vi.fn().mockResolvedValue(repairerProfile) },
      };
      fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
      fakePayments.createTransfer.mockRejectedValue(new Error('insufficient_funds'));
      const service = new CommandesService(prisma as never, {} as never, {} as never, undefined, alerts as never);

      await service.payoutStrandedCommandes('rep-1');

      expect(alerts.raise.mock.calls[0]![0]).toMatchObject({
        type: 'PAYMENT_FAILED',
        targetType: 'Commande',
        targetId: 'cmd-s',
        link: '/commandes/cmd-s',
      });
      expect(prisma.commande.update).not.toHaveBeenCalled();
    });

    it('on the release path, and the client still gets the refusal', async () => {
      const prisma = {
        commande: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cmd-r', status: 'PAID', step: 'AWAITING_VALIDATION', repairCents: 5000,
            stripeChargeId: 'ch_r', stripeTransferId: null, disputedAt: null, cancellationRequestedAt: null,
            stripeRefundId: null, stripeTransferReversalId: null, clientUserId: 'c', repairerUserId: 'rep-1',
            demandeId: 'd', repairer: { banned: false }, demande: { title: 'iPhone' },
          }),
        },
        connectAccount: { findUnique: vi.fn().mockResolvedValue({ stripeAccountId: 'acct_1' }) },
        repairerProfile: { findUnique: vi.fn().mockResolvedValue(repairerProfile) },
      };
      fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
      fakePayments.findTransferBySource.mockResolvedValue(null);
      fakePayments.createTransfer.mockRejectedValue(new Error('insufficient_funds'));
      const service = new CommandesService(prisma as never, {} as never, {} as never, undefined, alerts as never);

      await expect(service.releaseInternal('cmd-r')).rejects.toThrow();

      expect(alerts.raise.mock.calls[0]![0]).toMatchObject({ type: 'PAYMENT_FAILED', targetId: 'cmd-r' });
    });
  });

  describe('PARCEL_INCIDENT: every shipping ops mail is also an alert', () => {
    it('raises the alert when a Boxtal cancellation is too late', async () => {
      const prisma = {
        commande: {
          findFirst: vi.fn().mockResolvedValue({
            demande: { title: 'iPhone 13' },
            shipments: [{ id: 's-1', leg: 'OUTBOUND', boxtalOrderId: 'bx-1', firstScanAt: null, status: 'ORDERED' }],
          }),
        },
      };
      fakeShipping.cancelOrder.mockResolvedValue('too_late');
      const service = new ShipmentsService(prisma as never, {} as never, {} as never, alerts as never);

      await service.cancelUnshipped('cmd-p');

      expect(alerts.raise.mock.calls[0]![0]).toMatchObject({
        type: 'PARCEL_INCIDENT',
        targetType: 'Commande',
        targetId: 'cmd-p',
        link: '/commandes/cmd-p',
        metadata: { kind: 'CANCEL_FAILED', leg: 'OUTBOUND' },
      });
    });
  });
});
