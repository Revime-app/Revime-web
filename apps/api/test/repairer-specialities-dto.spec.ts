import { describe, expect, it, vi } from 'vitest';
import { RepairersService } from '../src/repairers/repairers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-34` gave `RepairersService` a second constructor argument. This stub resolves nothing,
 * which is correct for every test in this file: none sends `near`, so `lookupPostalCode` must
 * never be called. Returning null rather than throwing keeps the failure mode "distance is
 * absent" rather than "the suite explodes" if one ever does.
 */
const noGeocode = {
  lookupPostalCode: () => Promise.resolve(null),
} as unknown as GeocodeService;

/**
 * `CF-25`. `RepairerProfileDto.specialities` - the label composition and the taxonomy order.
 *
 * Stubbed Prisma. The ORDER is the part worth a test: it is computed in JavaScript from two
 * `sortOrder` columns rather than by SQL, because a root's own row has to sort ahead of any
 * child of the same family.
 */

const USER = '11111111-1111-4111-8111-111111111111';

type Declared = {
  labelFr: string;
  sortOrder: number;
  parent: { labelFr: string; sortOrder: number } | null;
};

function harness(declared: Declared[]): RepairersService {
  const prisma = {
    repairerProfile: {
      findFirst: vi.fn().mockImplementation(() =>
        Promise.resolve({
          userId: USER,
          displayName: 'Atelier Lyon',
          serviceAreaLabel: 'Lyon',
          bio: null,
          bannerPath: null,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          user: { username: 'atelier_lyon', profile: { verificationLevel: 'NONE', avatarPath: null } },
        }),
      ),
    },
    repairerCategory: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(declared.map((category) => ({ category })))),
    },
    offer: { findMany: vi.fn().mockImplementation(() => Promise.resolve([])) },
    review: { groupBy: vi.fn().mockImplementation(() => Promise.resolve([])) },
    commande: { groupBy: vi.fn().mockImplementation(() => Promise.resolve([])) },
  } as unknown as PrismaService;

  return new RepairersService(prisma, noGeocode);
}

/** Électronique(1) with Smartphones(1) and Télévisions(5); Mobilité(4); Autres(8), childless. */
const SMARTPHONES: Declared = { labelFr: 'Smartphones', sortOrder: 1, parent: { labelFr: 'Électronique', sortOrder: 1 } };
const TELEVISIONS: Declared = { labelFr: 'Télévisions', sortOrder: 5, parent: { labelFr: 'Électronique', sortOrder: 1 } };
const MOBILITE: Declared = { labelFr: 'Mobilité', sortOrder: 4, parent: null };
const AUTRES: Declared = { labelFr: 'Autres', sortOrder: 8, parent: null };

describe('RepairerProfileDto.specialities', () => {
  it('is empty for a réparateur who has declared nothing', async () => {
    const dto = await harness([]).getPublicProfile(USER);
    expect(dto.specialities).toEqual([]);
  });

  it('renders a declared root as its own label alone', async () => {
    const dto = await harness([MOBILITE]).getPublicProfile(USER);
    expect(dto.specialities).toEqual(['Mobilité']);
  });

  it('renders a declared child as « root · child »', async () => {
    const dto = await harness([SMARTPHONES]).getPublicProfile(USER);
    expect(dto.specialities).toEqual(['Électronique · Smartphones']);
  });

  it('orders by root sortOrder first, whatever order the rows arrive in', async () => {
    const dto = await harness([AUTRES, MOBILITE, SMARTPHONES]).getPublicProfile(USER);
    expect(dto.specialities).toEqual(['Électronique · Smartphones', 'Mobilité', 'Autres']);
  });

  it('orders siblings by their own sortOrder inside one family', async () => {
    const dto = await harness([TELEVISIONS, SMARTPHONES]).getPublicProfile(USER);
    expect(dto.specialities).toEqual(['Électronique · Smartphones', 'Électronique · Télévisions']);
  });

  it('leaves categoriesTreated untouched, so the derived section is not disturbed', async () => {
    const dto = await harness([SMARTPHONES]).getPublicProfile(USER);
    expect(dto.categoriesTreated).toEqual([]);
  });
});

describe('the directory card does NOT carry specialities', () => {
  it('is asserted rather than assumed, because « we added it everywhere for consistency » is how that lands', () => {
    // Design §10. `GET /repairers` has no `take:` - `take` occurs once in the whole hand-written
    // API and the directory is not it - and the card renders no chips, so a field here would
    // mean one extra nested read per row on an unbounded list for something nothing draws. This
    // is the same asymmetry `bannerUrl` records one field above `avatarUrl`.
    //
    // A TYPE-LEVEL assertion, since there is nothing to call: `CARD_SELECT` is what feeds the
    // card, and `RepairerProfileDto` extends `RepairerCardDto`, so the only thing stopping the
    // field spreading is that nobody adds it. Pin it in a way that fails loudly if they do.
    type CardKey = keyof import('@revime/shared').RepairerCardDto;
    // Fails to compile if `RepairerCardDto` gains or loses a key. Adding a key gives TS2741;
    // removing one gives TS2353.
    const exhaustive: Record<CardKey, true> = {
      userId: true,
      displayName: true,
      serviceAreaLabel: true,
      username: true,
      verifiedBadge: true,
      rating: true,
      reviewCount: true,
      avatarUrl: true,
    };
    expect(Object.keys(exhaustive).length).toBe(8);
  });
});
