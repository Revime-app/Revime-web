import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/payments/gateway.js', () => ({ paymentsGateway: () => ({ createTransfer: vi.fn(), retrieveAccount: vi.fn() }) }));

import { AdminPayoutsService } from '../src/admin/admin-payouts.service.js';
import { heldReasonOf, payoutStatusOf } from '../src/admin/payout-status.js';

/**
 * V8 `ISS8-013` (`DEC8-11` (3), `FND8-029`): on « Versements », a payout HELD for the repairer's setup
 * (no Connect account, transfers inactive, fiscal information incomplete) reads as held, never as a
 * failed transfer; « Versements échoués » keeps only transfers that failed while the repairer was payable.
 */

const released = {
  status: 'PAID',
  step: 'RELEASED',
  stripeTransferId: null,
  stripeTransferReversalId: null,
  stripeRefundId: null,
  disputedAt: null,
  stripeChargeId: 'ch_1',
  transferredCents: null,
  totalCents: 6000,
  paidAt: new Date('2026-11-10T10:00:00Z'),
  releasedAt: new Date('2026-11-12T10:00:00Z'),
  createdAt: new Date('2026-11-10T09:00:00Z'),
};

const repairer = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Réparateur',
  email: 'r@rep.fr',
  connectAccount: { stripeAccountId: 'acct_1', transfersActive: true, disabledReason: null },
  repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date('2026-11-01T00:00:00Z') },
  profile: { verificationLevel: 'IDENTITY' },
  businessVerification: null,
  ...over,
});

const row = (id: string, cents: number, rep: ReturnType<typeof repairer>) => ({
  ...released,
  id,
  repairCents: cents,
  repairerUserId: rep.id,
  repairer: rep,
});

const noAccount = row('cmd-noacct', 10000, repairer({ id: 'u-none', name: 'Sans compte', email: 'none@rep.fr', connectAccount: null }));
const inactive = row('cmd-inactive', 3000, repairer({ id: 'u-inact', connectAccount: { stripeAccountId: 'acct_2', transfersActive: false, disabledReason: 'requirements.past_due' } }));
const noFiscal = row('cmd-fiscal', 2000, repairer({ id: 'u-fisc', repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: null } }));
const failed = row('cmd-failed', 4500, repairer({ id: 'u-ok' }));

describe('heldReasonOf / payoutStatusOf', () => {
  it('names why a released payout waits on the repairer, account first', () => {
    expect(heldReasonOf({ hasAccount: false, transfersActive: false, fiscalComplete: false })).toBe('Compte Stripe Connect non créé par le réparateur');
    expect(heldReasonOf({ hasAccount: true, transfersActive: false, fiscalComplete: true })).toBe('Compte Stripe Connect inactif');
    expect(heldReasonOf({ hasAccount: true, transfersActive: true, fiscalComplete: false })).toBe('Informations fiscales du réparateur incomplètes (DAC7)');
    expect(heldReasonOf({ hasAccount: true, transfersActive: true, fiscalComplete: true })).toBeNull();
  });

  it('a released, untransferred payout is HELD when the repairer is not payable, FAILED when he is', () => {
    expect(payoutStatusOf(released, false)).toBe('HELD');
    expect(payoutStatusOf(released, true)).toBe('FAILED');
    expect(payoutStatusOf(released)).toBe('FAILED');
    expect(payoutStatusOf({ ...released, step: 'REPAIR_STARTED' }, false)).toBe('PENDING');
  });
});

describe('AdminPayoutsService on held payouts', () => {
  let prisma: any;
  let service: AdminPayoutsService;

  beforeEach(() => {
    prisma = {
      commande: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
      connectAccount: { findMany: vi.fn(), count: vi.fn() },
    };
    service = new AdminPayoutsService(prisma, { sendFiscalReminders: vi.fn() } as never, { send: vi.fn() } as never);
  });

  it('lists each held payout as HELD with its reason and no retry', async () => {
    prisma.commande.findMany.mockResolvedValue([noAccount, inactive, noFiscal, failed]);
    prisma.commande.count.mockResolvedValue(4);
    const res = await service.listPayouts({ status: 'ALL', period: 'all', page: 1, limit: 25 });
    expect(res.items.map((i) => [i.id, i.status, i.canRetry])).toEqual([
      ['cmd-noacct', 'HELD', false],
      ['cmd-inactive', 'HELD', false],
      ['cmd-fiscal', 'HELD', false],
      ['cmd-failed', 'FAILED', true],
    ]);
    expect(res.items[0]!.failureReason).toBe('Compte Stripe Connect non créé par le réparateur');
    expect(res.items[1]!.failureReason).toBe('Compte Stripe Connect inactif');
  });

  it('the HELD filter returns only held payouts, counted and paged on what it returns', async () => {
    prisma.commande.findMany.mockResolvedValue([noAccount, inactive, noFiscal, failed]);
    const res = await service.listPayouts({ status: 'HELD', period: 'all', page: 1, limit: 2 });
    expect(res.total).toBe(3);
    expect(res.totalPages).toBe(2);
    expect(res.items.map((i) => i.id)).toEqual(['cmd-noacct', 'cmd-inactive']);
    expect(prisma.commande.findMany.mock.calls[0][0].where).toMatchObject({ status: 'PAID', step: 'RELEASED', stripeTransferId: null });
  });

  it('the FAILED filter keeps only transfers that failed while the repairer was payable', async () => {
    prisma.commande.findMany.mockResolvedValue([noAccount, inactive, noFiscal, failed]);
    const res = await service.listPayouts({ status: 'FAILED', period: 'all', page: 1, limit: 25 });
    expect(res.total).toBe(1);
    expect(res.items.map((i) => i.id)).toEqual(['cmd-failed']);
  });

  it('the tiles split held from failed, and count the no-account repairer as incomplete', async () => {
    prisma.commande.aggregate.mockResolvedValueOnce({ _sum: { transferredCents: 1000 } }).mockResolvedValueOnce({ _sum: { repairCents: 500 } });
    prisma.commande.findMany.mockResolvedValue([noAccount, inactive, noFiscal, failed]);
    prisma.connectAccount.count.mockResolvedValue(1);
    const kpis = await service.getPayoutKpis();
    expect(kpis).toEqual({
      totalTransferredCents: 1000,
      pendingEscrowCents: 500,
      failedTransfersCount: 1,
      heldPayoutsCount: 3,
      heldPayoutsCents: 15000,
      incompleteAccountsCount: 2,
    });
  });

  it('« Comptes Stripe incomplets » also lists a repairer with held payouts and no account', async () => {
    prisma.connectAccount.findMany.mockResolvedValue([
      {
        id: 'ca-2', userId: 'u-inact', stripeAccountId: 'acct_2', status: 'PENDING', transfersActive: false,
        disabledReason: 'requirements.past_due', createdAt: new Date('2026-11-01T00:00:00Z'), lastSyncedAt: null,
        user: { id: 'u-inact', name: 'Inactif', email: 'i@rep.fr' },
      },
    ]);
    prisma.commande.groupBy.mockResolvedValue([{ repairerUserId: 'u-inact', _count: { id: 1 }, _sum: { repairCents: 3000 } }]);
    prisma.commande.findMany.mockResolvedValue([noAccount, { ...noAccount, id: 'cmd-noacct-2', repairCents: 500 }]);
    const res = await service.listIncompleteConnectAccounts({ page: 1, limit: 25 });
    expect(res.total).toBe(2);
    expect(res.items[0]).toMatchObject({
      id: 'no-account-u-none',
      userId: 'u-none',
      repairerName: 'Sans compte',
      stripeAccountId: null,
      status: null,
      transfersActive: false,
      pendingPayoutsCount: 2,
      pendingPayoutsTotalCents: 10500,
    });
    expect(res.items[1]!.userId).toBe('u-inact');
    expect(prisma.commande.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'PAID',
      step: 'RELEASED',
      stripeTransferId: null,
      repairer: { connectAccount: { is: null } },
    });
  });
});
