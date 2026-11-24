import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIdentityVerified } from '../src/verification/gate.js';
import { UsersService } from '../src/users/users.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { FakeIdentityGateway, identityGateway, __resetIdentityGateway } from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * CF4-01 — Property 2: Preservation. Gates, modes and suspension OUTSIDE C(X) unchanged.
 *
 * Observation-first: every expectation below was recorded against the UNFIXED code (become gate
 * still present) and must stay green after the fix. Nothing here exercises C(X) - a non-suspended
 * account going repairerEnabled false -> true below the identity floor - and nothing asserts on
 * the 'become' path, which the fix removes. Exhaustive tables stand in for fast-check (not a
 * dependency of apps/api). Mocked Prisma, no database.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

type Level = 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
type Kind = 'INDIVIDUAL' | 'PRO' | null;
type Mode = 'CLIENT' | 'REPAIRER';

const LEVELS: Level[] = ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS'];
const KINDS: Kind[] = ['INDIVIDUAL', 'PRO', null];
const OFFER_FR = 'Vérifiez votre identité pour envoyer une offre.';
const BUSINESS_FR = 'Faites vérifier votre entreprise dans « Mon entreprise » pour envoyer une offre.';
const SUSPENDED_FR = 'Votre compte réparateur est suspendu.';
const AT_LEAST_ONE_FR = 'Au moins un mode doit rester activé.';
const ENABLE_FIRST_FR = "Activez d'abord le mode réparateur.";

/** Floor observed on unfixed code: PRO needs BUSINESS; anyone else needs IDENTITY or BUSINESS. */
const floorMet = (level: Level, kind: Kind) =>
  kind === 'PRO' ? level === 'BUSINESS' : level === 'IDENTITY' || level === 'BUSINESS';

// ---------------------------------------------------------------------------------------------
// 3.1 / 3.4 — the offer gate
// ---------------------------------------------------------------------------------------------

describe("CF4-01 preservation: assertIdentityVerified(…, 'offer') over level × kind", () => {
  const cases = LEVELS.flatMap((level) => KINDS.map((kind) => ({ level, kind })));

  it.each(cases)('level $level, kind $kind', async ({ level, kind }) => {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ verificationLevel: level }) },
      repairerProfile: { findUnique: vi.fn().mockResolvedValue(kind ? { kind } : null) },
      businessVerification: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const run = assertIdentityVerified(prisma as never, 'u1', 'offer');
    if (floorMet(level, kind)) {
      await expect(run).resolves.toBeUndefined();
    } else {
      const err = await run.catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('FORBIDDEN');
      // V7 A3: a PRO whose identity is verified is now told about the business step instead
      // (v7-u1-offer-gate.spec.ts). The floor itself is unchanged.
      expect((err as Error).message).toBe(kind === 'PRO' && level === 'IDENTITY' ? BUSINESS_FR : OFFER_FR);
    }
  });

  it('a missing profile reads as NONE and is refused', async () => {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue(null) },
      repairerProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      businessVerification: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    await expect(assertIdentityVerified(prisma as never, 'u1', 'offer')).rejects.toThrow(OFFER_FR);
  });
});

// ---------------------------------------------------------------------------------------------
// updateModes harness (same shape as repairer-suspension-enforcement.spec.ts)
// ---------------------------------------------------------------------------------------------

type ProfileRow = {
  repairerEnabled: boolean;
  clientEnabled: boolean;
  activeMode: Mode;
  repairerSuspendedAt: Date | null;
  onboardingCompletedAt: Date | null;
  deletedAt: null;
  verificationLevel: Level;
};

const baseRow: ProfileRow = {
  repairerEnabled: true,
  clientEnabled: true,
  activeMode: 'CLIENT',
  repairerSuspendedAt: null,
  onboardingCompletedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  verificationLevel: 'BASIC',
};

function makeUsers(profile: ProfileRow, kind: Kind = null) {
  const tx = {
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
    repairerProfile: {
      findUnique: vi.fn().mockResolvedValue(kind ? { kind } : null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((cb: (t: unknown) => Promise<unknown>) =>
      cb({
        profile: { update: tx.profileUpdate },
        user: { findUniqueOrThrow: tx.userFind },
        repairerProfile: { upsert: tx.repairerUpsert },
      }),
    ),
  };
  const service = new UsersService(prisma as never, undefined as never);
  vi.spyOn(service, 'me').mockResolvedValue({} as never);
  return { service, tx };
}

// ---------------------------------------------------------------------------------------------
// 3.2 — suspension
// ---------------------------------------------------------------------------------------------

describe('CF4-01 preservation: a suspended réparateur', () => {
  const suspendedAt = new Date('2026-09-03T10:00:00.000Z');
  const requests = [
    { repairerEnabled: true },
    { repairerEnabled: true, activeMode: 'REPAIRER' as const },
    { repairerEnabled: true, activeMode: 'CLIENT' as const },
    { repairerEnabled: true, activeMode: 'REPAIRER' as const, kind: 'PRO' as const },
  ];

  // Floor met, so on unfixed code the become gate passes and the suspension guard is what answers.
  const floorCases = LEVELS.flatMap((level) =>
    KINDS.filter((kind) => floorMet(level, kind)).flatMap((kind) =>
      requests.map((request) => ({ level, kind, request })),
    ),
  );

  it.each(floorCases)(
    'false -> true refused with REPAIRER_SUSPENDED (level $level, kind $kind, $request)',
    async ({ level, kind, request }) => {
      const { service, tx } = makeUsers(
        { ...baseRow, repairerEnabled: false, activeMode: 'CLIENT', repairerSuspendedAt: suspendedAt, verificationLevel: level },
        kind,
      );
      const err = await service.updateModes('u1', request).catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('FORBIDDEN');
      expect((err as Error).message).toBe(SUSPENDED_FR);
      expect(tx.profileUpdate).not.toHaveBeenCalled();
      expect(tx.repairerUpsert).not.toHaveBeenCalled();
    },
  );

  // Below the floor, unfixed code answers with the identity sentence and the fix with the
  // suspension sentence. What must hold on both: a FORBIDDEN refusal and nothing written.
  const belowFloorCases = LEVELS.flatMap((level) =>
    KINDS.filter((kind) => !floorMet(level, kind)).map((kind) => ({ level, kind })),
  );

  it.each(belowFloorCases)(
    'false -> true below the floor is still refused and writes nothing (level $level, kind $kind)',
    async ({ level, kind }) => {
      const { service, tx } = makeUsers(
        { ...baseRow, repairerEnabled: false, activeMode: 'CLIENT', repairerSuspendedAt: suspendedAt, verificationLevel: level },
        kind,
      );
      const err = await service.updateModes('u1', { repairerEnabled: true }).catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('FORBIDDEN');
      expect(tx.profileUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(LEVELS)('switching to CLIENT still succeeds (level %s)', async (level) => {
    const { service, tx } = makeUsers({
      ...baseRow, activeMode: 'REPAIRER', repairerSuspendedAt: suspendedAt, verificationLevel: level,
    });
    await service.updateModes('u1', { activeMode: 'CLIENT' });
    expect(tx.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { clientEnabled: true, repairerEnabled: true, activeMode: 'CLIENT' },
    });
  });

  it.each(LEVELS)('turning the mode OFF still succeeds (level %s)', async (level) => {
    const { service, tx } = makeUsers({
      ...baseRow, activeMode: 'REPAIRER', repairerSuspendedAt: suspendedAt, verificationLevel: level,
    });
    await service.updateModes('u1', { repairerEnabled: false, activeMode: 'CLIENT' });
    expect(tx.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { clientEnabled: true, repairerEnabled: false, activeMode: 'CLIENT' },
    });
    expect(tx.repairerUpsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// 3.3 / 3.5 — mode switching with no repairer false -> true transition
// ---------------------------------------------------------------------------------------------

describe('CF4-01 preservation: updateModes outside the false -> true transition', () => {
  const bools = [true, false];
  const modes: Mode[] = ['CLIENT', 'REPAIRER'];
  const optBools = [undefined, true, false];
  const optModes = [undefined, 'CLIENT', 'REPAIRER'] as const;
  const suspensions = [null, new Date('2026-09-03T10:00:00.000Z')];

  type Case = {
    cur: { repairerEnabled: boolean; clientEnabled: boolean; activeMode: Mode };
    req: { repairerEnabled?: boolean; clientEnabled?: boolean; activeMode?: Mode };
    suspendedAt: Date | null;
    level: Level;
  };

  const cases: Case[] = [];
  for (const r of bools) for (const c of bools) for (const m of modes)
    for (const qr of optBools) for (const qc of optBools) for (const qm of optModes)
      for (const suspendedAt of suspensions) for (const level of ['NONE', 'IDENTITY'] as Level[]) {
        const resolvedR = qr ?? r;
        if (!r && resolvedR) continue; // false -> true: excluded (C(X) and its suspended sibling)
        const req: Case['req'] = {};
        if (qr !== undefined) req.repairerEnabled = qr;
        if (qc !== undefined) req.clientEnabled = qc;
        if (qm !== undefined) req.activeMode = qm;
        cases.push({ cur: { repairerEnabled: r, clientEnabled: c, activeMode: m }, req, suspendedAt, level });
      }

  it('the table covers every combination outside the transition', () => {
    // 8 current states × 27 requests = 216, minus the 4×9 false -> true, × 2 suspensions × 2 levels
    expect(cases).toHaveLength((216 - 36) * 2 * 2);
  });

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))('%s', async (_label, { cur, req, suspendedAt, level }) => {
    const { service, tx } = makeUsers({ ...baseRow, ...cur, repairerSuspendedAt: suspendedAt, verificationLevel: level });

    // Oracle recorded from the unfixed updateModes.
    const clientEnabled = req.clientEnabled ?? cur.clientEnabled;
    const repairerEnabled = req.repairerEnabled ?? cur.repairerEnabled;
    const activeMode = req.activeMode ?? cur.activeMode;

    const run = service.updateModes('u1', req);
    if (!clientEnabled && !repairerEnabled) {
      const err = await run.catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('UNPROCESSABLE_ENTITY');
      expect((err as Error).message).toBe(AT_LEAST_ONE_FR);
      expect(tx.profileUpdate).not.toHaveBeenCalled();
      return;
    }
    if (activeMode === 'REPAIRER' && !repairerEnabled) {
      const err = await run.catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('UNPROCESSABLE_ENTITY');
      expect((err as Error).message).toBe(ENABLE_FIRST_FR);
      expect(tx.profileUpdate).not.toHaveBeenCalled();
      return;
    }
    await run;
    expect(tx.profileUpdate).toHaveBeenCalledTimes(1);
    expect(tx.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { clientEnabled, repairerEnabled, activeMode },
    });
    if (repairerEnabled) {
      expect(tx.repairerUpsert).toHaveBeenCalledTimes(1);
      expect(tx.repairerUpsert.mock.calls[0]![0].update).toEqual({ deletedAt: null });
    } else {
      expect(tx.repairerUpsert).not.toHaveBeenCalled();
    }
  });

  it('stamps onboardingCompletedAt only when it was null', async () => {
    const { service, tx } = makeUsers({ ...baseRow, onboardingCompletedAt: null });
    await service.updateModes('u1', { activeMode: 'REPAIRER' });
    expect(tx.profileUpdate.mock.calls[0]![0].data).toMatchObject({
      clientEnabled: true, repairerEnabled: true, activeMode: 'REPAIRER',
      onboardingCompletedAt: expect.any(Date),
    });
  });

  it('an already-enabled réparateur passing kind keeps it on the upsert update', async () => {
    const { service, tx } = makeUsers({ ...baseRow, verificationLevel: 'NONE' });
    await service.updateModes('u1', { activeMode: 'REPAIRER', kind: 'PRO' });
    expect(tx.repairerUpsert.mock.calls[0]![0].update).toEqual({ deletedAt: null, kind: 'PRO' });
  });
});

// ---------------------------------------------------------------------------------------------
// IdentityService.start — branches that must not move
// ---------------------------------------------------------------------------------------------

type IdRow = {
  stripeSessionId: string;
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  variant: 'DOCUMENT_AND_SELFIE' | 'DOCUMENT_ONLY';
  selfieFraudSignalAt: Date | null;
} | null;

function identityHarness(opts: {
  level?: Level | null;
  existing?: IdRow;
  user?: { emailVerified: boolean; phoneVerifiedAt: Date | null } | null;
}) {
  const upsert = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const level = opts.level === undefined ? 'BASIC' : opts.level;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        opts.user === undefined ? null : opts.user && { email: 'x@repareme.test', name: 'X', ...opts.user },
      ),
    },
    profile: {
      findFirst: vi.fn().mockResolvedValue(level === null ? null : { verificationLevel: level }),
      updateMany,
    },
    identityVerification: {
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      upsert,
    },
  };
  const service = new IdentityService(prisma as unknown as PrismaService, { emit: vi.fn() } as never);
  return { service, upsert, updateMany, gateway: identityGateway() as FakeIdentityGateway };
}

const expectRefusal = async (p: Promise<unknown>, code: string, message: string) => {
  const err = await p.catch((e: unknown) => e);
  expect((err as { code?: string }).code).toBe(code);
  expect((err as Error).message).toBe(message);
};

describe('CF4-01 preservation: IdentityService.start unchanged branches', () => {
  beforeEach(() => {
    __resetIdentityGateway();
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it.each(LEVELS)('IDENTITY_OFF when Connect is off (level %s)', async (level) => {
    delete process.env.CONNECT_ENABLED;
    const { service, gateway } = identityHarness({ level });
    await expectRefusal(
      service.start('u1', { variant: 'DOCUMENT_AND_SELFIE' }),
      'UNPROCESSABLE_ENTITY',
      "La vérification d'identité n'est pas encore disponible.",
    );
    expect(gateway.createCalls).toHaveLength(0);
  });

  it.each(['BASIC', 'IDENTITY', 'BUSINESS'] as Level[])('ALREADY_VERIFIED (level %s)', async (level) => {
    const { service, gateway, upsert } = identityHarness({
      level,
      existing: { stripeSessionId: 'vs_1', status: 'VERIFIED', variant: 'DOCUMENT_AND_SELFIE', selfieFraudSignalAt: null },
    });
    await expectRefusal(
      service.start('u1', { variant: 'DOCUMENT_AND_SELFIE' }),
      'UNPROCESSABLE_ENTITY',
      'Votre identité est déjà vérifiée.',
    );
    expect(gateway.createCalls).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(['DOCUMENT_AND_SELFIE', 'DOCUMENT_ONLY'] as const)('PROCESSING refused (variant %s)', async (variant) => {
    const { service, gateway, upsert } = identityHarness({
      existing: { stripeSessionId: 'vs_1', status: 'PROCESSING', variant: 'DOCUMENT_AND_SELFIE', selfieFraudSignalAt: null },
    });
    await expectRefusal(service.start('u1', { variant }), 'UNPROCESSABLE_ENTITY', 'Vérification en cours.');
    expect(gateway.createCalls).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(['REQUIRES_INPUT', 'CANCELED'] as const)('fraud refusal on DOCUMENT_ONLY (status %s)', async (status) => {
    const { service, gateway, upsert } = identityHarness({
      existing: { stripeSessionId: 'vs_1', status, variant: 'DOCUMENT_AND_SELFIE', selfieFraudSignalAt: new Date() },
    });
    await expectRefusal(
      service.start('u1', { variant: 'DOCUMENT_ONLY' }),
      'FORBIDDEN',
      'La vérification avec reconnaissance faciale est nécessaire pour votre compte.',
    );
    expect(gateway.createCalls).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  const unverifiedContacts = [
    { emailVerified: false, phoneVerifiedAt: null },
    { emailVerified: true, phoneVerifiedAt: null },
    { emailVerified: false, phoneVerifiedAt: new Date('2026-09-01T00:00:00.000Z') },
  ];

  it.each(unverifiedContacts)(
    'NONE with contacts not verified still refuses CONTACT_UNVERIFIED (%o)',
    async (user) => {
      const { service, gateway, upsert, updateMany } = identityHarness({ level: 'NONE', user });
      await expectRefusal(
        service.start('u1', { variant: 'DOCUMENT_AND_SELFIE' }),
        'FORBIDDEN',
        'Confirmez votre e-mail ou votre téléphone avant de vérifier votre identité.',
      );
      expect(gateway.createCalls).toHaveLength(0);
      expect(upsert).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled(); // no promotion for an ineligible account
    },
  );

  it('a missing profile still refuses CONTACT_UNVERIFIED', async () => {
    const { service, gateway } = identityHarness({ level: null, user: null });
    await expectRefusal(
      service.start('u1', { variant: 'DOCUMENT_AND_SELFIE' }),
      'FORBIDDEN',
      'Confirmez votre e-mail ou votre téléphone avant de vérifier votre identité.',
    );
    expect(gateway.createCalls).toHaveLength(0);
  });
});
