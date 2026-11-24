import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  COOLDOWN_SECONDS,
  MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY,
  MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY,
  MAX_SENDS_PER_PHONE_PER_DAY,
  MAX_SENDS_PER_USER_PER_DAY,
  checkLimit,
  checkRegistryLimit,
} from '../src/verification/rate-limit.js';
import { createTestApp } from './create-test-app.js';
import { signUp, uniquePhone } from './helpers.js';

describe('verification rate limit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  /** Backdates rows, so a cooldown test does not have to wait 60 real seconds. */
  const seed = (
    userId: string,
    target: string,
    outcome: 'SENT' | 'BLOCKED',
    secondsAgo: number,
  ) =>
    prisma.verificationAttempt.create({
      data: {
        userId,
        target,
        channel: 'SMS',
        outcome,
        createdAt: new Date(Date.now() - secondsAgo * 1000),
      },
    });

  const newUser = async () => {
    const { email } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('allows a first attempt with no history', async () => {
    const user = await newUser();
    const verdict = await checkLimit(prisma, { userId: user.id, phone: uniquePhone() });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses a second attempt inside the cooldown and reports the wait', async () => {
    const user = await newUser();
    const phone = uniquePhone();
    await seed(user.id, phone, 'SENT', 10);

    const verdict = await checkLimit(prisma, { userId: user.id, phone });

    expect(verdict).toMatchObject({ allowed: false, reason: 'cooldown' });
    if (verdict.allowed) throw new Error('unreachable');
    // 60 minus the 10 seconds already elapsed, give or take clock drift.
    expect(verdict.retryAfterSeconds).toBeGreaterThan(40);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(COOLDOWN_SECONDS);
  });

  it('counts a BLOCKED row toward the cooldown so a blocked user cannot hammer for free', async () => {
    const user = await newUser();
    const phone = uniquePhone();
    await seed(user.id, phone, 'BLOCKED', 5);

    const verdict = await checkLimit(prisma, { userId: user.id, phone });
    expect(verdict).toMatchObject({ allowed: false, reason: 'cooldown' });
  });

  it('excludes BLOCKED rows from the daily cap so a block cannot eat the budget', async () => {
    const user = await newUser();
    const phone = uniquePhone();
    // Five blocked rows is the daily cap in volume but zero in money. All are
    // outside the cooldown window, so only the daily rule can decide this.
    for (let i = 0; i < MAX_SENDS_PER_USER_PER_DAY; i++) {
      await seed(user.id, phone, 'BLOCKED', 3600 + i);
    }

    const verdict = await checkLimit(prisma, { userId: user.id, phone });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses once the day holds five SENT rows for this user', async () => {
    const user = await newUser();
    const phone = uniquePhone();
    for (let i = 0; i < MAX_SENDS_PER_USER_PER_DAY; i++) {
      await seed(user.id, phone, 'SENT', 3600 + i);
    }

    const verdict = await checkLimit(prisma, { userId: user.id, phone });
    expect(verdict).toMatchObject({ allowed: false, reason: 'user_daily' });
  });

  it('ignores SENT rows older than the trailing day', async () => {
    const user = await newUser();
    const phone = uniquePhone();
    for (let i = 0; i < MAX_SENDS_PER_USER_PER_DAY; i++) {
      await seed(user.id, phone, 'SENT', 90_000 + i); // just over 24h
    }

    const verdict = await checkLimit(prisma, { userId: user.id, phone });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses a phone that other accounts have already burned ten sends on', async () => {
    const victim = await newUser();
    const attacker = await newUser();
    const phone = uniquePhone();
    // Ten SENT rows on this number from another account. The victim is well
    // under their own per-user cap, so only the per-phone rule can refuse.
    for (let i = 0; i < MAX_SENDS_PER_PHONE_PER_DAY; i++) {
      await seed(attacker.id, phone, 'SENT', 3600 + i);
    }

    const verdict = await checkLimit(prisma, { userId: victim.id, phone });
    expect(verdict).toMatchObject({ allowed: false, reason: 'phone_daily' });
  });

  describe('checkRegistryLimit', () => {
    /**
     * A nine-digit SIREN, unique per call, for the same reason `uniquePhone` exists.
     *
     * A shared constant is not merely untidy here, it is wrong: the per-SIREN rule
     * counts by `target` across ALL accounts, so one test seeding twenty rows on a
     * shared number makes every later test in the file trip `siren_daily` instead of
     * the rule it meant to prove. Found by exactly that failure. It also survives an
     * interrupted earlier run, whose rows are not cleaned up.
     *
     * No Luhn constraint applies: `target` is a ledger value, and validating the
     * identifier is the schema's job, one layer up.
     *
     * Random rather than a counter, and the residual risk is stated rather than
     * hidden: two calls in one run could collide at roughly one chance in 60 million
     * across the ~15 calls this file makes. A collision would produce a spurious
     * FAILURE, never a false pass, which is the safe direction for this to break in.
     */
    const uniqueSiren = (): string =>
      `${Math.floor(Math.random() * 9e8 + 1e8)}`;

    /**
     * A registry attempt row. Backdated like its SMS sibling, so the trailing-window
     * case does not have to wait a day.
     *
     * Note the outcomes: there is no SENT here and there never will be. That outcome
     * means "dispatched, and therefore billed", and a registry lookup costs nothing.
     */
    const registrySeed = (
      userId: string,
      target: string,
      outcome: 'APPROVED' | 'REJECTED' | 'FAILED' | 'BLOCKED',
      secondsAgo = 60,
    ) =>
      prisma.verificationAttempt.create({
        data: {
          userId,
          target,
          channel: 'REGISTRY',
          outcome,
          createdAt: new Date(Date.now() - secondsAgo * 1000),
        },
      });

    it('allows a first lookup with no history', async () => {
      const user = await newUser();
      expect(await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() })).toEqual({
        allowed: true,
      });
    });

    it('has no cooldown, because a typo is refused locally at no cost', async () => {
      // Its SMS sibling refuses a second attempt within 60 seconds. Here a mistyped
      // number never reaches the registry - the Luhn check rejects it with no call and
      // no row - so a cooldown would only punish the honest correction path.
      const user = await newUser();
      const siren = uniqueSiren();
      await registrySeed(user.id, siren, 'REJECTED', 1);
      expect(await checkRegistryLimit(prisma, { userId: user.id, siren })).toEqual({
        allowed: true,
      });
    });

    it('refuses the eleventh lookup by one user in a day', async () => {
      const user = await newUser();
      for (let i = 0; i < MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY; i++) {
        await registrySeed(user.id, uniqueSiren(), 'REJECTED', 3600 + i);
      }
      const verdict = await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() });
      expect(verdict).toMatchObject({ allowed: false, reason: 'user_daily' });
    });

    it('counts every outcome that REACHED the registry, not just one of them', async () => {
      // The cap cannot count SENT the way checkLimit does - nothing is dispatched on
      // this channel - so it counts what actually consumed a lookup instead.
      const user = await newUser();
      const outcomes = ['APPROVED', 'REJECTED', 'FAILED'] as const;
      for (let i = 0; i < MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY; i++) {
        await registrySeed(user.id, uniqueSiren(), outcomes[i % 3]!, 3600 + i);
      }
      const verdict = await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() });
      expect(verdict).toMatchObject({ allowed: false, reason: 'user_daily' });
    });

    it('excludes BLOCKED rows, so a refusal cannot consume the budget it refused', async () => {
      // checkLimit's amplification reasoning: otherwise causing blocks exhausts the
      // victim's own quota, which hands an attacker free leverage.
      const user = await newUser();
      for (let i = 0; i < MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY + 5; i++) {
        await registrySeed(user.id, uniqueSiren(), 'BLOCKED', 3600 + i);
      }
      expect(await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() })).toEqual({
        allowed: true,
      });
    });

    it('ignores registry rows older than the trailing day', async () => {
      const user = await newUser();
      for (let i = 0; i < MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY; i++) {
        await registrySeed(user.id, uniqueSiren(), 'REJECTED', 90_000 + i); // just over 24h
      }
      expect(await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() })).toEqual({
        allowed: true,
      });
    });

    it('refuses a SIREN that another account has already burned twenty lookups on', async () => {
      // Two accounts, not twenty-one: the per-SIREN rule counts by `target` regardless
      // of who looked, so one attacker's rows are enough and the victim stays well
      // under their own cap - which is what makes this test prove the SIREN rule
      // rather than the user rule. Same shape as the per-phone case above.
      const victim = await newUser();
      const attacker = await newUser();
      const siren = uniqueSiren();
      for (let i = 0; i < MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY; i++) {
        await registrySeed(attacker.id, siren, 'REJECTED', 3600 + i);
      }
      const verdict = await checkRegistryLimit(prisma, { userId: victim.id, siren });
      expect(verdict).toMatchObject({ allowed: false, reason: 'siren_daily' });
    });

    it('caps a SIREN at DOUBLE the per-user cap, so one account cannot lock a company out', async () => {
      // checkLimit's phone reasoning reused rather than re-invented: at parity, one
      // hostile account could spend a real company's whole daily budget and stop its
      // owner ever verifying it.
      expect(MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY).toBe(
        MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY * 2,
      );
    });

    it('ignores SMS rows entirely, so the two ledgers cannot starve each other', async () => {
      const user = await newUser();
      for (let i = 0; i < MAX_SENDS_PER_PHONE_PER_DAY + 2; i++) {
        await seed(user.id, uniquePhone(), 'SENT', 3600 + i);
      }
      expect(await checkRegistryLimit(prisma, { userId: user.id, siren: uniqueSiren() })).toEqual({
        allowed: true,
      });
    });
  });
});
