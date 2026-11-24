import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DemandeStatus, UpdateDemandeInput } from '@revime/shared';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { AppException } from '../src/common/app-exception.js';
import { USABLE_CATEGORY } from '../src/catalog/usable-category.js';
import {
  FakeStorageGateway,
  __resetStorageGateway,
  storageGateway,
} from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * `CF-16`. `PATCH /demandes/:id` - the state gate, the `CF-D7` field-class gate, the diff and
 * the write.
 *
 * Unit tests against a stubbed Prisma rather than additions to `demandes.int.spec.ts`, for this
 * project's standing reason: `DATABASE_URL` points at PRODUCTION even locally and the integration
 * suite writes. Everything asserted here is a decision - what was refused, what was re-validated,
 * and what the write was asked to do - so a stub is not a weaker instrument than a database, it is
 * the right one. Several of these tests exist precisely to pin that something was NOT called.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const DEMANDE = '33333333-3333-4333-8333-333333333333';
const CATEGORY = '55555555-5555-4555-8555-555555555555';
const OTHER_CATEGORY = '66666666-6666-4666-8666-666666666666';

/**
 * Real-shaped paths - `demandes/<userId>/<draftId>/<uuid>.<ext>`, the shape `buildPhotoPath`
 * produces and `checkPhotoPaths` enforces with a whole-string regex. `p1.jpg` would be refused by
 * the prefix check before the photo logic under test here was ever reached.
 */
const DRAFT = '77777777-7777-4777-8777-777777777777';
const PHOTO_1 = `demandes/${ME}/${DRAFT}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const PHOTO_2 = `demandes/${ME}/${DRAFT}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
const PHOTO_3 = `demandes/${ME}/${DRAFT}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;

/** Lyon 3e, the stored row's own coordinates, and Paris 17e for a postal-code move. */
const LYON = { lat: 45.7578, lng: 4.8524, city: 'Lyon 3e Arrondissement' };
const PARIS = { lat: 48.8869, lng: 2.3223, city: 'Paris 17e Arrondissement' };

const savedEnv = { ...process.env };

beforeEach(() => {
  // 🛑 `apps/api/.env` really does set `STORAGE_DRIVER=supabase` with both credentials, so a fresh
  // process would select the REAL gateway and every signed read would hit the network. Cleared
  // here and the memoised factory reset, the same guard `demande-detail-dto.spec.ts` uses.
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
});

afterEach(() => {
  process.env = { ...savedEnv };
  __resetStorageGateway();
});

type RowOpts = {
  status?: DemandeStatus;
  /** Live SENT offers, which is what locks the contract class. */
  offerCount?: number;
  /** `DemandePhoto` rows in `sortOrder`, as `DEMANDE_INCLUDE` returns them. */
  photoPaths?: string[];
};

/**
 * One stored row shaped exactly like `include: DEMANDE_INCLUDE` returns it: every editable scalar,
 * plus `photos`, `category`, `author`, `commandes` and the `_count` `present()` requires.
 */
function storedRow({ status = 'OPEN', offerCount = 0, photoPaths = [] }: RowOpts = {}) {
  return {
    id: DEMANDE,
    authorUserId: ME,
    categoryId: CATEGORY,
    brand: 'Apple',
    model: 'iPhone 13',
    title: 'iPhone 13, écran cassé',
    description: 'Écran fissuré en haut à droite, le tactile répond encore.',
    parts: 'UNKNOWN' as const,
    mode: 'OFFERS' as const,
    budgetCents: null as number | null,
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
    lat: LYON.lat as number | null,
    lng: LYON.lng as number | null,
    status,
    createdAt: new Date('2026-08-15T19:19:29Z'),
    category: { id: CATEGORY, slug: 'smartphone', labelFr: 'Smartphone' },
    photos: photoPaths.map((storagePath, sortOrder) => ({ storagePath, sortOrder })),
    author: { username: 'malek_k', createdAt: new Date('2024-03-04T10:00:00Z') },
    commandes: [],
    _count: { offers: offerCount },
  };
}

type Row = ReturnType<typeof storedRow>;

/**
 * The body the edit screen would submit for a row nobody touched - a FULL REPLACE of the eleven
 * editable fields with their current values. The empty-diff short-circuit is defined against
 * exactly this, so every "changed X" body below is this one with a single field moved.
 */
function unchangedBody(row: Row): UpdateDemandeInput {
  return {
    categoryId: row.categoryId,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    title: row.title,
    description: row.description,
    parts: row.parts,
    mode: row.mode,
    budgetCents: row.budgetCents ?? undefined,
    locationLabel: row.locationLabel,
    postalCode: row.postalCode,
    photoPaths: row.photos.map((p) => p.storagePath),
  };
}

type Opts = {
  /** The row the ownership-scoped read answers. `null` is "not yours, or nonexistent". */
  row?: Row | null;
  clientEnabled?: boolean;
  verificationLevel?: string;
  /** What the `USABLE_CATEGORY` re-check answers. `null` means the category is not usable. */
  category?: { id: string } | null;
  /** What BAN answers. `null` is its documented failure value, never a throw. */
  coords?: { lat: number; lng: number; city: string | null } | null;
  /** Which objects storage really holds, for `assertPhotosAttachable`'s existence check. */
  storedObjects?: string[];
  /** Stub for NotificationsService.emit, for the notification tests. */
  notificationsEmit?: Mock;
  /** Stub for prisma.offer.findMany, for the notification tests. */
  offerFindMany?: Mock;
};

function harness({
  row = storedRow(),
  clientEnabled = true,
  verificationLevel = 'BASIC',
  category = { id: OTHER_CATEGORY },
  coords = PARIS,
  storedObjects = [PHOTO_1, PHOTO_2, PHOTO_3],
  notificationsEmit,
  offerFindMany,
}: Opts = {}) {
  const gateway = storageGateway();
  if (!(gateway instanceof FakeStorageGateway)) {
    // Loud rather than silent: with the real gateway `assertPhotosAttachable` would reach the
    // network and the photo tests would fail for a reason unrelated to what they assert.
    throw new Error('expected the FAKE storage gateway - STORAGE_DRIVER leaked into this test');
  }
  for (const path of storedObjects) gateway.seed(path);

  const demandeFindFirst = vi.fn().mockResolvedValue(row);

  /**
   * Answers what Prisma would: the stored row with the written scalars applied, and the NESTED
   * photo write re-expressed as the rows it would produce. Merging `data` blindly would leave
   * `photos: { deleteMany, create }` on the row and `present()` would read a write instruction as
   * a photo list.
   */
  const demandeUpdate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
    const { photos, ...scalars } = args.data;
    const nested = photos as { create: { storagePath: string; sortOrder: number }[] } | undefined;
    return Promise.resolve({
      ...(row ?? storedRow()),
      ...scalars,
      photos: nested ? nested.create : (row?.photos ?? []),
    });
  });

  const categoryFindFirst = vi.fn().mockResolvedValue(category);
  const lookupPostalCode = vi.fn().mockResolvedValue(coords);

  const prisma = {
    // One stub for both gate reads: `assertClientEnabled` selects `clientEnabled`,
    // `assertBasicVerified` selects `verificationLevel`, and answering both keeps these tests
    // green whichever way `VERIFICATION_GATE_ENABLED` happens to be set.
    profile: { findFirst: vi.fn().mockResolvedValue({ clientEnabled, verificationLevel }) },
    demande: { findFirst: demandeFindFirst, update: demandeUpdate },
    category: { findFirst: categoryFindFirst },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    offer: { findMany: offerFindMany ?? vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const geocode = { lookupPostalCode } as unknown as GeocodeService;
  const notifications = { emit: notificationsEmit ?? vi.fn().mockResolvedValue(undefined) };

  return {
    service: new DemandesService(prisma, geocode, notifications as unknown as NotificationsService),
    demandeFindFirst,
    demandeUpdate,
    categoryFindFirst,
    lookupPostalCode,
  };
}

/** The rejection itself, so a test can assert on status, copy AND the `fields` map. */
async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

/**
 * What the CLIENT actually receives. `AppException` puts the French message and the `fields` map
 * in the HttpException response body, so asserting there rather than on `Error.message` pins the
 * shape the form reads.
 */
function bodyOf(error: AppException): { message: string; fields?: Record<string, string> } {
  return error.getResponse() as { message: string; fields?: Record<string, string> };
}

/** The single argument the write was called with, or a loud failure rather than `undefined`. */
function writeArgs(update: Mock): { where: unknown; data: Record<string, unknown> } {
  const call = update.mock.calls[0];
  if (!call) throw new Error('expected prisma.demande.update to have been called');
  return call[0] as { where: unknown; data: Record<string, unknown> };
}

describe('DemandesService.update', () => {
  it('404s when the demande belongs to someone else', async () => {
    const { service, demandeFindFirst, demandeUpdate } = harness({ row: null });

    const error = await rejection(service.update(ME, DEMANDE, unchangedBody(storedRow())));
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).message).toBe('Ressource introuvable.');

    // 🛑 THE ASSERTION THAT MAKES THE 404 INDISTINGUISHABLE. Ownership is in the WHERE, not a
    // fetch-then-compare, so another author's demande and a nonexistent id answer identically
    // and ids stay non-enumerable - the rule `offers.withdraw` states in its own file.
    const call = demandeFindFirst.mock.calls[0];
    if (!call) throw new Error('expected the demande read to have been called');
    expect(call[0].where).toEqual({ id: DEMANDE, authorUserId: ME, deletedAt: null, hiddenAt: null });

    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  it('422s on an IN_PROGRESS demande', async () => {
    const row = storedRow({ status: 'IN_PROGRESS' });
    const { service, demandeUpdate } = harness({ row });

    const error = await rejection(
      service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' }),
    );
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe("Cette demande n'est plus modifiable.");
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  it('422s on a CANCELLED demande', async () => {
    const row = storedRow({ status: 'CANCELLED' });
    const { service, demandeUpdate } = harness({ row });

    const error = await rejection(
      service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' }),
    );
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe("Cette demande n'est plus modifiable.");
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  /**
   * `CF-D7`'s whole point: offers do NOT freeze the listing, they freeze what was quoted on.
   * `description` is deliberately descriptive - the debatable one, settled by the owner - and the
   * notification is what covers the risk.
   */
  it('lets a descriptive field change while offers exist', async () => {
    const row = storedRow({ offerCount: 2 });
    const { service, demandeUpdate } = harness({ row });

    const dto = await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      description: 'Écran fissuré, et depuis hier le tactile ne répond plus du tout.',
    });

    expect(demandeUpdate).toHaveBeenCalledTimes(1);
    // The write targets the ONE row the ownership-scoped read already authorised, so a second
    // author cannot be reached by a `where` that widened past it.
    expect(writeArgs(demandeUpdate).where).toEqual({ id: DEMANDE });
    expect(writeArgs(demandeUpdate).data.description).toBe(
      'Écran fissuré, et depuis hier le tactile ne répond plus du tout.',
    );
    expect(dto.description).toBe(
      'Écran fissuré, et depuis hier le tactile ne répond plus du tout.',
    );
    // The count survives the write, which is what the edit screen re-reads to keep the lock on.
    expect(dto.offerCount).toBe(2);
  });

  it('422s when a contract field changes while offers exist', async () => {
    const row = storedRow({ offerCount: 1 });
    const { service, demandeUpdate, lookupPostalCode } = harness({ row });

    const error = await rejection(
      service.update(ME, DEMANDE, { ...unchangedBody(row), postalCode: '75017' }),
    );
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(
      'Des offres ont été reçues, ces informations ne peuvent plus être modifiées.',
    );

    // 🛑 The `fields` map is not decoration: `modifier.tsx` highlights by field name, the way the
    // wizard's FIELD_STEP map uses `assertPhotosAttachable`'s `{ photoPaths: … }`.
    expect(bodyOf(error).fields).toEqual({
      postalCode: "Modification impossible après réception d'une offre.",
    });

    expect(demandeUpdate).not.toHaveBeenCalled();
    // The refusal comes BEFORE any side effect, geocoding included.
    expect(lookupPostalCode).not.toHaveBeenCalled();
  });

  it('lets a contract field change when no offers exist', async () => {
    const row = storedRow({ offerCount: 0 });
    const { service, demandeUpdate, categoryFindFirst } = harness({ row });

    const dto = await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      categoryId: OTHER_CATEGORY,
    });

    expect(demandeUpdate).toHaveBeenCalledTimes(1);
    expect(writeArgs(demandeUpdate).data.categoryId).toBe(OTHER_CATEGORY);
    // Deliberately NOT asserting `dto.category` here. This stub returns the stored row's category
    // relation whatever `categoryId` was written, so an assertion on it would pin the STUB rather
    // than the service - real Prisma re-reads the relation through `include`.
    expect(dto.id).toBe(DEMANDE);

    // Re-validated against the SAME rule create uses - if a category cannot be offered to a
    // client it cannot be accepted from one. `USABLE_CATEGORY` is imported rather than retyped so
    // this assertion cannot drift from the fragment it checks.
    expect(categoryFindFirst).toHaveBeenCalledTimes(1);
    const call = categoryFindFirst.mock.calls[0];
    if (!call) throw new Error('expected the category re-check to have been called');
    expect(call[0].where).toEqual({ id: OTHER_CATEGORY, ...USABLE_CATEGORY });
  });

  /**
   * 🛑 THE SHORT-CIRCUIT, AND IT RUNS BEFORE THE CONTRACT LOCK. Without it, opening the edit
   * screen and pressing save with nothing touched would bump `updatedAt` and - once Task 8 lands -
   * notify every réparateur who quoted.
   */
  it('writes nothing when the body matches the stored row', async () => {
    const row = storedRow({ offerCount: 2, photoPaths: [PHOTO_1, PHOTO_2] });
    const { service, demandeUpdate, lookupPostalCode, categoryFindFirst } = harness({ row });

    const dto = await service.update(ME, DEMANDE, unchangedBody(row));

    expect(demandeUpdate).not.toHaveBeenCalled();
    expect(lookupPostalCode).not.toHaveBeenCalled();
    expect(categoryFindFirst).not.toHaveBeenCalled();

    // The CURRENT dto comes back rather than nothing, so the screen has something to render.
    expect(dto.id).toBe(DEMANDE);
    expect(dto.title).toBe(row.title);
    expect(dto.offerCount).toBe(2);
    expect(dto.photos).toHaveLength(2);
  });

  /**
   * 🛑 THE GUARD AGAINST A TRANSIENT GEOCODER FAILURE NULLING GOOD COORDINATES.
   * `lookupPostalCode` is best-effort and answers null on any failure, so re-running it against an
   * unchanged postal code would let one BAN outage overwrite `lat`/`lng` with null - a silent data
   * regression, invisible until distance sorting quietly stopped working.
   */
  it('does not re-geocode when postalCode is unchanged', async () => {
    const row = storedRow();
    const { service, demandeUpdate, lookupPostalCode } = harness({ row });

    await service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' });

    expect(lookupPostalCode).not.toHaveBeenCalled();
    // Not merely "not called": the STORED coordinates are carried forward into the write, which
    // is the half that a `lat: null` default would have broken while still passing the line above.
    const { data } = writeArgs(demandeUpdate);
    expect(data.lat).toBe(LYON.lat);
    expect(data.lng).toBe(LYON.lng);
  });

  it('geocodes when postalCode changes', async () => {
    const row = storedRow();
    const { service, demandeUpdate, lookupPostalCode } = harness({ row, coords: PARIS });

    await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      postalCode: '75017',
      locationLabel: 'Paris 17e',
    });

    expect(lookupPostalCode).toHaveBeenCalledTimes(1);
    expect(lookupPostalCode).toHaveBeenCalledWith('75017');
    const { data } = writeArgs(demandeUpdate);
    expect(data.lat).toBe(PARIS.lat);
    expect(data.lng).toBe(PARIS.lng);
  });

  it('422s on a category that is not usable', async () => {
    const row = storedRow();
    const { service, demandeUpdate } = harness({ row, category: null });

    const error = await rejection(
      service.update(ME, DEMANDE, { ...unchangedBody(row), categoryId: OTHER_CATEGORY }),
    );
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Cette catégorie est introuvable.');
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  /**
   * `photos: { deleteMany: {}, create: … }` is ONE nested write, so photos can never be
   * half-replaced - Prisma wraps a nested write in a single transaction, the reasoning `create()`
   * already records. Absent from `data` when nothing moved, so an unrelated title edit cannot
   * hard-delete and re-create every row.
   */
  it('leaves photos untouched when photoPaths is unchanged', async () => {
    const row = storedRow({ photoPaths: [PHOTO_1, PHOTO_2] });
    const { service, demandeUpdate } = harness({ row });

    await service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' });

    const { data } = writeArgs(demandeUpdate);
    expect('photos' in data).toBe(false);
  });

  it('replaces photos when photoPaths changed, with sortOrder from array order', async () => {
    const row = storedRow({ photoPaths: [PHOTO_1, PHOTO_2] });
    const { service, demandeUpdate } = harness({ row });

    await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      photoPaths: [PHOTO_3, PHOTO_1],
    });

    const { data } = writeArgs(demandeUpdate);
    expect(data.photos).toEqual({
      deleteMany: {},
      create: [
        { storagePath: PHOTO_3, sortOrder: 0 },
        { storagePath: PHOTO_1, sortOrder: 1 },
      ],
    });
  });

  /**
   * A REORDER is a change, and it is the one the length-only comparison would miss. `sortOrder`
   * comes from the submitted array order, so the same two paths in the other order really is a
   * different demande on screen.
   */
  it('counts a photo REORDER as a change', async () => {
    const row = storedRow({ photoPaths: [PHOTO_1, PHOTO_2] });
    const { service, demandeUpdate } = harness({ row });

    await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      photoPaths: [PHOTO_2, PHOTO_1],
    });

    // Reached the write at all, which the empty-diff short-circuit would have prevented.
    expect(demandeUpdate).toHaveBeenCalledTimes(1);
    expect(writeArgs(demandeUpdate).data.photos).toEqual({
      deleteMany: {},
      create: [
        { storagePath: PHOTO_2, sortOrder: 0 },
        { storagePath: PHOTO_1, sortOrder: 1 },
      ],
    });
  });

  /**
   * The widened `assertBasicVerified` action, and the reason it was widened: NEITHER existing
   * message was a reuse candidate - the publish one ends « … pour publier une demande », false on
   * an edit, and the offer one names sending an offer. The only unit-level cover for the new
   * string - `verification-gate.int.spec.ts` is excluded from `test:unit`.
   *
   * Changes nothing in production today: `VERIFICATION_GATE_ENABLED` is absent on Render, so the
   * gate returns immediately. It closes the hole before the flag exists.
   */
  it('refuses an unverified author with EDIT copy, not publish copy, when the gate is on', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';
    const row = storedRow();
    const { service, demandeUpdate } = harness({ row, verificationLevel: 'NONE' });

    const error = await rejection(
      service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' }),
    );
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error).message).toBe(
      'Confirmez votre e-mail ou votre téléphone pour modifier votre demande.',
    );
    expect(demandeUpdate).not.toHaveBeenCalled();
  });
});

describe('DemandesService.update notifications', () => {
  const REPAIRER_1 = '88888888-8888-4888-8888-888888888888';
  const REPAIRER_2 = '99999999-9999-4999-8999-999999999999';

  it('emits one DEMANDE_UPDATED per réparateur holding a SENT offer', async () => {
    const row = storedRow();
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const offerFindMany = vi.fn().mockResolvedValue([
      { repairerUserId: REPAIRER_1 },
      { repairerUserId: REPAIRER_2 },
    ]);
    const { service } = harness({ row, notificationsEmit, offerFindMany });

    await service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' });

    // Two SENT offers => emit called twice, once per repairerUserId
    expect(notificationsEmit).toHaveBeenCalledTimes(2);

    // First réparateur
    expect(notificationsEmit).toHaveBeenNthCalledWith(1, {
      userId: REPAIRER_1,
      mode: 'REPAIRER',
      type: 'DEMANDE_UPDATED',
      actorName: null,
      subject: 'Un titre tout neuf',
      demandeId: DEMANDE,
    });

    // Second réparateur
    expect(notificationsEmit).toHaveBeenNthCalledWith(2, {
      userId: REPAIRER_2,
      mode: 'REPAIRER',
      type: 'DEMANDE_UPDATED',
      actorName: null,
      subject: 'Un titre tout neuf',
      demandeId: DEMANDE,
    });

    // The query scoped to SENT and not soft-deleted - one definition of "live"
    expect(offerFindMany).toHaveBeenCalledTimes(1);
    const call = offerFindMany.mock.calls[0];
    if (!call) throw new Error('expected offerFindMany to have been called');
    expect(call[0].where).toEqual({
      demandeId: DEMANDE,
      status: 'SENT',
      deletedAt: null,
    });
  });

  it('emits nothing when the demande has no live offers', async () => {
    const row = storedRow({ offerCount: 0 });
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const offerFindMany = vi.fn().mockResolvedValue([]);
    const { service } = harness({ row, notificationsEmit, offerFindMany });

    await service.update(ME, DEMANDE, { ...unchangedBody(row), title: 'Un titre tout neuf' });

    // The query ran and found nothing, so emit was never called
    expect(offerFindMany).toHaveBeenCalledTimes(1);
    expect(notificationsEmit).not.toHaveBeenCalled();
  });

  it('emits nothing when the body changed nothing', async () => {
    const row = storedRow({ offerCount: 2, photoPaths: [PHOTO_1, PHOTO_2] });
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const offerFindMany = vi.fn().mockResolvedValue([
      { repairerUserId: REPAIRER_1 },
      { repairerUserId: REPAIRER_2 },
    ]);
    const { service, demandeUpdate } = harness({ row, notificationsEmit, offerFindMany });

    // Unchanged body => the service short-circuits before the write
    await service.update(ME, DEMANDE, unchangedBody(row));

    // Neither the write nor the offer query nor the emit reached
    expect(demandeUpdate).not.toHaveBeenCalled();
    expect(offerFindMany).not.toHaveBeenCalled();
    expect(notificationsEmit).not.toHaveBeenCalled();
  });

  it('still returns the updated demande when emit rejects', async () => {
    const row = storedRow();
    const notificationsEmit = vi.fn().mockRejectedValue(new Error('Database hiccup'));
    const offerFindMany = vi.fn().mockResolvedValue([{ repairerUserId: REPAIRER_1 }]);
    const { service } = harness({ row, notificationsEmit, offerFindMany });

    // emit() never throws in production; this pins that a notification failure cannot lose
    // the edit. The update resolves normally even though emit rejected.
    const dto = await service.update(ME, DEMANDE, {
      ...unchangedBody(row),
      title: 'Un titre tout neuf',
    });

    expect(dto.id).toBe(DEMANDE);
    expect(dto.title).toBe('Un titre tout neuf');
    expect(notificationsEmit).toHaveBeenCalledTimes(1);
  });
});
