import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemandesService } from '../src/demandes/demandes.service.js';
import type { FeedItem } from '@revime/shared';
import {
  FakeStorageGateway,
  __resetStorageGateway,
  storageGateway,
} from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * `GET /demandes/feed` carries the FIRST photo as `photoUrl`, the same shape
 * `GET /demandes/mine` already returns.
 *
 * A unit test with a stubbed Prisma rather than an addition to
 * `demandes.int.spec.ts`, and that is deliberate: `DATABASE_URL` points at
 * PRODUCTION even locally, the client has authored a real demande, and the
 * integration suite writes. The mapping under test is pure - rows in, DTO out -
 * so nothing here needs a database. Pattern lifted from
 * `cron-photo-orphans.spec.ts`.
 */

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  // No STORAGE_DRIVER selects the FAKE gateway, which is production's own
  // configuration today. It signs nothing, so every photoUrl must come back null
  // WITHOUT the mapping throwing or inventing a URL.
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

type Row = {
  id: string;
  photos: { storagePath: string }[];
};

/**
 * A feed whose rows carry exactly the photo shape given, and enough of the other
 * columns for the mapping to run. `repairerEnabled` is true so `feed` gets past its
 * own gate, and lat/lng are null everywhere so distance stays out of the way.
 */
function serviceReturning(rows: Row[]): DemandesService {
  const prisma = withUserLookups({
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue({ lat: null, lng: null }) },
    demande: {
      findMany: vi.fn().mockResolvedValue(
        rows.map((r) => ({
          id: r.id,
          title: `Demande ${r.id}`,
          locationLabel: 'Lyon 3e',
          brand: null,
          model: null,
          mode: 'OFFERS',
          budgetCents: null,
          lat: null,
          lng: null,
          createdAt: new Date('2026-08-20T12:00:00Z'),
          category: { labelFr: 'Smartphone' },
          offers: [],
          photos: r.photos,
        })),
      ),
    },
  }) as unknown as PrismaService;

  const geocode = {} as GeocodeService;
  return new DemandesService(
    prisma,
    geocode,
    {} as unknown as NotificationsService,
  );
}

/**
 * `tsc` runs with `noUncheckedIndexedAccess`, so `items[0]` is `FeedItem | undefined` and a
 * bare index does not compile - vitest transpiles without typechecking and would have let it
 * through, which is exactly the divergence this repo keeps recording. Narrowing here once
 * beats an assertion on every line.
 */
function at(items: FeedItem[], i: number): FeedItem {
  const item = items[i];
  if (item === undefined) throw new Error(`no feed item at ${i}`);
  return item;
}

describe('GET /demandes/feed photoUrl', () => {
  it('is null for a demande with no photos, and null is the ONLY absent state', async () => {
    const service = serviceReturning([{ id: 'a', photos: [] }]);
    const items = await service.feed('me', {});

    expect(items).toHaveLength(1);
    expect(at(items, 0).photoUrl).toBeNull();
  });

  /**
   * The whole point of the field: a réparateur's nearby card is photo-led. With the fake
   * gateway the URL is null, but the row must still carry the KEY rather than omitting it,
   * or the mobile card cannot tell "no photo" from "field not implemented".
   */
  it('is present as a null key when storage is unconfigured, not absent', async () => {
    const service = serviceReturning([{ id: 'a', photos: [{ storagePath: 'demandes/a/1.jpg' }] }]);
    const items = await service.feed('me', {});

    expect(Object.keys(at(items, 0))).toContain('photoUrl');
    expect(at(items, 0).photoUrl).toBeNull();
  });

  it('signs the first photo only, once for the whole list', async () => {
    process.env.STORAGE_DRIVER = 'fake';
    __resetStorageGateway();
    // The fake models real storage: a path whose object was never PUT is ABSENT from the
    // signed map rather than fabricated, so it has to be seeded to sign at all.
    const gw = storageGateway() as FakeStorageGateway;
    gw.seed('demandes/a/1.jpg');
    gw.seed('demandes/c/1.jpg');

    const service = serviceReturning([
      { id: 'a', photos: [{ storagePath: 'demandes/a/1.jpg' }] },
      { id: 'b', photos: [] },
      { id: 'c', photos: [{ storagePath: 'demandes/c/1.jpg' }] },
    ]);
    const items = await service.feed('me', {});

    expect(items).toHaveLength(3);
    // The fake returns a URL that CONTAINS the path, exactly as
    // demande-photos.int.spec.ts asserts for the demande detail.
    expect(at(items, 0).photoUrl).toContain('demandes/a/1.jpg');
    expect(at(items, 1).photoUrl).toBeNull();
    expect(at(items, 2).photoUrl).toContain('demandes/c/1.jpg');
  });

  /**
   * The case the fake's own contract makes reachable, and the reason `photoUrl` is
   * `string | null` rather than `string`: the ROW says there is a photo and STORAGE
   * disagrees, because the object was purged or never finished uploading. The feed must
   * degrade to null rather than hand the app a URL that 404s.
   */
  it('is null when the row references a photo whose object is gone', async () => {
    process.env.STORAGE_DRIVER = 'fake';
    __resetStorageGateway();
    // Deliberately NOT seeded.

    const service = serviceReturning([
      { id: 'a', photos: [{ storagePath: 'demandes/a/vanished.jpg' }] },
    ]);
    const items = await service.feed('me', {});

    expect(at(items, 0).photoUrl).toBeNull();
  });
});
