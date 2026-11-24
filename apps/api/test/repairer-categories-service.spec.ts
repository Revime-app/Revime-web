import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { AppException } from '../src/common/app-exception.js';
import { MAX_SPECIALITIES } from '@revime/shared';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-25`, the write side. Stubbed Prisma, no `vi.mock`, the shape `banner-service.spec.ts`
 * established - and for the same standing reason: `DATABASE_URL` points at PRODUCTION even
 * locally, so `test:unit` excluding the 30 `*.int.spec.ts` files makes this the only gate that
 * can ever run on these rules.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const ROOT = '22222222-2222-4222-8222-222222222222';
const CHILD_A = '33333333-3333-4333-8333-333333333333';
const CHILD_B = '44444444-4444-4444-8444-444444444444';
const LONE_ROOT = '55555555-5555-4555-8555-555555555555';
const UNKNOWN = '66666666-6666-4666-8666-666666666666';

/** Mirrors the live taxonomy's two shapes: a root with children, and childless `Autres`. */
const TAXONOMY = new Map<string, string | null>([
  [ROOT, null],
  [CHILD_A, ROOT],
  [CHILD_B, ROOT],
  [LONE_ROOT, null],
]);

type Opts = { repairerEnabled?: boolean; declared?: string[] };

type Harness = {
  service: UsersService;
  createMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  categoryFindMany: ReturnType<typeof vi.fn>;
};

function harness({ repairerEnabled = true, declared = [] }: Opts = {}): Harness {
  let current = [...declared];

  const deleteMany = vi.fn().mockImplementation(() => {
    current = [];
    return Promise.resolve({ count: 0 });
  });
  const createMany = vi
    .fn()
    .mockImplementation(({ data }: { data: { categoryId: string }[] }) => {
      current = data.map((d) => d.categoryId);
      return Promise.resolve({ count: data.length });
    });

  // Only ids that are in TAXONOMY come back, which is what USABLE_CATEGORY does in Postgres:
  // an unknown or inactive id simply produces no row.
  const categoryFindMany = vi
    .fn()
    .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in
          .filter((id) => TAXONOMY.has(id))
          .map((id) => ({ id, parentId: TAXONOMY.get(id) ?? null })),
      ),
    );

  const prisma = {
    profile: {
      findFirst: vi.fn().mockImplementation(() => Promise.resolve({ repairerEnabled })),
    },
    category: { findMany: categoryFindMany },
    repairerCategory: { deleteMany, createMany },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ repairerCategory: { deleteMany, createMany } }),
    ),
    user: {
      findUniqueOrThrow: vi.fn().mockImplementation(() =>
        Promise.resolve({
          id: USER,
          email: 'a@b.fr',
          name: 'Malek K',
          firstName: 'Malek',
          lastName: 'K',
          username: 'malek_k',
          phone: null,
          emailVerified: true,
          phoneVerifiedAt: null,
          image: null,
          role: null,
          profile: {
            clientEnabled: true,
            repairerEnabled,
            activeMode: 'REPAIRER',
            verificationLevel: 'NONE',
            onboardingCompletedAt: null,
            avatarPath: null,
            notifyOffers: true,
            notifyMessages: true,
            notifyCommandes: true,
            deletedAt: null,
          },
          repairerProfile: repairerEnabled
            ? {
                kind: 'INDIVIDUAL',
                displayName: 'Atelier Lyon',
                bio: null,
                postalCode: '69003',
                serviceAreaLabel: 'Lyon',
                serviceRadiusKm: null,
                bannerPath: null,
                deletedAt: null,
              }
            : null,
          repairerCategories: current.map((categoryId) => ({ categoryId })),
          repairerAvailability: [],
        }),
      ),
    },
  } as unknown as PrismaService;

  return { service: new UsersService(prisma, {} as GeocodeService), createMany, deleteMany, categoryFindMany };
}

describe('UsersService.setCategories', () => {
  it('refuses a client-only account, because a client has no fiche to render them on', async () => {
    const h = harness({ repairerEnabled: false });
    await expect(h.service.setCategories(USER, { categoryIds: [ROOT] })).rejects.toThrow(AppException);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('stores a root as ONE row rather than expanding it into its children', async () => {
    const h = harness();
    await h.service.setCategories(USER, { categoryIds: [ROOT] });
    expect(h.createMany).toHaveBeenCalledWith({
      data: [{ repairerUserId: USER, categoryId: ROOT }],
    });
  });

  it('normalises a root plus its own children down to the root', async () => {
    const h = harness();
    await h.service.setCategories(USER, { categoryIds: [ROOT, CHILD_A, CHILD_B] });
    expect(h.createMany).toHaveBeenCalledWith({
      data: [{ repairerUserId: USER, categoryId: ROOT }],
    });
  });

  it('replaces rather than merges: the previous set is deleted first', async () => {
    const h = harness({ declared: [CHILD_A] });
    await h.service.setCategories(USER, { categoryIds: [LONE_ROOT] });
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { repairerUserId: USER } });
    expect(h.createMany).toHaveBeenCalledWith({
      data: [{ repairerUserId: USER, categoryId: LONE_ROOT }],
    });
  });

  it('clears the set on an empty array, and writes no rows at all', async () => {
    const h = harness({ declared: [CHILD_A] });
    await h.service.setCategories(USER, { categoryIds: [] });
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { repairerUserId: USER } });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('refuses an unknown or deactivated category instead of silently dropping it', async () => {
    const h = harness();
    await expect(h.service.setCategories(USER, { categoryIds: [UNKNOWN] })).rejects.toThrow(
      AppException,
    );
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('refuses more than MAX_SPECIALITIES after normalisation', async () => {
    // Thirteen distinct roots, none redundant, so normalisation cannot bring it under the cap.
    const many = Array.from(
      { length: MAX_SPECIALITIES + 1 },
      (_, i) => `${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    for (const id of many) TAXONOMY.set(id, null);
    try {
      const h = harness();
      await expect(h.service.setCategories(USER, { categoryIds: many })).rejects.toThrow(
        AppException,
      );
      expect(h.createMany).not.toHaveBeenCalled();
    } finally {
      for (const id of many) TAXONOMY.delete(id);
    }
  });

  it('counts the NORMALISED set against the cap, so a redundant body is not wrongly refused', async () => {
    // A root plus its two children is three ids that normalise to one. Were the cap applied to
    // the raw array it would still pass here, so pin the stored result rather than the absence
    // of a throw: one row, not three.
    const h = harness();
    await h.service.setCategories(USER, { categoryIds: [ROOT, CHILD_A, CHILD_B] });
    const [{ data }] = h.createMany.mock.calls[0] as [{ data: unknown[] }];
    expect(data).toHaveLength(1);
  });

  it('validates against USABLE_CATEGORY, spread LAST so it cannot be clobbered', async () => {
    const h = harness();
    await h.service.setCategories(USER, { categoryIds: [ROOT] });
    const [{ where }] = h.categoryFindMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ active: true });
    expect(where.OR).toEqual([{ parentId: null }, { parent: { active: true } }]);
  });
});

describe('MeResponse.repairer.categoryIds', () => {
  it('is an empty array for a réparateur who has declared nothing', async () => {
    const me = await harness().service.me(USER);
    expect(me.repairer?.categoryIds).toEqual([]);
  });

  it('carries what he has declared', async () => {
    const me = await harness({ declared: [ROOT, LONE_ROOT] }).service.me(USER);
    expect(me.repairer?.categoryIds).toEqual([ROOT, LONE_ROOT]);
  });

  it('is absent for a client-only account, because the whole repairer block is null', async () => {
    const me = await harness({ repairerEnabled: false }).service.me(USER);
    expect(me.repairer).toBeNull();
  });
});
