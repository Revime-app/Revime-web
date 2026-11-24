import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-47`. Unit tests with a hand-shaped Prisma stub and NO `vi.mock`, the standing
 * pattern in this directory - `DATABASE_URL` points at PRODUCTION even locally, so the
 * integration suite writes and cannot be extended for this.
 *
 * What these pin is the PARTIAL-update contract: one switch on one screen must not
 * overwrite the other two groups with whatever the app happened to have cached.
 */

const USER = '11111111-1111-4111-8111-111111111111';

type Prefs = { notifyOffers: boolean; notifyMessages: boolean; notifyCommandes: boolean };

function harness(current: Prefs = { notifyOffers: true, notifyMessages: true, notifyCommandes: true }) {
  let stored: Prefs = { ...current };

  const profileUpdate = vi.fn().mockImplementation(({ data }: { data: Partial<Prefs> }) => {
    stored = { ...stored, ...data };
    return Promise.resolve({ userId: USER, ...stored });
  });

  const prisma = {
    profile: { update: profileUpdate },
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
            repairerEnabled: false,
            activeMode: 'CLIENT' as const,
            verificationLevel: 'NONE' as const,
            onboardingCompletedAt: null,
            avatarPath: null,
            deletedAt: null,
            ...stored,
          },
          repairerProfile: null,
          repairerCategories: [],
          repairerAvailability: [],
        }),
      ),
    },
  };

  const geocode = { lookup: vi.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    geocode as unknown as GeocodeService,
  );
  return { service, profileUpdate, read: () => stored };
}

describe('UsersService.updateNotificationPreferences', () => {
  it('writes ONLY the groups named in the body', async () => {
    const { service, profileUpdate } = harness();

    await service.updateNotificationPreferences(USER, { offers: false });

    expect(profileUpdate).toHaveBeenCalledTimes(1);
    expect(profileUpdate.mock.calls[0]![0].data).toEqual({ notifyOffers: false });
  });

  it('leaves the other two groups untouched', async () => {
    const { service, read } = harness();

    await service.updateNotificationPreferences(USER, { messages: false });

    expect(read()).toEqual({ notifyOffers: true, notifyMessages: false, notifyCommandes: true });
  });

  it('accepts all three at once', async () => {
    const { service, profileUpdate } = harness();

    await service.updateNotificationPreferences(USER, {
      offers: false,
      messages: false,
      commandes: false,
    });

    expect(profileUpdate.mock.calls[0]![0].data).toEqual({
      notifyOffers: false,
      notifyMessages: false,
      notifyCommandes: false,
    });
  });

  it('writes nothing at all for an empty body rather than clearing three columns', async () => {
    const { service, profileUpdate, read } = harness({
      notifyOffers: false,
      notifyMessages: true,
      notifyCommandes: true,
    });

    await service.updateNotificationPreferences(USER, {});

    expect(profileUpdate).not.toHaveBeenCalled();
    expect(read()).toEqual({ notifyOffers: false, notifyMessages: true, notifyCommandes: true });
  });

  it('returns the freshly written MeResponse', async () => {
    const { service } = harness();

    const me = await service.updateNotificationPreferences(USER, { commandes: false });

    expect(me.profile.notifyCommandes).toBe(false);
    expect(me.profile.notifyOffers).toBe(true);
  });
});
