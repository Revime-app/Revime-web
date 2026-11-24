import { describe, expect, it, vi } from 'vitest';
import { RepairersService } from '../src/repairers/repairers.service.js';
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
 * `CF-51` / `CF-52`, the read side of the fiche.
 *
 * The asymmetry with the CARD is the subject here, exactly as `banner-read-dtos.spec.ts` records
 * for the banner: both fields are on `RepairerProfileDto` only. `list` has no `take`, so adding
 * either to the card would put an unbounded per-row cost on the directory for something a 44pt
 * row does not draw.
 */

const REPAIRER = 'repairer-1';
const CLIENT = 'client-1';

const week = () =>
  [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    dayOfWeek: d,
    closed: d === 7,
    opensAt: d === 7 ? null : 540,
    closesAt: d === 7 ? null : 1080,
  }));

function repairersService(row: {
  serviceRadiusKm?: number | null;
  availability?: ReturnType<typeof week>;
}): RepairersService {
  const shaped = {
    userId: REPAIRER,
    displayName: 'Atelier Thomas',
    serviceAreaLabel: 'Lyon 3e',
    bio: null,
    bannerPath: null,
    serviceRadiusKm: row.serviceRadiusKm ?? null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      username: 'thomas',
      profile: { verificationLevel: 'NONE', avatarPath: null },
      repairerAvailability: row.availability ?? [],
    },
  };

  const prisma = withUserLookups({
    repairerProfile: {
      findMany: vi.fn().mockResolvedValue([shaped]),
      findFirst: vi.fn().mockResolvedValue(shaped),
    },
    repairerCategory: { findMany: vi.fn().mockResolvedValue([]) },
    review: { groupBy: vi.fn().mockResolvedValue([]) },
    commande: { groupBy: vi.fn().mockResolvedValue([]) },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return new RepairersService(prisma, noGeocode);
}

describe('RepairerProfileDto.serviceRadiusKm', () => {
  it('is null for a réparateur who has not stated one', async () => {
    const p = await repairersService({}).getPublicProfile(REPAIRER);
    expect(p.serviceRadiusKm).toBeNull();
  });

  it('is the number he stated', async () => {
    const p = await repairersService({ serviceRadiusKm: 20 }).getPublicProfile(REPAIRER);
    expect(p.serviceRadiusKm).toBe(20);
  });
});

describe('RepairerProfileDto.availability', () => {
  it('is empty for a réparateur who has answered nothing', async () => {
    const p = await repairersService({}).getPublicProfile(REPAIRER);
    expect(p.availability).toEqual([]);
  });

  it('carries seven rows, Monday first, with a closed Sunday', async () => {
    const p = await repairersService({ availability: week() }).getPublicProfile(REPAIRER);
    expect(p.availability).toHaveLength(7);
    expect(p.availability[0]?.dayOfWeek).toBe(1);
    expect(p.availability[6]?.closed).toBe(true);
    expect(p.availability[6]?.opensAt).toBeNull();
  });
});

describe('RepairerCardDto carries neither', () => {
  /**
   * 🛑 NEGATIVE ASSERTIONS ON PURPOSE - the thing a later « add it everywhere for consistency »
   * edit would break silently. `list` has no `take`.
   */
  it('has no serviceRadiusKm and no availability', async () => {
    const cards = await repairersService({
      serviceRadiusKm: 20,
      availability: week(),
    }).list(CLIENT, {});

    expect(cards[0]).not.toHaveProperty('serviceRadiusKm');
    expect(cards[0]).not.toHaveProperty('availability');
  });
});
