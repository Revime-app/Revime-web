import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemandesService } from '../src/demandes/demandes.service.js';
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
 * `GET /demandes/:id` gains the two fields the « Détail de la demande » screen needs to match
 * the prototype: the author's public identity, and the viewer's distance to the demande.
 *
 * Unit tests with a stubbed Prisma rather than additions to `demandes.int.spec.ts`, for the
 * standing reason: `DATABASE_URL` points at PRODUCTION even locally and the integration suite
 * writes, while everything under test here is a pure mapping.
 */

const AUTHOR = 'author-1';
const REPAIRER = 'repairer-1';

/** Lyon 3e and Paris 17e, the two postal codes the live accounts actually hold. */
const LYON = { lat: 45.7578, lng: 4.8524 };
const PARIS = { lat: 48.8869, lng: 2.3223 };

/**
 * Two real-shaped storage paths under AUTHOR's own prefix -
 * `demandes/<userId>/<draftId>/<uuid>.<ext>`, the shape `buildPhotoPath` produces and
 * `checkPhotoPaths` enforces. Real-shaped and not `p1.jpg`, because `DemandeDto.photos` hands
 * these back to the author verbatim and the assertions below read them as identifiers.
 */
const DRAFT = '11111111-1111-4111-8111-111111111111';
const PHOTO_1 = `demandes/${AUTHOR}/${DRAFT}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const PHOTO_2 = `demandes/${AUTHOR}/${DRAFT}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

type Opts = {
  /** The viewer. `AUTHOR` means the owner is looking at their own demande. */
  viewer: string;
  /** The viewer's saved coordinates, or null when they have no postal code. */
  viewerCoords: { lat: number; lng: number } | null;
  /** The demande's own coordinates, null when geocoding never resolved. */
  demandeCoords: { lat: number; lng: number } | null;
  authorUsername?: string;
  authorCreatedAt?: Date;
  /**
   * `CF-16`. Storage paths for this demande's `DemandePhoto` rows, in `sortOrder`. One entry
   * here is one row, which is the count `DemandeDto.photos` must match.
   */
  photoPaths?: string[];
  /**
   * `CF-16`. Which of `photoPaths` storage can actually sign. Defaults to all of them, and a
   * SHORTER list is how « the row is there but its object is gone » is expressed without a
   * network - the case `photoUrls` drops and `photos` must keep.
   */
  signablePaths?: string[];
  /** `CF-16`. Live SENT offers on this demande, for `DemandeDto.offerCount`. */
  offerCount?: number;
};

function service({
  viewer,
  viewerCoords,
  demandeCoords,
  authorUsername = 'malek_k',
  authorCreatedAt = new Date('2024-03-04T10:00:00Z'),
  photoPaths = [],
  signablePaths,
  offerCount = 0,
}: Opts): DemandesService {
  // The fake gateway signs only what has been SEEDED - a path whose object was never PUT is
  // absent from its map rather than fabricated, exactly as real storage behaves. `beforeEach`
  // has already cleared the memoised factory, so the instance seeded here is the one `present()`
  // will call. Pattern lifted from `feed-photo.spec.ts`.
  const gateway = storageGateway();
  if (!(gateway instanceof FakeStorageGateway)) {
    // Loud rather than silent: with the real gateway every URL would come back null and the
    // « unsignable » test would read as a pass for the wrong reason.
    throw new Error('expected the FAKE storage gateway - STORAGE_DRIVER leaked into this test');
  }
  for (const path of signablePaths ?? photoPaths) gateway.seed(path);

  const prisma = withUserLookups({
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: viewer !== AUTHOR }) },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue(viewerCoords) },
    demande: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'd1',
        authorUserId: AUTHOR,
        title: 'iPhone 13, écran cassé',
        description: 'Écran fissuré en haut à droite.',
        brand: 'Apple',
        model: 'iPhone 13',
        parts: 'UNKNOWN',
        mode: 'OFFERS',
        budgetCents: null,
        locationLabel: 'Lyon 3e',
        postalCode: '69003',
        status: 'OPEN',
        lat: demandeCoords?.lat ?? null,
        lng: demandeCoords?.lng ?? null,
        createdAt: new Date('2026-08-15T19:19:29Z'),
        category: { id: 'c1', slug: 'smartphone', labelFr: 'Smartphone' },
        photos: photoPaths.map((storagePath) => ({ storagePath })),
        author: { username: authorUsername, createdAt: authorCreatedAt },
        commandes: [],
        // `CF-16`. `DEMANDE_INCLUDE` asks Prisma for this, so a stubbed row without it is not a
        // row `present()` can ever be handed. Zero by default, which keeps every test above
        // unchanged.
        _count: { offers: offerCount },
      }),
    },
  }) as unknown as PrismaService;

  return new DemandesService(
    prisma,
    {} as GeocodeService,
    {} as unknown as NotificationsService,
  );
}

describe('DemandeDto.author', () => {
  it('carries the author\'s handle and join date for a réparateur viewing it', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: LYON,
    }).getForViewer(REPAIRER, 'd1');

    expect(dto.author).not.toBeNull();
    expect(dto.author?.username).toBe('malek_k');
    expect(dto.author?.memberSince).toBe('2024-03-04T10:00:00.000Z');
  });

  /**
   * The null does double duty on the screen: no « CLIENT » card about yourself, and no
   * « Faire une offre » button on your own demande. The client CAN reach this screen -
   * `commande/[id].tsx:125` pushes `/demande/:id` and both parties open a commande.
   */
  it('is NULL when the viewer IS the author, so nobody is shown a card about themselves', async () => {
    const dto = await service({
      viewer: AUTHOR,
      viewerCoords: null,
      demandeCoords: LYON,
    }).getForViewer(AUTHOR, 'd1');

    expect(dto.author).toBeNull();
  });

  it('carries no legal name of any kind', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: LYON,
    }).getForViewer(REPAIRER, 'd1');

    // The whole of CF-05 on this surface, asserted rather than assumed: a
    // réparateur browsing a demande must not receive the client's name.
    expect(dto.author).not.toBeNull();
    expect(JSON.stringify(dto.author)).not.toMatch(/firstName|lastName|"name"/);
  });
});

describe('DemandeDto.distanceKm', () => {
  it('is the distance from the viewer to the demande, rounded to one decimal', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: PARIS,
    }).getForViewer(REPAIRER, 'd1');

    // Lyon to Paris is ~392 km. Asserted as a range, because pinning an exact float would be
    // testing the haversine implementation rather than this mapping.
    expect(dto.distanceKm).toBeGreaterThan(380);
    expect(dto.distanceKm).toBeLessThan(400);
    // One decimal place, matching the feed so the same demande cannot read 392 km in a list
    // and 392.0384 km on its detail screen.
    expect(dto.distanceKm).toBe(Math.round((dto.distanceKm as number) * 10) / 10);
  });

  it('is 0 or near it when both sit at the same coordinates', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: LYON,
    }).getForViewer(REPAIRER, 'd1');

    expect(dto.distanceKm).toBe(0);
  });

  /**
   * The ORDINARY case for a new réparateur, not an edge one: no postal code means no
   * coordinates. Null rather than 0, because 0 km would read as « next door ».
   */
  it('is NULL when the viewer has no coordinates', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: null,
      demandeCoords: LYON,
    }).getForViewer(REPAIRER, 'd1');

    expect(dto.distanceKm).toBeNull();
  });

  it('is NULL when the DEMANDE never geocoded, however well located the viewer is', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: null,
    }).getForViewer(REPAIRER, 'd1');

    expect(dto.distanceKm).toBeNull();
  });
});

/**
 * `CF-16`'s two additions to the detail DTO, both for « Modifier la demande »: the live offer
 * count `demandeEditPolicy` locks contract fields on, and the author's own photo paths so the
 * edit form can resubmit « keep these » without dropping any.
 */
describe('DemandeDto, CF-16 additions', () => {
  it('reports the live offer count', async () => {
    const dto = await service({
      viewer: AUTHOR,
      viewerCoords: null,
      demandeCoords: LYON,
      offerCount: 3,
    }).getForViewer(AUTHOR, 'd1');

    expect(dto.offerCount).toBe(3);
  });

  /**
   * 🛑 The author is the viewer whose `author` comes back NULL - `present()` suppresses it
   * because the creator is by definition the author. Inverted from how it reads.
   */
  it('gives the author their photo paths', async () => {
    const dto = await service({
      viewer: AUTHOR,
      viewerCoords: null,
      demandeCoords: LYON,
      photoPaths: [PHOTO_1, PHOTO_2],
    }).getForViewer(AUTHOR, 'd1');

    // The inversion, asserted in the same test rather than assumed: these two are ONE fact,
    // and a second signal for it is exactly what must not appear.
    expect(dto.author).toBeNull();

    const photos = dto.photos;
    if (photos === null) throw new Error('photos must be non-null for the author');
    expect(photos).toHaveLength(2);
    expect(photos[0]?.path).toBe(PHOTO_1);
    expect(photos[1]?.path).toBe(PHOTO_2);
    // Paired, not two arrays: each entry carries its own URL. The fake returns a URL that
    // CONTAINS the path, as `feed-photo.spec.ts` and `demande-photos.int.spec.ts` both assert.
    expect(photos[0]?.url).toContain(PHOTO_1);
    expect(photos[1]?.url).toContain(PHOTO_2);
  });

  it('withholds photo paths from every other viewer', async () => {
    const dto = await service({
      viewer: REPAIRER,
      viewerCoords: LYON,
      demandeCoords: LYON,
      photoPaths: [PHOTO_1, PHOTO_2],
    }).getForViewer(REPAIRER, 'd1');

    // The same fact read the other way round: a non-null `author` means a non-author viewer.
    expect(dto.author).not.toBeNull();
    expect(dto.photos).toBeNull();
    // Withholding it must not cost the réparateur the GALLERY, which is a different field and
    // deliberately untouched by this change.
    expect(dto.photoUrls).toHaveLength(2);
  });

  /**
   * The index-alignment guarantee. `photoUrls` DROPS a path it cannot sign, so if the author's
   * array dropped too, removing "the third photo" in the form would delete a different row.
   */
  it('keeps an unsignable photo with a null url, so length matches the row count', async () => {
    const dto = await service({
      viewer: AUTHOR,
      viewerCoords: null,
      demandeCoords: LYON,
      photoPaths: [PHOTO_1, PHOTO_2],
      // Only the first object is really there. The second row points at nothing.
      signablePaths: [PHOTO_1],
    }).getForViewer(AUTHOR, 'd1');

    // `photoUrls` still drops it. That behaviour is documented on the field and is left exactly
    // as it was, for the read-only gallery and the list thumbnail.
    expect(dto.photoUrls).toHaveLength(1);
    expect(dto.photoUrls[0]).toContain(PHOTO_1);

    const photos = dto.photos;
    if (photos === null) throw new Error('photos must be non-null for the author');
    // ONE entry per DemandePhoto row, so index 1 is still the second row and not a shifted one.
    expect(photos).toHaveLength(2);
    expect(photos[1]?.path).toBe(PHOTO_2);
    expect(photos[1]?.url).toBeNull();
    expect(photos[0]?.url).toContain(PHOTO_1);
  });

  /**
   * 🛑 AN AUTHOR WITH ZERO PHOTOS IS THE COMMON FRESH DEMANDE, AND GETTING IT WRONG REFUSES
   * THE EDIT SCREEN. The edit screen derives `isAuthor` from `photosField !== null`, which
   * is correct: the field is non-null for the author and null for everyone else. If anyone
   * later "tidies" `present()` to return `null` for an empty array - reasoning that an empty
   * array is semantically null - every author with a photo-less demande is refused their own
   * edit screen with « Vous ne pouvez modifier que vos propres demandes. »
   */
  it('gives the author an EMPTY ARRAY for zero photos, not null', async () => {
    const dto = await service({
      viewer: AUTHOR,
      viewerCoords: null,
      demandeCoords: LYON,
      photoPaths: [], // zero photos
    }).getForViewer(AUTHOR, 'd1');

    // Empty array, not null. `!== null` on the screen is the gate, and [] !== null is true.
    expect(dto.photos).toEqual([]);
    expect(dto.photos).not.toBeNull();
  });
});
