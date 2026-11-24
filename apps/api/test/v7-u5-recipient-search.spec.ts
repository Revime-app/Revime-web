import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import { AdminCommunicationsService } from '../src/admin/admin-communications.service.js';
import { AdminCommunicationsController } from '../src/admin/admin-communications.controller.js';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';

vi.mock('../src/mail/mail.service.js', () => ({ mailSender: () => ({ send: vi.fn() }) }));

/** A user row shaped like the suggestion select. */
const row = (over: Record<string, unknown> = {}): any => ({
  id: 'u-nes-0000000001',
  username: 'nes',
  name: 'Nes Dab',
  email: 'nes@example.com',
  banned: false,
  repairerProfile: { id: 'rp1' },
  ...over,
});

/** Every `{ field: { … } }` leaf of a Prisma where, as `field` → condition, for assertions. */
function leaves(where: unknown, acc: Array<[string, any]> = []): Array<[string, any]> {
  if (Array.isArray(where)) where.forEach((w) => leaves(w, acc));
  else if (where && typeof where === 'object') {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'AND' || k === 'OR' || k === 'NOT') leaves(v, acc);
      else acc.push([k, v]);
    }
  }
  return acc;
}

/** V7 D2 (U5, `DEC7-20`): find one recipient by pseudo, name, e-mail, phone or id. */
describe('V7 U5 · AdminCommunicationsService.searchRecipients', () => {
  let prisma: any;
  let service: AdminCommunicationsService;

  beforeEach(() => {
    prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn() },
      adminBroadcast: { findMany: vi.fn(), count: vi.fn() },
    };
    service = new AdminCommunicationsService(prisma, { dispatch: vi.fn() } as any);
  });

  it('asks the database nothing below 2 characters, a lone « @ » included', async () => {
    expect(await service.searchRecipients('n')).toEqual([]);
    expect(await service.searchRecipients(' @ ')).toEqual([]);
    expect(await service.searchRecipients(undefined)).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('matches the pseudo, the name, the e-mail, the phone and the id prefix (Q2)', async () => {
    await service.searchRecipients('@nes');
    const where = prisma.user.findMany.mock.calls[0][0].where;
    const fields = leaves(where).map(([k]) => k);
    expect(fields).toEqual(expect.arrayContaining(['username', 'name', 'email', 'phone', 'id']));
    expect(leaves(where)).toContainEqual(['username', { contains: 'nes', mode: 'insensitive' }]);
    expect(leaves(where)).toContainEqual(['id', { startsWith: 'nes' }]);
  });

  it('reads the name with the global search accent variants', async () => {
    await service.searchRecipients('elodie');
    const names = leaves(prisma.user.findMany.mock.calls[0][0].where)
      .filter(([k]) => k === 'name')
      .map(([, v]) => v.contains);
    expect(names).toEqual(expect.arrayContaining(['elodie', 'élodie']));
  });

  it('never suggests a deleted account, in either query (Q4)', async () => {
    await service.searchRecipients('nes');
    for (const call of [prisma.user.findMany.mock.calls[0][0], prisma.user.findFirst.mock.calls[0][0]]) {
      expect(leaves(call.where)).toContainEqual(['profile', { deletedAt: null }]);
    }
  });

  it('keeps suspended accounts and says so (Q4)', async () => {
    prisma.user.findMany.mockResolvedValue([row({ banned: true })]);
    const [s] = await service.searchRecipients('nes');
    expect(leaves(prisma.user.findMany.mock.calls[0][0].where).map(([k]) => k)).not.toContain('banned');
    expect(s).toEqual({
      id: 'u-nes-0000000001',
      username: 'nes',
      name: 'Nes Dab',
      email: 'nes@example.com',
      role: 'REPAIRER',
      suspended: true,
    });
  });

  it('names a client a client', async () => {
    prisma.user.findMany.mockResolvedValue([row({ repairerProfile: null, banned: null })]);
    const [s] = await service.searchRecipients('nes');
    expect(s).toMatchObject({ role: 'CLIENT', suspended: false });
  });

  it('puts an exact pseudo or e-mail match first, then the newest accounts, at most 8 (DEC7-20)', async () => {
    const newer = Array.from({ length: 8 }, (_, i) => row({ id: `u-new-${i}`, username: `nes${i}` }));
    prisma.user.findMany.mockResolvedValue(newer);
    prisma.user.findFirst.mockResolvedValue(row({ id: 'u-exact', username: 'nes' }));
    const out = await service.searchRecipients('NES');

    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ take: 8, orderBy: { createdAt: 'desc' } });
    expect(leaves(prisma.user.findFirst.mock.calls[0][0].where)).toEqual(
      expect.arrayContaining([
        ['username', 'nes'],
        ['email', { equals: 'NES', mode: 'insensitive' }],
      ]),
    );
    expect(out.map((s) => s.id)).toEqual(['u-exact', ...newer.slice(0, 7).map((u) => u.id)]);
  });

  it('does not list the exact match twice', async () => {
    prisma.user.findMany.mockResolvedValue([row({ id: 'u-a' }), row({ id: 'u-exact' })]);
    prisma.user.findFirst.mockResolvedValue(row({ id: 'u-exact' }));
    const out = await service.searchRecipients('nes');
    expect(out.map((s) => s.id)).toEqual(['u-exact', 'u-a']);
  });
});

describe('V7 U5 · history names the single recipient by pseudo (Q6)', () => {
  let prisma: any;
  let service: AdminCommunicationsService;
  const broadcast = (userId: string) => ({
    id: `b-${userId}`,
    subject: 'Direct',
    channelEmail: true,
    channelPush: false,
    targetType: 'INDIVIDUAL',
    targetFilter: { type: 'INDIVIDUAL', userId },
    totalRecipients: 1,
    sentEmailCount: 1,
    sentPushCount: 0,
    createdAt: new Date('2026-10-28T10:00:00Z'),
    operator: { name: 'Admin' },
  });

  beforeEach(() => {
    prisma = {
      user: { findMany: vi.fn() },
      adminBroadcast: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(3) },
    };
    service = new AdminCommunicationsService(prisma, { dispatch: vi.fn() } as any);
  });

  it('reads « Destinataire unique · @pseudo », and « Utilisateur supprimé » for a gone account', async () => {
    prisma.adminBroadcast.findMany.mockResolvedValue([
      broadcast('u-live'),
      broadcast('u-tomb'),
      broadcast('u-hard'),
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-live', username: 'nes', name: 'Nes Dab', profile: { deletedAt: null } },
      { id: 'u-tomb', username: 'deleted_u-tomb', name: 'Utilisateur supprimé', profile: { deletedAt: new Date() } },
    ]);

    const h = await service.getHistory(1, 20);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u-live', 'u-tomb', 'u-hard'] } });
    expect(h.items.map((i) => i.targetSummary)).toEqual([
      'Destinataire unique · @nes',
      'Destinataire unique · Utilisateur supprimé',
      'Destinataire unique · Utilisateur supprimé',
    ]);
  });

  it('asks for no user when the page holds only segments', async () => {
    prisma.adminBroadcast.findMany.mockResolvedValue([
      { ...broadcast('x'), targetType: 'SEGMENT', targetFilter: { type: 'SEGMENT', role: 'ALL' } },
    ]);
    const h = await service.getHistory(1, 20);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(h.items[0]?.targetSummary).toBe('Tous les utilisateurs');
  });
});

describe('V7 U5 · GET /admin/communications/recipients', () => {
  it('delegates to the service, readable by any staff member like the preview (Q2)', async () => {
    const service = { searchRecipients: vi.fn().mockResolvedValue([]) };
    const controller = new AdminCommunicationsController(service as any);
    await controller.recipients('@nes');
    expect(service.searchRecipients).toHaveBeenCalledWith('@nes');
    expect(Reflect.getMetadata(PERMISSION_KEY, controller.recipients)).toBe('dashboard.read');
    expect(Reflect.getMetadata(PERMISSION_KEY, controller.preview)).toBe('dashboard.read');
  });
});

describe('V7 U5 · the header global search finds a pseudo (Q3)', () => {
  it('matches the username, ignoring a leading « @ »', async () => {
    const empty = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    const prisma = {
      commande: { ...empty },
      user: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      demande: { ...empty },
      dispute: { ...empty },
    };
    const overview = new AdminOverviewService(prisma as never, NO_ATTENTION as never);
    await overview.search('@nes');
    const [args] = prisma.user.findMany.mock.calls[0] as any[];
    expect(leaves(args.where)).toContainEqual([
      'username',
      { contains: 'nes', mode: 'insensitive' },
    ]);
  });
});
