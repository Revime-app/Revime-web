import { describe, expect, it, vi } from 'vitest';
import { AdminVerificationsService } from '../src/admin/admin-verifications.service.js';

const profile = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  verificationLevel: 'IDENTITY',
  verifiedAt: new Date('2026-08-16T14:00:05.194Z'),
  updatedAt: new Date('2026-08-16T14:00:05.194Z'),
  user: {
    email: 'camille@example.fr',
    name: 'Camille',
    username: 'camille',
    repairerProfile: { kind: 'PRO' },
  },
  ...over,
});

const makeDeps = (over: Record<string, unknown> = {}) => {
  const prisma = {
    profile: { findMany: vi.fn().mockResolvedValue([]) },
    identityVerification: { findMany: vi.fn().mockResolvedValue([]) },
    businessVerification: { findMany: vi.fn().mockResolvedValue([]) },
    verificationAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    ...over,
  };
  return { prisma, service: new AdminVerificationsService(prisma as never) };
};

describe('one row per verification (identity), status derivation', () => {
  it('lists a VERIFIED identity row', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.type).toBe('IDENTITY');
    expect(res.items[0]!.status).toBe('VERIFIED');
    expect(res.items[0]!.needsAction).toBe(false);
  });

  it('lists a DOCUMENTS_REQUIRED identity row and marks needsAction true by that status alone', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'REQUIRES_INPUT',
            verifiedAt: null,
            lastErrorCode: 'document_expired',
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.status).toBe('DOCUMENTS_REQUIRED');
    expect(res.items[0]!.needsAction).toBe(true);
  });
});

describe('one row per verification (business), status derivation', () => {
  it('lists a VERIFIED business row with siren/siret', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', siren: '123456789', siret: '12345678900012', status: 'APPROVED', verifiedAt: new Date('2026-08-10T00:00:00Z') },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    const bizRow = res.items.find((i) => i.type === 'BUSINESS');
    expect(bizRow).toBeDefined();
    expect(bizRow!.status).toBe('VERIFIED');
    expect(bizRow!.siren).toBe('123456789');
    expect(bizRow!.siret).toBe('12345678900012');
  });

  /** Registry-only row: no BusinessVerification, but a REJECTED attempt -> typed SIREN. */
  it('creates a registry-only BUSINESS row from the latest REJECTED attempt, siren = target', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
      verificationAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', target: '999888777', outcome: 'REJECTED', createdAt: new Date('2026-09-01T00:00:00Z') },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    const bizRow = res.items.find((i) => i.type === 'BUSINESS');
    expect(bizRow).toBeDefined();
    expect(bizRow!.status).toBe('REJECTED');
    expect(bizRow!.siren).toBe('999888777');
    expect(bizRow!.needsAction).toBe(false);
  });

  /** A registry attempt OLDER than an existing BusinessVerification -> no refused row. */
  it('does not create a refused row when the registry attempt is older than the BusinessVerification', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', siren: '111222333', siret: '11122233300099', status: 'APPROVED', verifiedAt: new Date('2026-09-10T00:00:00Z') },
        ]),
      },
      verificationAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', target: '111222333', outcome: 'REJECTED', createdAt: new Date('2026-09-01T00:00:00Z') },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toHaveLength(2);
    const bizRow = res.items.find((i) => i.type === 'BUSINESS');
    expect(bizRow!.status).toBe('VERIFIED');
    expect(bizRow!.needsAction).toBe(false);
  });
});

describe('needsAction filter default and toggle', () => {
  it('needsAction default (true) hides a VERIFIED clean row', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list();
    expect(res.items).toHaveLength(0);
  });

  it('needsAction=false shows the same clean row', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toHaveLength(1);
  });
});

describe('level_unbacked placement, pinned per profile level', () => {
  it('places level_unbacked on the IDENTITY row (NOT_STARTED) when no identity row exists', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      // No IdentityVerification row at all.
    });
    // Bug B6: Placed row without IdentityVerification cannot be decided by admin, so needsAction is false
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.type).toBe('IDENTITY');
    expect(res.items[0]!.status).toBe('NOT_STARTED');
    expect(res.items[0]!.needsAction).toBe(false);
    expect(res.items[0]!.detail).toMatch(/IDENTITY sans vérification Stripe/);
  });

  it('places level_unbacked on the BUSINESS row (NOT_STARTED) when profile level is BUSINESS and no business row exists', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
    });
    // Bug B6: Placed row without BusinessVerification cannot be decided by admin, so needsAction is false
    const res = await service.list({ needsAction: 'false' });
    const bizRows = res.items.filter((i) => i.type === 'BUSINESS');
    expect(bizRows).toHaveLength(1);
    expect(bizRows[0]!.status).toBe('NOT_STARTED');
    expect(bizRows[0]!.needsAction).toBe(false);
    expect(bizRows[0]!.detail).toMatch(/BUSINESS sans vérification de registre/);
  });

  it('places fraud_signal on the existing IDENTITY row rather than creating a new one', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: new Date('2026-08-17T00:00:00Z'),
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.type).toBe('IDENTITY');
    expect(res.items[0]!.status).toBe('VERIFIED');
    expect(res.items[0]!.needsAction).toBe(true);
    expect(res.items[0]!.detail).toMatch(/Signal de fraude/);
  });

  it('places registry_refused on the BUSINESS row when a BusinessVerification exists but is older', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', siren: '444555666', siret: '44455566600011', status: 'APPROVED', verifiedAt: new Date('2026-08-05T00:00:00Z') },
        ]),
      },
      verificationAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', target: '444555666', outcome: 'REJECTED', createdAt: new Date('2026-09-01T00:00:00Z') },
        ]),
      },
    });
    const res = await service.list();
    const bizRows = res.items.filter((i) => i.type === 'BUSINESS');
    expect(bizRows).toHaveLength(1);
    expect(bizRows[0]!.status).toBe('VERIFIED');
    expect(bizRows[0]!.needsAction).toBe(true);
    expect(bizRows[0]!.detail).toMatch(/registre refusé/);
  });
});

describe('display fields', () => {
  it('R2: display name = account name, plus username and email', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi.fn().mockResolvedValue([
          profile({
            user: { email: 'camille@example.fr', name: 'Camille Legal', username: 'camillel', repairerProfile: { kind: 'INDIVIDUAL' } },
          }),
        ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]!.displayName).toBe('Camille Legal');
    expect(res.items[0]!.username).toBe('camillel');
    expect(res.items[0]!.email).toBe('camille@example.fr');
    expect(res.items[0]!.accountKind).toBe('INDIVIDUAL');
  });

  /**
   * Ruling R5 (fix round 1, CF4-21): carried over from the old queue's three marker
   * cases (`admin-verification-queue.spec.ts`, dropped in Task 5's rewrite when the new
   * shared item type had no `marker` field). Production holds hundreds of
   * `@repareme.test` fixtures, so an operator must be able to tell them apart from a
   * seeded demo account at a glance.
   */
  it('marks a demo account (@demo.revime.fr) with marker: "demo"', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi.fn().mockResolvedValue([
          profile({ user: { email: 'demo.camille@demo.revime.fr', name: 'Camille', username: 'camille', repairerProfile: { kind: 'PRO' } } }),
        ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]!.marker).toBe('demo');
  });

  it('marks a test-fixture account (@repareme.test) with marker: "fixture"', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi.fn().mockResolvedValue([
          profile({ user: { email: 'fixture.camille@repareme.test', name: 'Camille', username: 'camille', repairerProfile: { kind: 'PRO' } } }),
        ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]!.marker).toBe('fixture');
  });

  it('marks a regular account with marker: null', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi.fn().mockResolvedValue([profile()]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]!.marker).toBeNull();
  });

  /** Every réparateur is included - the queue's take:100 cap is gone (brief). */
  it('does not cap the profile read at 100', async () => {
    const many = Array.from({ length: 150 }, (_, i) => profile({ userId: `u${i}` }));
    const { service, prisma } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(many) },
    });
    // Bug B6: Placed phantom rows without IdentityVerification have needsAction: false.
    // Querying with needsAction: 'false' verifies that the read is not capped at 100.
    const res = await service.list({ needsAction: 'false' });
    expect(res.total).toBeGreaterThanOrEqual(150);
    const call = (prisma.profile.findMany as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock
      .calls[0]![0];
    expect(call.take).toBeUndefined();
  });
});

describe('filters, applied in memory', () => {
  const twoProfiles = () => [
    profile({
      userId: 'u1',
      user: { email: 'alice@example.fr', name: 'Alice', username: 'alice', repairerProfile: { kind: 'PRO' } },
    }),
    profile({
      userId: 'u2',
      user: { email: 'bob@example.fr', name: 'Bob', username: 'bob', repairerProfile: { kind: 'INDIVIDUAL' } },
      verificationLevel: 'BUSINESS',
    }),
  ];

  const identityRows = () => [
    {
      userId: 'u1',
      status: 'VERIFIED',
      verifiedAt: new Date('2026-08-01T00:00:00Z'),
      lastErrorCode: null,
      selfieFraudSignalAt: null,
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    },
    {
      userId: 'u2',
      status: 'VERIFIED',
      verifiedAt: new Date('2026-08-05T00:00:00Z'),
      lastErrorCode: null,
      selfieFraudSignalAt: null,
      updatedAt: new Date('2026-08-05T00:00:00Z'),
    },
  ];

  it('filters by accountKind', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(twoProfiles()) },
      identityVerification: { findMany: vi.fn().mockResolvedValue(identityRows()) },
    });
    const res = await service.list({ needsAction: 'false', accountKind: 'PRO' });
    expect(res.items.every((i) => i.accountKind === 'PRO')).toBe(true);
    expect(res.items.some((i) => i.userId === 'u1')).toBe(true);
    expect(res.items.some((i) => i.userId === 'u2')).toBe(false);
  });

  it('filters by type', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(twoProfiles()) },
      identityVerification: { findMany: vi.fn().mockResolvedValue(identityRows()) },
    });
    const res = await service.list({ needsAction: 'false', type: 'BUSINESS' });
    expect(res.items.every((i) => i.type === 'BUSINESS')).toBe(true);
  });

  it('filters by status', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(twoProfiles()) },
      identityVerification: { findMany: vi.fn().mockResolvedValue(identityRows()) },
    });
    const res = await service.list({ needsAction: 'false', status: 'VERIFIED' });
    expect(res.items.every((i) => i.status === 'VERIFIED')).toBe(true);
  });

  it('filters by date range (from/to over the row date)', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(twoProfiles()) },
      identityVerification: { findMany: vi.fn().mockResolvedValue(identityRows()) },
    });
    const res = await service.list({ needsAction: 'false', from: '2026-08-04T00:00:00Z' });
    expect(res.items.some((i) => i.userId === 'u1')).toBe(false);
    expect(res.items.some((i) => i.userId === 'u2')).toBe(true);
  });

  it('filters by user search (username/name/email contains, case-insensitive)', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue(twoProfiles()) },
      identityVerification: { findMany: vi.fn().mockResolvedValue(identityRows()) },
    });
    const res = await service.list({ needsAction: 'false', user: 'ALICE' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.userId).toBe('u1');
  });

  it('filters by siren (siren or siret contains)', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', siren: '123456789', siret: '12345678900012', status: 'APPROVED', verifiedAt: new Date('2026-08-10T00:00:00Z') },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false', siren: '123456' });
    expect(res.items).toHaveLength(1);
    const noMatch = await service.list({ needsAction: 'false', siren: 'zzz' });
    expect(noMatch.items).toHaveLength(0);
  });
});

describe('ordering and pagination', () => {
  it('sorts newest first by date', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi.fn().mockResolvedValue([
          profile({ userId: 'old' }),
          profile({ userId: 'new' }),
        ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'old',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-01T00:00:00Z'),
          },
          {
            userId: 'new',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-09-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-09-01T00:00:00Z'),
          },
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items.map((i) => i.userId)).toEqual(['new', 'old']);
  });

  it('returns an empty array when there is nothing to list', async () => {
    const { service } = makeDeps();
    const res = await service.list();
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('asks the database for BOTH registry outcomes, REJECTED and FAILED', async () => {
    const { prisma, service } = makeDeps();
    await service.list();
    const findMany = prisma.verificationAttempt.findMany as unknown as {
      mock: { calls: Array<[{ where: unknown }]> };
    };
    expect(findMany.mock.calls).toHaveLength(1);
    expect(findMany.mock.calls[0]![0].where).toEqual({
      channel: 'REGISTRY',
      outcome: { in: ['REJECTED', 'FAILED'] },
    });
  });
});

/**
 * CF4-39 (sub-project M, spec §4.5 / §4.6). Review Focus 5: the list used to hold IDENTITY /
 * BUSINESS profiles only, which hid exactly the stuck or failed BASIC réparateur an operator would
 * accept, and dropped a refused one. The population now adds every live réparateur with an
 * identity row.
 */
describe('identity decisions on the list', () => {
  const idRow = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    stripeSessionId: 'vs_test_u1',
    status: 'REQUIRES_INPUT',
    verifiedAt: null,
    lastErrorCode: 'document_expired',
    selfieFraudSignalAt: null,
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    decision: null,
    decisionMotif: null,
    decisionNote: null,
    decidedAt: null,
    decidedByUserId: null,
    ...over,
  });

  it('reads identity rows first, then profiles at IDENTITY/BUSINESS OR with an identity row', async () => {
    const identityFindMany = vi.fn().mockResolvedValue([idRow({ userId: 'u1' }), idRow({ userId: 'u2' })]);
    const profileFindMany = vi.fn().mockResolvedValue([]);
    const { service } = makeDeps({
      profile: { findMany: profileFindMany },
      identityVerification: { findMany: identityFindMany },
    });
    await service.list();
    expect(identityFindMany.mock.invocationCallOrder[0]!).toBeLessThan(profileFindMany.mock.invocationCallOrder[0]!);
    const where = profileFindMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ repairerEnabled: true, deletedAt: null });
    expect(where.OR).toEqual([
      { verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } },
      { userId: { in: ['u1', 'u2'] } },
    ]);
    expect(where.verificationLevel).toBeUndefined();
  });

  it('a BASIC réparateur with a failed session and no decision is listed as needing action', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BASIC', verifiedAt: null })]) },
      identityVerification: { findMany: vi.fn().mockResolvedValue([idRow()]) },
    });
    const res = await service.list();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ type: 'IDENTITY', status: 'DOCUMENTS_REQUIRED', needsAction: true });
    expect(res.items[0]!.identity).toEqual({
      stripeStatus: 'REQUIRES_INPUT',
      stripeSessionId: 'vs_test_u1',
      lastErrorCode: 'document_expired',
      fraudSignal: false,
      decision: null,
      motif: null,
      note: null,
      decidedAt: null,
      decidedBy: null,
    });
  });

  it('a refused BASIC réparateur reads « Refusée par REVIME », not needing action, motif as detail', async () => {
    const userFindMany = vi.fn().mockResolvedValue([{ id: 'admin-1', username: 'ops' }]);
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BASIC' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          idRow({
            status: 'VERIFIED',
            verifiedAt: new Date('2026-09-01T00:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: new Date('2026-08-01T00:00:00Z'),
            decision: 'REFUSED',
            decisionMotif: 'ILLEGIBLE',
            decidedAt: new Date('2026-09-30T08:00:00Z'),
            decidedByUserId: 'admin-1',
          }),
        ]),
      },
      user: { findMany: userFindMany },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ status: 'ADMIN_REFUSED', needsAction: false, detail: 'Document illisible' });
    expect(res.items[0]!.identity).toEqual({
      stripeStatus: 'VERIFIED',
      stripeSessionId: 'vs_test_u1',
      lastErrorCode: null,
      fraudSignal: true,
      decision: 'REFUSED',
      motif: 'ILLEGIBLE',
      note: null,
      decidedAt: '2026-09-30T08:00:00.000Z',
      decidedBy: 'ops',
    });
    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: ['admin-1'] } } });
  });

  it('a decider whose account is gone reads decidedBy null', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BASIC' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          idRow({ decision: 'DOCUMENTS_REQUESTED', decisionMotif: 'OTHER', decisionNote: 'Photo coupée', decidedAt: new Date(), decidedByUserId: 'gone' }),
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]).toMatchObject({ status: 'ADMIN_DOCUMENTS_REQUESTED', detail: 'Autre : Photo coupée' });
    expect(res.items[0]!.identity!.decidedBy).toBeNull();
  });

  it('an accepted identity displays its justification note in detail and is not flagged level_unbacked', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          idRow({
            lastErrorCode: null,
            decision: 'ACCEPTED',
            decisionNote: 'Passeport valide vérifié manuellement',
            decidedAt: new Date(),
          }),
        ]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items[0]).toMatchObject({
      status: 'ADMIN_ACCEPTED',
      needsAction: false,
      detail: 'Passeport valide vérifié manuellement',
    });
    expect(res.items[0]!.identity!.stripeSessionId).toBe('vs_test_u1');
  });

  it('a non-réparateur with an identity row is not listed (the profile read returns nothing for him)', async () => {
    const { service } = makeDeps({
      identityVerification: { findMany: vi.fn().mockResolvedValue([idRow({ userId: 'client' })]) },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items).toEqual([]);
  });

  it('business rows carry identity null', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([idRow({ status: 'VERIFIED', verifiedAt: new Date('2026-08-01T00:00:00Z'), lastErrorCode: null })]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'u1', siren: '1', siret: null, verifiedAt: new Date('2026-08-10T00:00:00Z') }]),
      },
    });
    const res = await service.list({ needsAction: 'false' });
    expect(res.items.find((i) => i.type === 'BUSINESS')!.identity).toBeNull();
  });
});
