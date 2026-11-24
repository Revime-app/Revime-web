import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isParisDaytime, reminderDue } from '../src/setup/setup-reminders.js';
import { SetupRemindersService } from '../src/setup/setup-reminders.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/** V8 E1, `DEC8-08` (1), (4), (5): two reminders, at 3 and 8 days, each once, never at night, never once complete. */

const DAY = 24 * 60 * 60 * 1000;
// 2026-11-20 10:00 UTC = 11:00 in Paris (winter, UTC+1).
const NOW = new Date('2026-11-20T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe('V8 E1 reminderDue', () => {
  const r = (createdAt: Date, s3: Date | null = null, s8: Date | null = null, complete = false) => ({
    createdAt,
    setupReminder3dAt: s3,
    setupReminder8dAt: s8,
    complete,
  });
  it.each([
    ['2 days, nothing sent', r(ago(2)), 'NONE'],
    ['3 days, nothing sent', r(ago(3)), 'FIRST'],
    ['5 days, 3-day sent', r(ago(5), ago(2)), 'NONE'],
    ['8 days, 3-day sent', r(ago(8), ago(5)), 'SECOND'],
    ['9 days, nothing sent (missed)', r(ago(9)), 'SECOND'],
    ['complete with a marker owed', r(ago(1), null, null, true), 'SETTLE'],
    ['complete, both settled', r(ago(10), ago(7), ago(2), true), 'NONE'],
    ['20 days, both sent', r(ago(20), ago(17), ago(12)), 'NONE'],
  ])('%s → %s', (_name, input, expected) => {
    expect(reminderDue(input, NOW)).toBe(expected);
  });
});

describe('V8 E1 isParisDaytime', () => {
  it('08:00 to 21:00 Paris time, winter (UTC+1)', () => {
    expect(isParisDaytime(new Date('2026-11-20T06:59:00Z'))).toBe(false); // 07:59
    expect(isParisDaytime(new Date('2026-11-20T07:00:00Z'))).toBe(true); // 08:00
    expect(isParisDaytime(new Date('2026-11-20T19:59:00Z'))).toBe(true); // 20:59
    expect(isParisDaytime(new Date('2026-11-20T20:00:00Z'))).toBe(false); // 21:00
  });
  it('summer (UTC+2)', () => {
    expect(isParisDaytime(new Date('2026-07-01T05:59:00Z'))).toBe(false); // 07:59
    expect(isParisDaytime(new Date('2026-07-01T06:00:00Z'))).toBe(true); // 08:00
    expect(isParisDaytime(new Date('2026-07-01T19:00:00Z'))).toBe(false); // 21:00
  });
});

type Row = Record<string, unknown>;

function journeyRow(id: string, createdAt: Date, over: Row = {}, user: Row = {}): Row {
  return {
    id,
    userId: `user-${id}`,
    kind: 'INDIVIDUAL',
    createdAt,
    lat: 48.84,
    lng: 2.39,
    bannerPath: null,
    bio: null,
    postalCode: null,
    fiscalCompletedAt: null,
    setupReminder3dAt: null,
    setupReminder8dAt: null,
    ...over,
    user: {
      image: null,
      profile: { verificationLevel: 'IDENTITY', avatarPath: null },
      identityVerification: { status: 'VERIFIED', lastErrorCode: null, decision: null },
      connectAccount: null,
      repairerCategories: [],
      repairerAvailability: [],
      ...user,
    },
  };
}

function harness(rows: Row[], opts: { claimed?: number; demandes?: Row[]; categories?: string[] } = {}) {
  const emit = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    repairerProfile: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
    },
    repairerCategory: {
      findMany: vi.fn().mockResolvedValue((opts.categories ?? []).map((categoryId) => ({ categoryId }))),
    },
    category: {
      findMany: vi.fn().mockResolvedValue((opts.categories ?? []).map((id) => ({ id, parentId: null }))),
    },
    demande: { findMany: vi.fn().mockResolvedValue(opts.demandes ?? []) },
  };
  const service = new SetupRemindersService(
    prisma as unknown as PrismaService,
    { emit } as unknown as NotificationsService,
  );
  return { service, prisma, emit };
}

/**
 * The journey the sweep builds depends on `isConnectEnabled()` (Connect on adds the « Virements » step),
 * which reads the environment. The expectations below are for Connect ON, as in production, so the
 * spec pins it rather than inheriting `apps/api/.env`: CI has no `.env`, Connect read as off there and
 * these three cases failed on GitHub while passing locally (2026-11-18). `connectOff` covers the other
 * setting.
 */
function connectOn(): void {
  vi.stubEnv('CONNECT_ENABLED', 'true');
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_test');
  vi.stubEnv('PUBLIC_API_URL', 'https://api.example.test');
  vi.stubEnv('STRIPE_DRIVER', 'fake');
  vi.stubEnv('STRIPE_SECRET_KEY', '');
}

describe('V8 E1 SetupRemindersService.sweep', () => {
  beforeEach(connectOn);
  afterEach(() => vi.unstubAllEnvs());

  it('with Connect off (no « Virements » step), the 3-day sentence counts one step fewer', async () => {
    vi.stubEnv('CONNECT_ENABLED', 'false');
    const { service, emit } = harness([journeyRow('a', ago(3))]);
    await service.sweep(NOW);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Votre configuration est presque terminée : plus que 2 étapes !' }),
    );
  });

  it('3-day reminder: the sentence for the steps left', async () => {
    // IDENTITY verified, nothing else: Statut + Identité done = 2/5, three steps left.
    const { service, emit, prisma } = harness([journeyRow('a', ago(3))]);
    const result = await service.sweep(NOW);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      userId: 'user-a',
      mode: 'REPAIRER',
      type: 'SETUP_REMINDER',
      subject: "Votre configuration n'est pas terminée : plus que 3 étapes.",
      demandeId: null,
    });
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', setupReminder3dAt: null },
      data: { setupReminder3dAt: NOW },
    });
    expect(result).toEqual({ scanned: 1, acted: 1, failed: 0 });
  });

  it('8-day reminder quotes the nearest matching request', async () => {
    const { service, emit, prisma } = harness([journeyRow('b', ago(8), { setupReminder3dAt: ago(5) })], {
      categories: ['c1'],
      demandes: [
        { id: 'far', title: 'Guitare désaccordée', lat: 45.76, lng: 4.84, createdAt: ago(0) },
        { id: 'near', title: 'Trois touches muettes sur le piano', lat: 48.845, lng: 2.395, createdAt: ago(2) },
      ],
    });
    await service.sweep(NOW);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SETUP_REMINDER',
        demandeId: 'near',
        subject:
          'Un client cherche un réparateur près de chez vous : « Trois touches muettes sur le piano ». Finissez votre inscription en 7 min.',
      }),
    );
    const where = prisma.demande.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: 'OPEN', authorUserId: { not: 'user-b' }, categoryId: { in: ['c1'] } });
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'b', setupReminder8dAt: null },
      data: { setupReminder8dAt: NOW },
    });
  });

  it('with no request to quote, the second sentence alone', async () => {
    const { service, emit } = harness([journeyRow('c', ago(9))]);
    await service.sweep(NOW);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Finissez votre inscription en 7 min.', demandeId: null }),
    );
  });

  it('a missed 3-day reminder is not sent late: only the 8-day one, and both markers settle', async () => {
    const { service, emit, prisma } = harness([journeyRow('d', ago(9))]);
    await service.sweep(NOW);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'd', setupReminder8dAt: null },
      data: { setupReminder8dAt: NOW, setupReminder3dAt: NOW },
    });
  });

  it('complete settles without emitting', async () => {
    const done = journeyRow(
      'e',
      ago(4),
      { bannerPath: 'b.jpg', bio: 'x', postalCode: '75012', fiscalCompletedAt: ago(1) },
      {
        profile: { verificationLevel: 'IDENTITY', avatarPath: 'a.jpg' },
        connectAccount: { status: 'VERIFIED' },
        repairerCategories: [{ categoryId: 'c1' }],
        repairerAvailability: [{ dayOfWeek: 1 }],
      },
    );
    const { service, emit, prisma } = harness([done]);
    const result = await service.sweep(NOW);
    expect(emit).not.toHaveBeenCalled();
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'e' },
      data: { setupReminder3dAt: NOW, setupReminder8dAt: NOW },
    });
    expect(result.acted).toBe(0);
  });

  it('night run sends nothing and reads nothing', async () => {
    const { service, emit, prisma } = harness([journeyRow('f', ago(3))]);
    const result = await service.sweep(new Date('2026-11-20T02:00:00Z')); // 03:00 Paris
    expect(prisma.repairerProfile.findMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, acted: 0, failed: 0 });
  });

  it('a raced marker sends nothing', async () => {
    const { service, emit } = harness([journeyRow('g', ago(3))], { claimed: 0 });
    const result = await service.sweep(NOW);
    expect(emit).not.toHaveBeenCalled();
    expect(result.acted).toBe(0);
  });

  it('one failing row does not stop the others', async () => {
    const { service, emit, prisma } = harness([journeyRow('h', ago(3)), journeyRow('i', ago(3))]);
    prisma.repairerProfile.updateMany.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ count: 1 });
    const result = await service.sweep(NOW);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 2, acted: 1, failed: 1 });
  });

  it('reads only live, genuine repairers in repairer mode, not banned or suspended, with a reminder owed', async () => {
    const { service, prisma } = harness([]);
    await service.sweep(NOW);
    const where = prisma.repairerProfile.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      OR: [{ setupReminder3dAt: null }, { setupReminder8dAt: null }],
      user: {
        // A nullable column: the codebase's pattern, so a NULL is not dropped as « banned ».
        OR: [{ banned: false }, { banned: null }],
        profile: { repairerEnabled: true, repairerSuspendedAt: null, deletedAt: null },
      },
    });
    expect(JSON.stringify(where)).toContain('@demo.revime.fr');
  });
});
