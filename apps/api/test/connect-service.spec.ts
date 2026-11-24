import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConnectService } from '../src/connect/connect.service.js';
import { __resetConnectGateway, connectGateway, FakeConnectGateway } from '../src/connect/gateway.js';

describe('ConnectService.startOnboarding', () => {
  beforeEach(() => {
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConnectGateway();
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_sample';
  });

  it('returns clientSecret, publishableKey, and url on successful onboarding start', async () => {
    const mockPrisma = {
      profile: {
        findFirst: async () => ({ repairerEnabled: true }),
      },
      connectAccount: {
        findUnique: async () => ({ stripeAccountId: 'acct_fake_test' }),
      },
      user: {
        findUniqueOrThrow: async () => ({ email: 'test@example.com' }),
      },
    } as any;

    const mockCommandes = {} as any;
    const service = new ConnectService(mockPrisma, mockCommandes);

    const result = await service.startOnboarding('user_123');
    expect(result.clientSecret).toMatch(/^acc_sess_fake_/);
    expect(result.publishableKey).toBe('pk_test_sample');
    expect(result.url).toContain('fake_onboarding=acct_fake_test');
  });
});

describe('ConnectService.syncAccount, the payout IBAN (CMP-D4)', () => {
  beforeEach(() => {
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConnectGateway();
  });

  async function sync(ibanLast4: string | null, ibanFingerprint: string | null = null) {
    const gateway = connectGateway() as FakeConnectGateway;
    const { id } = await gateway.createAccount({ email: 'r@example.com' });
    if (ibanLast4) gateway.markIbanLast4(id, ibanLast4);
    if (ibanFingerprint) gateway.markIbanFingerprint(id, ibanFingerprint);
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      connectAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ca-1', userId: 'u-1', transfersActive: false }),
        update,
      },
    } as any;
    const service = new ConnectService(prisma, { payoutStrandedCommandes: vi.fn() } as any);
    await (service as any).syncAccount(id);
    return update.mock.calls[0]![0].data as Record<string, unknown>;
  }

  it('stores the last four of the IBAN Stripe reports, for the DAC7 export', async () => {
    expect(await sync('0412')).toMatchObject({ ibanLast4: '0412' });
  });

  it('does not overwrite a known IBAN with « none » when Stripe reports no bank account', async () => {
    const data = await sync(null);
    expect(data).not.toHaveProperty('ibanLast4');
    expect(data).not.toHaveProperty('ibanFingerprint');
  });

  it("stores Stripe's fingerprint of the bank account, for the duplicate-IBAN alert (RU-29)", async () => {
    expect(await sync('0412', 'fp_abc')).toMatchObject({ ibanLast4: '0412', ibanFingerprint: 'fp_abc' });
  });
});

/**
 * V8 ISS8-010 (a), the trigger half. A réparateur with no Connect account has his payout HELD (V8 B2);
 * what pays it is this: a new `ConnectAccount` row starts with `transfersActive` false, so the first
 * `account.updated` that reports transfers active fires `payoutStrandedCommandes` for him. That claim
 * rested on reading the code (§4 B2 « Test coverage »). The payout itself is tested in
 * `v8-iss8-010-b2-held-payout.spec.ts`.
 */
describe('ConnectService.syncAccount, paying held orders on the first activation (V8 ISS8-010)', () => {
  beforeEach(() => {
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConnectGateway();
  });

  async function syncWith(rowTransfersActive: boolean, stripeTransfersActive: boolean) {
    const gateway = connectGateway() as FakeConnectGateway;
    const { id } = await gateway.createAccount({ email: 'r@example.com' });
    if (stripeTransfersActive) gateway.markVerified(id);
    const prisma = {
      connectAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ca-1', userId: 'u-1', transfersActive: rowTransfersActive }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;
    const payoutStrandedCommandes = vi.fn().mockResolvedValue({ paid: 1, failed: 0 });
    const service = new ConnectService(prisma, { payoutStrandedCommandes } as any);
    await (service as any).syncAccount(id);
    return { payoutStrandedCommandes, update: prisma.connectAccount.update };
  }

  it('pays the réparateur\'s held orders when a new account is first reported active', async () => {
    const { payoutStrandedCommandes, update } = await syncWith(false, true);

    expect(update.mock.calls[0]![0].data).toMatchObject({ transfersActive: true });
    expect(payoutStrandedCommandes).toHaveBeenCalledTimes(1);
    expect(payoutStrandedCommandes).toHaveBeenCalledWith('u-1');
  });

  it('does not try to pay while Stripe still reports transfers inactive', async () => {
    const { payoutStrandedCommandes } = await syncWith(false, false);

    expect(payoutStrandedCommandes).not.toHaveBeenCalled();
  });

  it('does not fire again on a later update of an account that was already active (the cron sweep covers retries)', async () => {
    const { payoutStrandedCommandes } = await syncWith(true, true);

    expect(payoutStrandedCommandes).not.toHaveBeenCalled();
  });
});
