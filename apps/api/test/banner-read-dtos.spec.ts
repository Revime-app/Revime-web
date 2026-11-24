import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepairersService } from '../src/repairers/repairers.service.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import { withUserLookups } from './support/review-seal.js';

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
 * `CF-24`, the read side of the fiche publique.
 *
 * 🛑 THE ASYMMETRY WITH `avatar-read-dtos.spec.ts` IS THE SUBJECT OF THIS FILE, not an accident of
 * how it was written. `avatarUrl` is on `RepairerCardDto`, so the directory and the fiche are
 * asserted to agree. `bannerUrl` is on `RepairerProfileDto` ONLY, so what needs asserting is the
 * opposite: that the directory does NOT carry it and does NOT sign for it. A banner on the card
 * would mean one extra signed URL per row on an endpoint with no `take`, for something a 44pt row
 * has no cover to draw - and « we added it everywhere for consistency » is exactly how that lands.
 */

const CLIENT = 'client-1';
const REPAIRER = 'repairer-1';
const OTHER_REPAIRER = 'repairer-2';
const OBJ = '33333333-3333-4333-8333-333333333333';
const OBJ2 = '44444444-4444-4444-8444-444444444444';

const avatarOf = (userId: string) => `avatars/${userId}/${OBJ}.jpg`;
const bannerOf = (userId: string) => `banners/${userId}/${OBJ2}.jpg`;

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  process.env.STORAGE_DRIVER = 'fake';
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

function uploaded(...paths: string[]): void {
  const g = storageGateway() as FakeStorageGateway;
  for (const p of paths) g.seed(p);
}

function repairersService(
  rows: { userId: string; avatarPath?: string | null; bannerPath?: string | null }[],
): RepairersService {
  const shaped = rows.map((r) => ({
    userId: r.userId,
    displayName: `Atelier ${r.userId}`,
    serviceAreaLabel: 'Lyon',
    bio: null,
    bannerPath: r.bannerPath ?? null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      username: `u_${r.userId}`,
      profile: { verificationLevel: 'NONE', avatarPath: r.avatarPath ?? null },
    },
  }));

  const prisma = withUserLookups({
    repairerProfile: {
      findMany: vi.fn().mockResolvedValue(shaped),
      findFirst: vi.fn().mockResolvedValue(shaped[0]),
    },
    repairerCategory: { findMany: vi.fn().mockResolvedValue([]) },
    review: { groupBy: vi.fn().mockResolvedValue([]) },
    commande: { groupBy: vi.fn().mockResolvedValue([]) },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return new RepairersService(prisma, noGeocode);
}

describe('RepairerProfileDto.bannerUrl', () => {
  it('is null for a réparateur who has never uploaded one', async () => {
    const service = repairersService([{ userId: REPAIRER, bannerPath: null }]);
    const profile = await service.getPublicProfile(REPAIRER);

    expect(profile.bannerUrl).toBeNull();
  });

  /**
   * 🛑 THE TEST THAT PINS THE TASK 5 FIX. Stage 6 piece B2 split `listableRepairerWhere()`
   * out of `directoryWhere` and pointed `getPublicProfile` at it, closing the public fiche
   * route for suspended réparateurs. Without this assertion, reverting `getPublicProfile` to
   * its hand-written predicate (no suspension clause) passes 100/100 tests. The fiche route
   * is the second surface this task exists to close; the directory is pinned elsewhere.
   */
  it('applies the shared listability predicate including the suspension clause', async () => {
    const service = repairersService([{ userId: REPAIRER, bannerPath: null }]);
    await service.getPublicProfile(REPAIRER);

    const prisma = (service as any).prisma;
    expect(prisma.repairerProfile.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.repairerProfile.findFirst.mock.calls[0]![0].where).toEqual({
      deletedAt: null,
      user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } },
      userId: REPAIRER,
    });
  });

  it('is a signed url once his object is in the bucket', async () => {
    const path = bannerOf(REPAIRER);
    uploaded(path);

    const profile = await repairersService([
      { userId: REPAIRER, bannerPath: path },
    ]).getPublicProfile(REPAIRER);

    expect(profile.bannerUrl).toContain(path);
  });

  /**
   * `createSignedReadUrls` omits a path with no object rather than fabricating a URL. On the fiche
   * that difference is visible: null renders the screen's own motif, a fabricated URL renders a
   * broken image across the full width of the header.
   */
  it('is null when the column outlives its object', async () => {
    const profile = await repairersService([
      { userId: REPAIRER, bannerPath: bannerOf(REPAIRER) },
    ]).getPublicProfile(REPAIRER);

    expect(profile.bannerUrl).toBeNull();
  });

  /**
   * 🛑 ONE SIGNING CALL FOR BOTH IMAGES. The fiche needs an avatar and a banner, and two separate
   * calls would double the round trips on the one screen that draws both - the reason
   * `signProfileMedia` takes an array rather than a path.
   */
  it('signs the avatar and the banner in ONE call, not two', async () => {
    const avatar = avatarOf(REPAIRER);
    const banner = bannerOf(REPAIRER);
    uploaded(avatar, banner);
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    const profile = await repairersService([
      { userId: REPAIRER, avatarPath: avatar, bannerPath: banner },
    ]).getPublicProfile(REPAIRER);

    expect(profile.avatarUrl).toContain(avatar);
    expect(profile.bannerUrl).toContain(banner);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not sign at all for a réparateur with neither image', async () => {
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    await repairersService([{ userId: REPAIRER }]).getPublicProfile(REPAIRER);

    expect(spy).not.toHaveBeenCalled();
  });

  /** One image present and one absent must not make the present one null. */
  it('signs the banner when there is no avatar, and the reverse', async () => {
    const banner = bannerOf(REPAIRER);
    uploaded(banner);

    const profile = await repairersService([
      { userId: REPAIRER, avatarPath: null, bannerPath: banner },
    ]).getPublicProfile(REPAIRER);

    expect(profile.avatarUrl).toBeNull();
    expect(profile.bannerUrl).toContain(banner);
  });
});

describe('RepairerCardDto has no banner', () => {
  /**
   * 🛑 A NEGATIVE ASSERTION ON PURPOSE, and the one thing in this slice that a later « add it
   * everywhere for consistency » edit would break silently. The directory row is an avatar plus two
   * lines of text; a banner there is not a smaller version of the fiche's cover, it is a redesign.
   */
  it('does not carry a bannerUrl field', async () => {
    const banner = bannerOf(REPAIRER);
    uploaded(banner);

    const cards = await repairersService([
      { userId: REPAIRER, bannerPath: banner },
    ]).list(CLIENT, {});

    expect(cards[0]).not.toHaveProperty('bannerUrl');
  });

  /**
   * The cost this asymmetry exists to avoid, asserted as a count rather than as a comment: `list`
   * has no `take`, so a banner on the card would add one signed URL per réparateur in the whole
   * directory. Two rows with banners must still produce the ONE call the avatars need - and here
   * neither row has an avatar, so the honest expectation is zero.
   */
  it('does not sign banners for the directory at all', async () => {
    uploaded(bannerOf(REPAIRER), bannerOf(OTHER_REPAIRER));
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    await repairersService([
      { userId: REPAIRER, avatarPath: null, bannerPath: bannerOf(REPAIRER) },
      { userId: OTHER_REPAIRER, avatarPath: null, bannerPath: bannerOf(OTHER_REPAIRER) },
    ]).list(CLIENT, {});

    expect(spy).not.toHaveBeenCalled();
  });
});
