import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { __resetIdentityGateway } from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * CF4-01 - Property 1: Bug Condition.
 * « Unverified accounts can enable réparateur mode and reach verification. »
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.3**
 *
 * 🛑 EXPLORATION TEST: written against the EXPECTED behaviour, so it FAILS on the unfixed code.
 * On unfixed code, `updateModes` refuses every case below with FORBIDDEN « Vérifiez votre
 * identité pour devenir réparateur. » (assertIdentityVerified(…, 'become')), and
 * `IdentityService.start` refuses a NONE account with CONTACT_UNVERIFIED even when both of its
 * contacts are verified. Mocked Prisma only - no database.
 *
 * Every row satisfies isBugCondition_CF401: authenticated, `repairerSuspendedAt = null`,
 * `repairerEnabled = false`, request `repairerEnabled = true`, identity floor not met.
 */

type Level = 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
type Kind = 'INDIVIDUAL' | 'PRO';

const clientProfile = (level: Level) => ({
  repairerEnabled: false,
  clientEnabled: true,
  activeMode: 'CLIENT' as const,
  repairerSuspendedAt: null,
  onboardingCompletedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  verificationLevel: level,
});

/** Same harness shape as repairer-suspension-enforcement.spec.ts's `makeUsers`. */
const makeUsers = (level: Level, existingKind: Kind | null) => {
  const profile = clientProfile(level);
  const txMocks = {
    profileUpdate: vi.fn().mockResolvedValue({}),
    userFind: vi.fn().mockResolvedValue({ username: 'camille' }),
    repairerUpsert: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    profile: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(profile),
      findFirst: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'u1',
        username: 'camille',
        email: 'camille@example.com',
        createdAt: new Date(),
        profile: [profile],
      }),
    },
    repairerProfile: {
      // A former réparateur who turned the mode off keeps his RepairerProfile row (and kind).
      findUnique: vi.fn().mockResolvedValue(existingKind ? { kind: existingKind } : null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((cb: (t: unknown) => Promise<unknown>) =>
      cb({
        profile: { update: txMocks.profileUpdate },
        user: { findUniqueOrThrow: txMocks.userFind },
        repairerProfile: { upsert: txMocks.repairerUpsert },
      }),
    ),
  };
  const service = new UsersService(prisma as never, undefined as never);
  vi.spyOn(service, 'me').mockResolvedValue({} as never);
  return { service, txMocks };
};

describe('CF4-01 Property 1 (bug condition): enabling réparateur mode is not gated on identity', () => {
  const cases: Array<{
    name: string;
    level: Level;
    existingKind: Kind | null;
    input: { repairerEnabled: true; activeMode?: 'REPAIRER'; kind?: Kind };
  }> = [
    {
      name: 'level BASIC, { repairerEnabled: true, activeMode: REPAIRER }',
      level: 'BASIC',
      existingKind: null,
      input: { repairerEnabled: true, activeMode: 'REPAIRER' },
    },
    {
      name: 'level NONE, { repairerEnabled: true, activeMode: REPAIRER }',
      level: 'NONE',
      existingKind: null,
      input: { repairerEnabled: true, activeMode: 'REPAIRER' },
    },
    {
      // PRO needs BUSINESS; IDENTITY is below the PRO floor.
      name: 'kind PRO at level IDENTITY, { repairerEnabled: true, activeMode: REPAIRER, kind: PRO }',
      level: 'IDENTITY',
      existingKind: 'PRO',
      input: { repairerEnabled: true, activeMode: 'REPAIRER', kind: 'PRO' },
    },
  ];

  it.each(cases)('$name → succeeds and writes repairerEnabled = true', async ({ level, existingKind, input }) => {
    const { service, txMocks } = makeUsers(level, existingKind);

    await expect(service.updateModes('u1', input)).resolves.toBeDefined();

    expect(txMocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: expect.objectContaining({ repairerEnabled: true, activeMode: 'REPAIRER' }),
    });
    expect(txMocks.repairerUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('CF4-01 Property 1 (bug condition, contact): a NONE account with both contacts verified can start identity', () => {
  beforeEach(() => {
    // Same environment as identity-variant.spec.ts: Connect on, fake Stripe gateway.
    __resetIdentityGateway();
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('promotes NONE → BASIC and returns a session url instead of CONTACT_UNVERIFIED', async () => {
    // Mutable level: promoteToBasicIfEligible's updateMany moves the row to BASIC.
    const state: { level: Level } = { level: 'NONE' };
    const prisma = {
      user: {
        // Both contacts verified; email null so the welcome mail is not attempted.
        findUnique: vi.fn().mockResolvedValue({
          email: null,
          name: 'Camille',
          emailVerified: true,
          phoneVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      },
      profile: {
        findFirst: vi.fn(async () => ({ verificationLevel: state.level })),
        updateMany: vi.fn(async (args: { where: { verificationLevel?: Level } }) => {
          if (args.where.verificationLevel === 'NONE' && state.level === 'NONE') {
            state.level = 'BASIC';
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      identityVerification: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new IdentityService(prisma as unknown as PrismaService, { emit: vi.fn() } as never);

    const result = await service.start('u1', { variant: 'DOCUMENT_AND_SELFIE' });

    expect(result.url).toEqual(expect.any(String));
    expect(result.url.length).toBeGreaterThan(0);
    expect(state.level).toBe('BASIC');
  });
});
