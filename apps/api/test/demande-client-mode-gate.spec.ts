import { describe, expect, it, vi } from 'vitest';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { CreateDemandeInput } from '@revime/shared';

const USER_ID = 'user-v2-test';

const input: CreateDemandeInput = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'Écran cassé',
  description: 'Écran fissuré suite à une chute',
  parts: 'UNKNOWN',
  mode: 'OFFERS',
  locationLabel: 'Paris',
  postalCode: '75001',
  photoPaths: [],
};

function buildDemandesService(profile: { clientEnabled: boolean; activeMode?: 'CLIENT' | 'REPAIRER'; verificationLevel?: string } | null) {
  const profileUpdate = vi.fn().mockResolvedValue({});
  const mockProfile = profile
    ? {
        verificationLevel: 'BASIC',
        ...profile,
      }
    : null;
  const prisma = {
    profile: {
      findFirst: vi.fn().mockResolvedValue(mockProfile),
      update: profileUpdate,
    },
    category: {
      findFirst: vi.fn().mockResolvedValue({ id: input.categoryId, active: true, parentId: null }),
      findUnique: vi.fn().mockResolvedValue({ id: input.categoryId, active: true }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    demande: {
      create: vi.fn().mockResolvedValue({
        id: 'demande-1',
        title: input.title,
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: USER_ID,
        categoryId: input.categoryId,
        category: { id: input.categoryId, slug: 'smartphones', labelFr: 'Smartphones' },
        photos: [],
        author: { username: 'testuser', createdAt: new Date() },
        commandes: [],
        _count: { offers: 0 },
        isPrivate: false,
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  } as unknown as PrismaService;

  const geocode = { lookupPostalCode: vi.fn().mockResolvedValue({ lat: 48.85, lng: 2.35 }) } as unknown as GeocodeService;
  const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;

  const service = new DemandesService(prisma, geocode, notifications);
  return { service, prisma, profileUpdate };
}

describe('Bug V2: assertClientEnabled and activeMode synchronization', () => {
  it('allows publication when clientEnabled is true', async () => {
    const { service } = buildDemandesService({ clientEnabled: true, activeMode: 'CLIENT' });
    const result = await service.create(USER_ID, input);
    expect(result).toBeDefined();
    expect(result.title).toBe(input.title);
  });

  it('rejects publication when clientEnabled is false and activeMode is REPAIRER', async () => {
    const { service } = buildDemandesService({ clientEnabled: false, activeMode: 'REPAIRER' });
    await expect(service.create(USER_ID, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Activez le mode client pour publier une demande.',
    });
  });

  it('allows publication when clientEnabled is false but activeMode is CLIENT (Bug V2 resolution)', async () => {
    const { service, profileUpdate } = buildDemandesService({ clientEnabled: false, activeMode: 'CLIENT' });
    const result = await service.create(USER_ID, input);
    expect(result).toBeDefined();
    expect(result.title).toBe(input.title);
    // The gate only reads: it must not flip a flag the user did not touch.
    expect(profileUpdate).not.toHaveBeenCalled();
  });
});

describe('Bug V2: UsersService.updateModes client mode switching', () => {
  it('updates clientEnabled to true when switching activeMode to CLIENT with clientEnabled: true', async () => {
    const profileUpdate = vi.fn().mockResolvedValue({});
    const currentProfile = {
      userId: USER_ID,
      clientEnabled: false,
      repairerEnabled: true,
      activeMode: 'REPAIRER' as const,
      repairerSuspendedAt: null,
      onboardingCompletedAt: new Date(),
    };

    const prisma = {
      profile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(currentProfile),
      },
      $transaction: vi.fn(async (callback: any) => {
        const tx = {
          profile: { update: profileUpdate },
          user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ username: 'pro' }) },
          repairerProfile: { upsert: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      }),
    } as unknown as PrismaService;

    const usersService = new UsersService(
      prisma,
      {} as any,
    );

    // Mock me() call at the end of updateModes
    vi.spyOn(usersService, 'me').mockResolvedValue({} as any);

    await usersService.updateModes(USER_ID, { activeMode: 'CLIENT', clientEnabled: true });

    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        data: expect.objectContaining({
          activeMode: 'CLIENT',
          clientEnabled: true,
        }),
      }),
    );
  });
});
