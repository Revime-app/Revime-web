import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-51`. Unit tests for `updateRepairer`'s conditional-spread semantics: `{ postalCode }` alone
 * leaves an existing radius intact, `serviceRadiusKm: null` clears it, a number sets it.
 *
 * This is the backward-compatibility guarantee for an app older than this deploy - and it has a
 * LIVE caller in this same tree: `apps/mobile/app/demande/[id]/offre.tsx` (~`:150`) sends
 * `{ postalCode: postalCode.trim() }` and nothing else, so a regression to a plain assignment
 * would null the radius for any réparateur who saves a postal code from that screen.
 */

const USER = '11111111-1111-4111-8111-111111111111';

/** Captures what the service wrote, so the conditional-spread semantics are asserted. */
type Harness = {
  service: UsersService;
  profileUpdate: ReturnType<typeof vi.fn>;
};

function harness(): Harness {
  const profileUpdate = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ userId: USER, ...data }),
  );

  /**
   * 🛑 THE MOCK MUST COVER EVERY READ ON THE PATH, NOT JUST THE ONE BEING ASSERTED. `updateRepairer`
   * touches four collaborators, in this order, and a gap in ANY of them throws before the
   * expectation runs - which reads as a failing assertion while actually proving nothing:
   *
   *   1. `prisma.profile.findFirst`      - `assertRepairerEnabled`, the réparateur-mode refusal
   *   2. `geocode.lookupPostalCode`      - derives lat / lng / serviceAreaLabel
   *   3. `prisma.repairerProfile.update` - the write these tests capture
   *   4. `prisma.user.findUniqueOrThrow` - `updateRepairer` returns `this.me(userId)`
   *
   * Shape copied from `availability-schemas.spec.ts`'s `serviceWithTx`, which is this repo's
   * worked example for a complete `UsersService` mock including the `me()` read.
   */
  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: USER,
        email: 'a@b.fr',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        username: 'test',
        phone: null,
        emailVerified: true,
        phoneVerifiedAt: null,
        image: null,
        role: null,
        profile: {
          clientEnabled: true,
          repairerEnabled: true,
          activeMode: 'CLIENT',
          verificationLevel: 'NONE',
          onboardingCompletedAt: null,
          avatarPath: null,
          deletedAt: null,
          notifyOffers: true,
          notifyMessages: true,
          notifyCommandes: true,
        },
        /**
         * `bannerPath` and `avatarPath` are BOTH explicitly null, which is load-bearing rather
         * than tidy: `me()` ends in `present()`, and a non-null media path there makes it reach
         * for the storage gateway to sign a read URL. `serviceWithTx` nulls them for the same
         * reason. The rest of the fields are what `present()` reads off a repairerProfile.
         */
        repairerProfile: {
          userId: USER,
          kind: 'INDIVIDUAL' as const,
          displayName: 'Atelier Test',
          bio: null,
          postalCode: '75001',
          serviceAreaLabel: 'Paris',
          bannerPath: null,
          serviceRadiusKm: 50,
          deletedAt: null,
        },
        repairerCategories: [],
        repairerAvailability: [],
      }),
    },
    repairerProfile: {
      update: profileUpdate,
    },
  } as unknown as PrismaService;

  const geocode = {
    lookupPostalCode: vi.fn().mockResolvedValue({ lat: 48.8566, lng: 2.3522, city: 'Paris' }),
  } as unknown as GeocodeService;

  return {
    service: new UsersService(prisma, geocode),
    profileUpdate,
  };
}

describe('updateRepairer conditional spread', () => {
  it('leaves serviceRadiusKm ABSENT in the data object when only postalCode is sent', async () => {
    const h = harness();

    await h.service.updateRepairer(USER, { postalCode: '69003' });

    // The key must not be present at all, not even as undefined. The data object will include
    // postalCode, lat, lng, serviceAreaLabel (from geocode), but NOT serviceRadiusKm.
    const call = h.profileUpdate.mock.calls[0]?.[0] as { where: unknown; data: Record<string, unknown> } | undefined;
    expect(call).toBeDefined();
    expect(call?.where).toEqual({ userId: USER });
    expect(call?.data).toHaveProperty('postalCode', '69003');
    expect(call?.data).toHaveProperty('lat');
    expect(call?.data).toHaveProperty('lng');
    expect(call?.data).toHaveProperty('serviceAreaLabel');
    expect('serviceRadiusKm' in (call?.data ?? {})).toBe(false);
  });

  it('passes serviceRadiusKm: null explicitly when sent as null', async () => {
    const h = harness();

    await h.service.updateRepairer(USER, { postalCode: '69003', serviceRadiusKm: null });

    const call = h.profileUpdate.mock.calls[0]?.[0] as { where: unknown; data: Record<string, unknown> } | undefined;
    expect(call).toBeDefined();
    expect(call?.where).toEqual({ userId: USER });
    expect(call?.data).toHaveProperty('postalCode', '69003');
    expect(call?.data).toHaveProperty('serviceRadiusKm', null);
  });

  it('passes serviceRadiusKm as a number when sent', async () => {
    const h = harness();

    await h.service.updateRepairer(USER, { postalCode: '69003', serviceRadiusKm: 25 });

    const call = h.profileUpdate.mock.calls[0]?.[0] as { where: unknown; data: Record<string, unknown> } | undefined;
    expect(call).toBeDefined();
    expect(call?.where).toEqual({ userId: USER });
    expect(call?.data).toHaveProperty('postalCode', '69003');
    expect(call?.data).toHaveProperty('serviceRadiusKm', 25);
  });
});
