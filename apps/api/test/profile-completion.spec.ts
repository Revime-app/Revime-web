import { describe, expect, it, vi } from 'vitest';
import { CHECKLIST_KEYS, repairerProfileCompletion, type CompletionInput } from '@revime/shared';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const EMPTY: CompletionInput = {
  avatarUrl: null,
  image: null,
  bannerUrl: null,
  bio: null,
  categoryIds: [],
  postalCode: null,
  availabilityDays: 0,
};

const FULL: CompletionInput = {
  avatarUrl: 'https://example.test/a.jpg',
  image: null,
  bannerUrl: 'https://example.test/b.jpg',
  bio: 'Je répare des vélos depuis dix ans.',
  categoryIds: ['11111111-1111-4111-8111-111111111111'],
  postalCode: '69003',
  availabilityDays: 7,
};

describe('repairerProfileCompletion', () => {
  it('is 0 of 6 for a réparateur who has filled nothing in', () => {
    const c = repairerProfileCompletion(EMPTY);
    expect(c.completed).toBe(0);
    expect(c.total).toBe(6);
    expect(Object.values(c.items).every((v) => v === false)).toBe(true);
  });

  it('is 6 of 6 when everything is set', () => {
    const c = repairerProfileCompletion(FULL);
    expect(c.completed).toBe(6);
    expect(c.total).toBe(6);
    expect(Object.values(c.items).every((v) => v === true)).toBe(true);
  });

  /** total derives from the key list, so adding a seventh row cannot leave it saying 6. */
  it('derives total from CHECKLIST_KEYS rather than a literal', () => {
    expect(repairerProfileCompletion(EMPTY).total).toBe(CHECKLIST_KEYS.length);
  });

  it('reports the six keys the client drew, in his order', () => {
    expect([...CHECKLIST_KEYS]).toEqual([
      'photo',
      'banner',
      'description',
      'categories',
      'zone',
      'availability',
    ]);
  });

  it('counts each field independently', () => {
    expect(repairerProfileCompletion({ ...EMPTY, avatarUrl: 'x' }).items.photo).toBe(true);
    expect(repairerProfileCompletion({ ...EMPTY, bannerUrl: 'x' }).items.banner).toBe(true);
    expect(repairerProfileCompletion({ ...EMPTY, bio: 'Salut' }).items.description).toBe(true);
    expect(repairerProfileCompletion({ ...EMPTY, categoryIds: ['a'] }).items.categories).toBe(true);
    expect(repairerProfileCompletion({ ...EMPTY, postalCode: '69003' }).items.zone).toBe(true);
    expect(repairerProfileCompletion({ ...EMPTY, availabilityDays: 7 }).items.availability).toBe(true);
  });

  it('counts exactly one row per field and never bleeds into a neighbour', () => {
    const c = repairerProfileCompletion({ ...EMPTY, postalCode: '69003' });
    expect(c.completed).toBe(1);
    expect(c.items.zone).toBe(true);
    expect(c.items.availability).toBe(false);
  });

  /**
   * 🛑 An OAuth `image` counts as a photo. The precedence everywhere is `avatarUrl ?? image`,
   * and one live account has a Google image with no upload - telling that réparateur to add a
   * photo while his photo is on screen would be a false statement about his own profile.
   */
  it('counts an OAuth image as a photo when nothing was uploaded', () => {
    const c = repairerProfileCompletion({ ...EMPTY, image: 'https://lh3.googleusercontent.com/x' });
    expect(c.items.photo).toBe(true);
  });

  it('prefers the uploaded photo but does not require it', () => {
    const c = repairerProfileCompletion({ ...EMPTY, avatarUrl: 'a', image: 'b' });
    expect(c.items.photo).toBe(true);
  });

  /** '' and whitespace are not a description. The column normalises '' to null; this is defence. */
  it('does not count a blank or whitespace-only bio', () => {
    expect(repairerProfileCompletion({ ...EMPTY, bio: '' }).items.description).toBe(false);
    expect(repairerProfileCompletion({ ...EMPTY, bio: '   ' }).items.description).toBe(false);
  });

  /**
   * 🛑 THE RADIUS DOES NOT GATE THE ZONE ROW, and this test is the guard on that decision.
   * Postal code is the load-bearing half - it drives the displayed distance and the proximity
   * sort. Requiring the radius would flip this row to incomplete for every existing réparateur
   * the moment the slice deploys. `CompletionInput` therefore has no radius field at all.
   */
  it('completes the zone row on the postal code alone', () => {
    expect(repairerProfileCompletion({ ...EMPTY, postalCode: '69003' }).items.zone).toBe(true);
  });

  /** Seven closed days is still an answer, so the row is complete. */
  it('completes the availability row for a fully closed week', () => {
    expect(repairerProfileCompletion({ ...EMPTY, availabilityDays: 7 }).items.availability).toBe(true);
  });
});

/**
 * `present()` at the DTO level, with Prisma mocked - the pattern `banner-read-dtos.spec.ts`
 * established. No database, so this runs under `test:unit`.
 */
function usersService(over: {
  serviceRadiusKm?: number | null;
  availability?: { dayOfWeek: number; closed: boolean; opensAt: number | null; closesAt: number | null }[];
  postalCode?: string | null;
  bio?: string | null;
  image?: string | null;
}): UsersService {
  const user = {
    id: 'u1',
    email: 'r@example.test',
    name: 'Thomas Martin',
    firstName: 'Thomas',
    lastName: 'Martin',
    username: 'thomas',
    phone: null,
    emailVerified: true,
    phoneVerifiedAt: null,
    image: over.image ?? null,
    role: null,
    profile: {
      clientEnabled: true,
      repairerEnabled: true,
      activeMode: 'REPAIRER' as const,
      verificationLevel: 'BASIC' as const,
      onboardingCompletedAt: null,
      avatarPath: null,
      deletedAt: null,
      notifyOffers: true,
      notifyMessages: true,
      notifyCommandes: true,
    },
    repairerProfile: {
      kind: 'INDIVIDUAL' as const,
      displayName: 'Atelier Thomas',
      bio: over.bio ?? null,
      postalCode: over.postalCode ?? null,
      serviceAreaLabel: null,
      bannerPath: null,
      serviceRadiusKm: over.serviceRadiusKm ?? null,
      deletedAt: null,
    },
    repairerCategories: [],
    repairerAvailability: over.availability ?? [],
  };

  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue(user) },
  } as unknown as PrismaService;

  // Second constructor arg is the geocoding gateway; `me()` never calls it.
  return new UsersService(prisma, { lookupPostalCode: vi.fn() } as never);
}

describe('MeResponse.repairer, new fields', () => {
  it('carries a null radius for a réparateur who has not stated one', async () => {
    const me = await usersService({}).me('u1');
    expect(me.repairer?.serviceRadiusKm).toBeNull();
  });

  it('carries the radius he stated', async () => {
    const me = await usersService({ serviceRadiusKm: 20 }).me('u1');
    expect(me.repairer?.serviceRadiusKm).toBe(20);
  });

  it('carries an empty availability array when he has answered nothing', async () => {
    const me = await usersService({}).me('u1');
    expect(me.repairer?.availability).toEqual([]);
  });

  it('carries the seven days he saved', async () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dayOfWeek: d,
      closed: false,
      opensAt: 540,
      closesAt: 1080,
    }));
    const me = await usersService({ availability: days }).me('u1');
    expect(me.repairer?.availability).toHaveLength(7);
    expect(me.repairer?.availability[0]?.dayOfWeek).toBe(1);
  });

  it('reports completion computed from the same response', async () => {
    const me = await usersService({}).me('u1');
    expect(me.repairer?.completion.completed).toBe(0);
    expect(me.repairer?.completion.total).toBe(6);
  });

  it('counts the postal code and the availability rows towards completion', async () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, closed: true, opensAt: null, closesAt: null }));
    const me = await usersService({ postalCode: '69003', availability: days, bio: 'Bonjour' }).me('u1');
    expect(me.repairer?.completion.items.zone).toBe(true);
    expect(me.repairer?.completion.items.availability).toBe(true);
    expect(me.repairer?.completion.items.description).toBe(true);
    expect(me.repairer?.completion.completed).toBe(3);
  });

  /** The OAuth-image fallback, asserted through the real call site rather than the function. */
  it('counts an OAuth image towards the photo row', async () => {
    const me = await usersService({ image: 'https://lh3.googleusercontent.com/x' }).me('u1');
    expect(me.repairer?.completion.items.photo).toBe(true);
  });
});
