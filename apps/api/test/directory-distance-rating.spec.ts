import { describe, expect, it, vi } from 'vitest';
import { CARD_SELECT, RepairersService } from '../src/repairers/repairers.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import { withUserLookups } from './support/review-seal.js';

const CALLER = '11111111-1111-4111-8111-111111111111';

/** Lyon 3e, which is what BAN returns for 69003. */
const LYON = { lat: 45.7554, lng: 4.8497, city: 'Lyon 3e Arrondissement' };

type Row = {
  userId: string;
  displayName: string;
  serviceAreaLabel: string | null;
  lat: number | null;
  lng: number | null;
};

/** Lyon 4e is ~2 km from Lyon 3e; Bordeaux is ~440 km. */
const NEAR_ROW: Row = { userId: 'u-near', displayName: 'Croix-Rousse', serviceAreaLabel: 'Lyon 4e', lat: 45.7742, lng: 4.8320 };
const FAR_ROW: Row = { userId: 'u-far', displayName: 'Bordeaux', serviceAreaLabel: 'Bordeaux', lat: 44.8378, lng: -0.5792 };
const UNLOCATED_ROW: Row = { userId: 'u-none', displayName: 'Sans code postal', serviceAreaLabel: null, lat: null, lng: null };

function harness(rows: Row[], opts: { ratings?: Record<string, number>; geocode?: typeof LYON | null } = {}) {
  const ratings = opts.ratings ?? {};
  const findMany = vi.fn().mockImplementation(() =>
    Promise.resolve(
      rows.map((r) => ({
        ...r,
        user: { username: r.userId, profile: { verificationLevel: 'NONE', avatarPath: null } },
      })),
    ),
  );
  const prisma = withUserLookups({
    repairerProfile: { findMany },
    category: { findFirst: vi.fn() },
    // `repairerStats` reads these two. One group per rated réparateur.
    review: {
      groupBy: vi.fn().mockImplementation(() =>
        Promise.resolve(
          Object.entries(ratings).map(([userId, avg]) => ({
            repairerUserId: userId,
            _avg: { rating: avg },
            // 🛑 `_all`, NOT `rating`. `repairer-stats.ts` groups with `_count: { _all: true }` and
            // reads `row._count._all`, so a `_count: { rating: 1 }` fake makes `reviewCount`
            // undefined - every minRating test would then fail for a reason unrelated to the
            // filter, and the tempting fix would be to weaken the assertion.
            _count: { _all: 1 },
          })),
        ),
      ),
    },
    commande: { groupBy: vi.fn().mockImplementation(() => Promise.resolve([])) },
  }) as unknown as PrismaService;

  const lookupPostalCode = vi
    .fn()
    .mockImplementation(() => Promise.resolve(opts.geocode === undefined ? LYON : opts.geocode));
  const geocode = { lookupPostalCode } as unknown as GeocodeService;

  return { service: new RepairersService(prisma, geocode), findMany, lookupPostalCode };
}

const ids = (cards: { userId: string }[]) => cards.map((c) => c.userId);

/** The `select` `list` actually handed Prisma, so a test can assert on the columns it reads. */
const selectOf = (findMany: ReturnType<typeof vi.fn>) =>
  (findMany.mock.calls[0] as [{ select: Record<string, unknown> }])[0].select;

describe('the unfiltered path is untouched', () => {
  it('does not geocode when no near is sent', async () => {
    const h = harness([NEAR_ROW]);
    await h.service.list(CALLER, {});
    expect(h.lookupPostalCode).not.toHaveBeenCalled();
  });

  it('reports distanceKm as null for every row when no near is sent', async () => {
    const h = harness([NEAR_ROW, UNLOCATED_ROW]);
    const cards = await h.service.list(CALLER, {});
    expect(cards.map((c) => c.distanceKm)).toEqual([null, null]);
  });
});

describe('near produces a distance', () => {
  // 🛑 `cards[0]!` throughout this file: `tsconfig.base.json` sets
  // `noUncheckedIndexedAccess: true` and `apps/api/tsconfig.json` includes `test/**/*`, so a bare
  // `cards[0].distanceKm` is a COMPILE error. Do not "fix" it by loosening the tsconfig.
  it('geocodes once and rounds to one decimal', async () => {
    const h = harness([NEAR_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003' });
    expect(h.lookupPostalCode).toHaveBeenCalledTimes(1);
    const km = cards[0]!.distanceKm;
    expect(km).toBeGreaterThan(0);
    // One decimal place, like DemandeDto.distanceKm.
    expect(km).toBe(Math.round(km! * 10) / 10);
  });

  it('leaves distanceKm null for a réparateur with no coordinates', async () => {
    const h = harness([UNLOCATED_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003' });
    expect(cards[0]!.distanceKm).toBeNull();
  });

  it('REFUSES with 422 when BAN cannot situate the code, and blames nobody', async () => {
    const h = harness([NEAR_ROW], { geocode: null });
    // `radiusKm` is what makes the distance LOAD-BEARING and therefore the failure fatal. With
    // `near` alone this call RESOLVES - see the « a third-party outage » describe block below.
    const err = await h.service
      .list(CALLER, { near: '99999', radiusKm: '25' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    const app = err as AppException;
    expect(app.code).toBe('UNPROCESSABLE_ENTITY');
    /**
     * 🛑 THE MESSAGE ITSELF, PINNED VERBATIM, and this assertion is the point of the test's name.
     * Asserting only the CODE let « blames nobody » be a claim no gate could check: rewriting
     * this to « Ce code postal n'existe pas » would keep the code 422 and pass everything, while
     * blaming the client for what may well have been our own outage - `lookupPostalCode` cannot
     * tell an unknown code from an unreachable BAN, so neither may this copy.
     */
    expect(app.message).toBe("Nous n'avons pas pu situer ce code postal.");
  });

  it('refuses BEFORE fetching the page, so an unusable code costs no page query', async () => {
    // « No page query », NOT « no query »: `resolveSpecialityMatch` runs before `resolveNear`, so
    // a request carrying an unusable categoryId too would pay one `category.findFirst` first.
    const h = harness([NEAR_ROW], { geocode: null });
    await h.service.list(CALLER, { near: '99999', radiusKm: '25' }).catch(() => undefined);
    expect(h.findMany).not.toHaveBeenCalled();
  });
});

/**
 * 🛑 A THIRD-PARTY OUTAGE MUST NOT EMPTY THE DIRECTORY - the review finding that corrected the
 * original spec for this task.
 *
 * `geocode.service.ts` promises « NEVER THROWS … because publishing a demande must not depend on
 * a third party being up. Distance is a comparison nicety; publishing is the product. » Browsing
 * is the same kind of thing, and `near` is reachable with neither `radiusKm` nor
 * `sort='distance'` - the « keeps the unlocated réparateur when no radius is set » case above
 * drives exactly that state. There, `near` only DECORATES rows with a distance, so a BAN outage
 * must degrade to « no distances » rather than to « no réparateurs ».
 *
 * The refusal is kept for the two states where the distance is load-bearing, because returning
 * rows that may fall outside the radius, or an order that is not the one asked for, is worse
 * than an error.
 */
describe('a failed geocode is fatal ONLY when the distance is load-bearing', () => {
  it('RESOLVES with near alone, reporting every distance as null', async () => {
    const h = harness([NEAR_ROW, FAR_ROW], { geocode: null });
    const cards = await h.service.list(CALLER, { near: '69003' });
    expect(h.lookupPostalCode).toHaveBeenCalledTimes(1);
    // Every réparateur still listed, which is the whole point.
    expect(ids(cards)).toEqual(['u-near', 'u-far']);
    expect(cards.map((c) => c.distanceKm)).toEqual([null, null]);
  });

  it('still REFUSES when radiusKm makes the distance a filter', async () => {
    const h = harness([NEAR_ROW], { geocode: null });
    await expect(
      h.service.list(CALLER, { near: '69003', radiusKm: '10' }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
  });

  it("still REFUSES when sort='distance' makes the distance an order", async () => {
    const h = harness([NEAR_ROW], { geocode: null });
    await expect(
      h.service.list(CALLER, { near: '69003', sort: 'distance' }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
  });
});

/**
 * 🛑 THE SIBLING OF `directory-category-filter.spec.ts`'s CLOBBER TEST, and it exists because the
 * two hazards were asymmetrically guarded: that one pins the `AND` clause not becoming a spread
 * `user:` key, while nothing pinned the two coordinates staying OUT of the shared fragment. If
 * they migrated into `CARD_SELECT`, every test in the tree would still pass while
 * `getPublicProfile` - which spreads that fragment and has no `near` context - silently began
 * reading two dead columns on every profile read.
 */
describe('lat/lng are read by list ONLY, never by the shared fragment', () => {
  it("selects lat and lng in list's own select", async () => {
    const h = harness([NEAR_ROW]);
    await h.service.list(CALLER, {});
    const select = selectOf(h.findMany);
    expect(select.lat).toBe(true);
    expect(select.lng).toBe(true);
  });

  it('keeps them OUT of CARD_SELECT, which the public profile read spreads', () => {
    expect(CARD_SELECT).not.toHaveProperty('lat');
    expect(CARD_SELECT).not.toHaveProperty('lng');
  });
});

describe('radiusKm EXCLUDES rather than keeps', () => {
  it('drops a réparateur beyond the radius', async () => {
    const h = harness([NEAR_ROW, FAR_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003', radiusKm: '25' });
    expect(ids(cards)).toEqual(['u-near']);
  });

  it('drops a réparateur with NO coordinates, because "within 25 km" is not a claim we can make', async () => {
    const h = harness([NEAR_ROW, UNLOCATED_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003', radiusKm: '25' });
    expect(ids(cards)).toEqual(['u-near']);
  });

  it('keeps the unlocated réparateur when no radius is set', async () => {
    const h = harness([NEAR_ROW, UNLOCATED_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003' });
    expect(ids(cards)).toContain('u-none');
  });
});

describe('minRating EXCLUDES rather than keeps', () => {
  it('drops a réparateur below the minimum', async () => {
    const h = harness([NEAR_ROW, FAR_ROW], { ratings: { 'u-near': 4.5, 'u-far': 3 } });
    const cards = await h.service.list(CALLER, { minRating: '4' });
    expect(ids(cards)).toEqual(['u-near']);
  });

  it('drops an UNRATED réparateur, for the same reason as an unlocated one', async () => {
    const h = harness([NEAR_ROW, FAR_ROW], { ratings: { 'u-near': 4.5 } });
    const cards = await h.service.list(CALLER, { minRating: '4' });
    expect(ids(cards)).toEqual(['u-near']);
  });

  it('is inclusive at the boundary: exactly 3,0 passes minRating=3', async () => {
    const h = harness([FAR_ROW], { ratings: { 'u-far': 3 } });
    const cards = await h.service.list(CALLER, { minRating: '3' });
    expect(ids(cards)).toEqual(['u-far']);
  });

  it('needs no near at all', async () => {
    const h = harness([NEAR_ROW], { ratings: { 'u-near': 4.5 } });
    await h.service.list(CALLER, { minRating: '4' });
    expect(h.lookupPostalCode).not.toHaveBeenCalled();
  });
});

describe('sort=distance', () => {
  it('orders nearest first and puts the unlocated réparateur last', async () => {
    const h = harness([FAR_ROW, UNLOCATED_ROW, NEAR_ROW], { geocode: LYON });
    const cards = await h.service.list(CALLER, { near: '69003', sort: 'distance' });
    expect(ids(cards)).toEqual(['u-near', 'u-far', 'u-none']);
  });
});
