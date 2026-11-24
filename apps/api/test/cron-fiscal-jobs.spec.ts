import { describe, expect, it, vi } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import { promoteToBusinessIfEligible } from '../src/verification/promote-business.js';

/**
 * CMP-D3. The two fiscal jobs the cron runs: the reminders (whose failures used to be reported as
 * `failed: 0` whatever happened) and the held-payout sweep (which did not exist: an order held for
 * missing fiscal information waited for a trigger that fires once and swallows a Stripe outage).
 */

function cronWith(parts: { fiscal?: object; commandes?: object }) {
  return new CronService(
    {} as never,
    (parts.commandes ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (parts.fiscal ?? {}) as never, {} as never,
  );
}

describe('CronService, fiscal jobs', () => {
  it('fiscalReminders reports the failures the sweep counted instead of a hard-coded zero', async () => {
    const sendFiscalReminders = vi
      .fn()
      .mockResolvedValue({ scanned: 5, reminded1: 2, reminded2: 1, frozen: 1, failed: 3 });
    const cron = cronWith({ fiscal: { sendFiscalReminders } });

    expect(await cron.fiscalReminders()).toEqual({ scanned: 5, acted: 3, failed: 3 });
  });

  it('run() includes the held-payout sweep and wires it to CommandesService', async () => {
    const payoutHeldCommandes = vi.fn().mockResolvedValue({ scanned: 2, acted: 1, failed: 0 });
    const cron = cronWith({ commandes: { payoutHeldCommandes } });
    // Run only the sweep's body; every other job is recorded by name and skipped.
    const names: string[] = [];
    vi.spyOn(cron as never as { guard: (...a: unknown[]) => unknown }, 'guard').mockImplementation(
      async (job: unknown, body: unknown) => {
        names.push(job as string);
        if (job === 'heldPayouts') return { job, error: null, ...(await (body as () => Promise<object>)()) };
        return { job, error: null, scanned: 0, acted: 0, failed: 0 };
      },
    );

    const res = await cron.run();

    expect(names).toEqual(expect.arrayContaining(['fiscalReminders', 'heldPayouts']));
    expect(res.jobs.find((j) => j.job === 'heldPayouts')).toMatchObject({ scanned: 2, acted: 1, failed: 0 });
    expect(payoutHeldCommandes).toHaveBeenCalledTimes(1);
  });
});

describe('promoteToBusinessIfEligible, the fiscal stamp (CMP-D3)', () => {
  const APPROVED = { status: 'APPROVED', verifiedAt: new Date() };

  function prismaFor(promotedCount: number) {
    return {
      businessVerification: { findUnique: vi.fn().mockResolvedValue(APPROVED) },
      profile: { updateMany: vi.fn().mockResolvedValue({ count: promotedCount }) },
      repairerProfile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it('stamps a PRO when THIS call promoted him', async () => {
    const prisma = prismaFor(1);

    await promoteToBusinessIfEligible(prisma as never, 'u1');

    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', kind: 'PRO', fiscalCompletedAt: null },
      data: { fiscalCompletedAt: expect.any(Date) },
    });
  });

  it('does not stamp when the promotion matched nothing (a revoked account, or already promoted)', async () => {
    const prisma = prismaFor(0);

    await promoteToBusinessIfEligible(prisma as never, 'u1');

    // V7 D4: the `kind = PRO` write runs on every approval, so assert on the stamp's data, not on
    // `updateMany` never being called.
    expect(prisma.repairerProfile.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { fiscalCompletedAt: expect.any(Date) } }),
    );
  });
});
