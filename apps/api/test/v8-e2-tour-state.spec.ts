import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import type { TourModeState } from '@revime/shared';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/** V8 E2 (`DEC8-09` (2)): `Profile.tourState`, presented in `/me` and written by `PATCH /users/me/tour`. */

const USER = '11111111-1111-4111-8111-111111111111';
const at = (iso: string, seen: TourModeState['seen'] = []): TourModeState => ({ offer: 'STARTED', seen, updatedAt: iso });

function harness(tourState: unknown) {
  let stored: unknown = tourState;
  const profileUpdate = vi.fn().mockImplementation(({ data }: { data: { tourState: unknown } }) => {
    stored = data.tourState;
    return Promise.resolve({});
  });
  const profileRead = vi.fn().mockImplementation(() => Promise.resolve({ tourState: stored }));
  const prisma: Record<string, unknown> = {
    profile: { update: profileUpdate, findUniqueOrThrow: profileRead },
    user: {
      findUniqueOrThrow: vi.fn().mockImplementation(() =>
        Promise.resolve({
          id: USER, email: 'a@b.fr', name: 'Malek K', firstName: 'Malek', lastName: 'K', username: 'malek_k',
          phone: null, emailVerified: true, phoneVerifiedAt: null, image: null, role: null,
          profile: {
            clientEnabled: true, repairerEnabled: true, activeMode: 'CLIENT' as const,
            verificationLevel: 'NONE' as const, onboardingCompletedAt: null, avatarPath: null, deletedAt: null,
            notifyOffers: true, notifyMessages: true, notifyCommandes: true,
            tourState: stored,
          },
          repairerProfile: null, repairerCategories: [], repairerAvailability: [],
        }),
      ),
    },
  };
  prisma.$transaction = vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const service = new UsersService(prisma as unknown as PrismaService, { lookup: vi.fn() } as unknown as GeocodeService);
  return { service, profileUpdate, read: () => stored };
}

describe('UsersService.me — profile.tour', () => {
  it('is null when the column is null (never offered)', async () => {
    const me = await harness(null).service.me(USER);
    expect(me.profile.tour).toBeNull();
  });

  it('is the stored state when the column is valid', async () => {
    const state = { CLIENT: at('2026-11-17T20:00:00.000Z', ['accueil']), REPAIRER: null };
    const me = await harness(state).service.me(USER);
    expect(me.profile.tour).toEqual(state);
  });

  it('reads a corrupt column as both modes empty instead of failing', async () => {
    const me = await harness({ CLIENT: 42 }).service.me(USER);
    expect(me.profile.tour).toEqual({ CLIENT: null, REPAIRER: null });
  });
});

describe('UsersService.updateTour', () => {
  it('stores the written mode on a never-written column', async () => {
    const { service, read } = harness(null);
    const incoming = at('2026-11-17T20:00:00.000Z');
    const out = await service.updateTour(USER, { mode: 'CLIENT', state: incoming });
    expect(out).toEqual({ CLIENT: incoming, REPAIRER: null });
    expect(read()).toEqual({ CLIENT: incoming, REPAIRER: null });
  });

  it('stale PATCH keeps the newer state', async () => {
    const newer = at('2026-11-17T21:00:00.000Z', ['accueil', 'profil']);
    const { service, read } = harness({ CLIENT: null, REPAIRER: newer });
    const out = await service.updateTour(USER, { mode: 'REPAIRER', state: at('2026-11-17T20:00:00.000Z') });
    expect(out.REPAIRER).toEqual(newer);
    expect((read() as { REPAIRER: unknown }).REPAIRER).toEqual(newer);
  });

  it('never touches the other mode', async () => {
    const client = at('2026-11-17T19:00:00.000Z', ['messages']);
    const { service } = harness({ CLIENT: client, REPAIRER: null });
    const out = await service.updateTour(USER, { mode: 'REPAIRER', state: at('2026-11-17T20:00:00.000Z') });
    expect(out.CLIENT).toEqual(client);
  });

  it('a newer write replaces the stored mode (« Revoir la visite » resets seen)', async () => {
    const { service } = harness({ CLIENT: at('2026-11-17T19:00:00.000Z', ['accueil', 'messages']), REPAIRER: null });
    const reset = at('2026-11-17T22:00:00.000Z', []);
    const out = await service.updateTour(USER, { mode: 'CLIENT', state: reset });
    expect(out.CLIENT).toEqual(reset);
  });
});

describe('UsersController — PATCH /users/me/tour', () => {
  it('routes PATCH me/tour to updateTour', () => {
    const handler = UsersController.prototype.updateTour;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/tour');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
  });
});
