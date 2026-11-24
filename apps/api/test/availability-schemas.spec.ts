import { describe, expect, it, vi } from 'vitest';
import {
  DAYS_IN_WEEK,
  DAY_LABELS_FR,
  formatDayHours,
  formatMinutes,
  updateAvailabilitySchema,
} from '@revime/shared';
import { UsersService } from '../src/users/users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const open = (dayOfWeek: number, opensAt = 540, closesAt = 1080) => ({
  dayOfWeek,
  closed: false,
  opensAt,
  closesAt,
});
const shut = (dayOfWeek: number) => ({ dayOfWeek, closed: true, opensAt: null, closesAt: null });
const week = () => [1, 2, 3, 4, 5, 6, 7].map((d) => open(d));

describe('updateAvailabilitySchema', () => {
  it('accepts a full week of open days', () => {
    expect(updateAvailabilitySchema.safeParse({ days: week() }).success).toBe(true);
  });

  it('accepts an empty array, which is how hours are cleared', () => {
    expect(updateAvailabilitySchema.safeParse({ days: [] }).success).toBe(true);
  });

  it('accepts a mix of open and closed days', () => {
    const days = [open(1), open(2), open(3), open(4), open(5), shut(6), shut(7)];
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(true);
  });

  /** Partial weeks are refused so the fiche's rendering is total over the week. */
  it('refuses a partial week', () => {
    const days = week().slice(0, 3);
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(false);
  });

  it('refuses a duplicated day', () => {
    const days = [open(1), open(1), open(3), open(4), open(5), open(6), open(7)];
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(false);
  });

  it('refuses a day outside 1..7', () => {
    const days = [open(0), open(2), open(3), open(4), open(5), open(6), open(7)];
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(false);
  });

  /** The Zod mirror of the Postgres CHECK: closed means no hours, open means both. */
  it('refuses a closed day carrying hours', () => {
    const days = week();
    days[0] = { dayOfWeek: 1, closed: true, opensAt: 540, closesAt: 1080 } as any;
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(false);
  });

  it('refuses an open day with no hours', () => {
    const days = week();
    days[0] = { dayOfWeek: 1, closed: false, opensAt: null, closesAt: null } as any;
    expect(updateAvailabilitySchema.safeParse({ days }).success).toBe(false);
  });

  it('refuses closesAt at or before opensAt', () => {
    expect(updateAvailabilitySchema.safeParse({ days: [open(1, 1080, 540), open(2), open(3), open(4), open(5), open(6), open(7)] }).success).toBe(false);
    expect(updateAvailabilitySchema.safeParse({ days: [open(1, 540, 540), open(2), open(3), open(4), open(5), open(6), open(7)] }).success).toBe(false);
  });

  it('accepts midnight at the end of the day as 1440 and refuses 1441', () => {
    expect(updateAvailabilitySchema.safeParse({ days: [open(1, 0, 1440), open(2), open(3), open(4), open(5), open(6), open(7)] }).success).toBe(true);
    expect(updateAvailabilitySchema.safeParse({ days: [open(1, 0, 1441), open(2), open(3), open(4), open(5), open(6), open(7)] }).success).toBe(false);
  });

  it('refuses a non-integer minute', () => {
    expect(updateAvailabilitySchema.safeParse({ days: [open(1, 540.5), open(2), open(3), open(4), open(5), open(6), open(7)] }).success).toBe(false);
  });
});

describe('DAY_LABELS_FR', () => {
  it('names all seven days, Monday first', () => {
    expect(Object.keys(DAY_LABELS_FR)).toHaveLength(DAYS_IN_WEEK);
    expect(DAY_LABELS_FR[1]).toBe('Lundi');
    expect(DAY_LABELS_FR[7]).toBe('Dimanche');
  });
});

describe('formatMinutes', () => {
  it('renders whole hours without minutes, French style', () => {
    expect(formatMinutes(540)).toBe('09h');
    expect(formatMinutes(0)).toBe('00h');
  });

  it('pads a non-zero minute to two digits', () => {
    expect(formatMinutes(570)).toBe('09h30');
    expect(formatMinutes(545)).toBe('09h05');
  });

  it('renders end-of-day midnight as 24h rather than 00h', () => {
    expect(formatMinutes(1440)).toBe('24h');
  });
});

describe('formatDayHours', () => {
  it('renders a range for an open day', () => {
    expect(formatDayHours(open(1))).toBe('09h – 18h');
  });

  it('renders Fermé for a closed day', () => {
    expect(formatDayHours(shut(1))).toBe('Fermé');
  });

  /**
   * Defence in depth against a row that reached the client from an API older than the
   * CHECK constraint: null hours on a non-closed day must not render « NaN ».
   */
  it('renders Fermé for an open day with missing hours rather than a broken range', () => {
    expect(formatDayHours({ dayOfWeek: 1, closed: false, opensAt: null, closesAt: null })).toBe('Fermé');
  });
});

function serviceWithTx(repairerEnabled: boolean) {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const createMany = vi.fn().mockResolvedValue({ count: 7 });
  const tx = { repairerAvailability: { deleteMany, createMany } };

  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'u1', email: 'r@example.test', name: 'T', firstName: null, lastName: null,
        username: 't', phone: null, emailVerified: true, phoneVerifiedAt: null,
        image: null, role: null,
        profile: {
          clientEnabled: true, repairerEnabled: true, activeMode: 'REPAIRER' as const,
          verificationLevel: 'BASIC' as const, onboardingCompletedAt: null, avatarPath: null,
          deletedAt: null, notifyOffers: true, notifyMessages: true, notifyCommandes: true,
        },
        repairerProfile: {
          kind: 'INDIVIDUAL' as const, displayName: 'A', bio: null, postalCode: null,
          serviceAreaLabel: null, bannerPath: null, serviceRadiusKm: null, deletedAt: null,
        },
        repairerCategories: [],
        repairerAvailability: [],
      }),
    },
  } as unknown as PrismaService;

  const service = new UsersService(prisma, { lookupPostalCode: vi.fn() } as never);
  return { service, deleteMany, createMany };
}

const fullWeek = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  dayOfWeek: d, closed: false, opensAt: 540, closesAt: 1080,
}));

describe('UsersService.setAvailability', () => {
  it('refuses an account that is not a réparateur', async () => {
    const { service } = serviceWithTx(false);
    await expect(service.setAvailability('u1', { days: fullWeek })).rejects.toThrow(
      /mode réparateur/i,
    );
  });

  it('replaces the whole week in one transaction', async () => {
    const { service, deleteMany, createMany } = serviceWithTx(true);
    await service.setAvailability('u1', { days: fullWeek });

    expect(deleteMany).toHaveBeenCalledWith({ where: { repairerUserId: 'u1' } });
    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = createMany.mock.calls[0]?.[0] as { data: unknown[] };
    expect(arg.data).toHaveLength(7);
  });

  /** Clearing deletes and inserts nothing - no empty createMany round trip. */
  it('deletes without inserting when the array is empty', async () => {
    const { service, deleteMany, createMany } = serviceWithTx(true);
    await service.setAvailability('u1', { days: [] });

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('stamps every row with the session user, never a value from the body', async () => {
    const { service, createMany } = serviceWithTx(true);
    await service.setAvailability('u1', { days: fullWeek });

    const arg = createMany.mock.calls[0]?.[0] as { data: { repairerUserId: string }[] };
    expect(arg.data.every((r) => r.repairerUserId === 'u1')).toBe(true);
  });

  it('returns the fresh MeResponse rather than the input', async () => {
    const { service } = serviceWithTx(true);
    const me = await service.setAvailability('u1', { days: fullWeek });
    expect(me.id).toBe('u1');
  });
});
