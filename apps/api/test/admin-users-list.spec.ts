import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService, markerOf, statusOf } from '../src/admin/admin-users.service.js';
import { PAGE_SIZE } from '../src/admin/admin-constants.js';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Camille Dupont',
  username: 'camille',
  email: 'camille@example.fr',
  phone: '+33600000000',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  banned: false,
  banReason: null,
  banExpires: null,
  profile: { deletedAt: null, clientEnabled: true, repairerEnabled: false, verificationLevel: 'BASIC' },
  ...over,
});

const makePrisma = (rows: unknown[] = [row()], total = 1) => ({
  $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  user: {
    findMany: vi.fn().mockResolvedValue(rows),
    count: vi.fn().mockResolvedValue(total),
  },
  commande: { groupBy: vi.fn().mockResolvedValue([]) },
  review: { groupBy: vi.fn().mockResolvedValue([]) },
  adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
});

describe('statusOf', () => {
  // 🛑 Profile.deletedAt is AUTHORITATIVE, not banReason. deletedAt is the column every
  // other soft-delete filter in this repo reads; the ban reason is a side effect of
  // CF-47's scrub. Design §5.
  it('reports deleted from Profile.deletedAt', () => {
    const s = statusOf(row({ profile: { deletedAt: new Date('2026-08-30T00:00:00.000Z') } }) as never);
    expect(s.kind).toBe('deleted');
  });

  it('reports deleted even when the two sources disagree, which fails safe', () => {
    const s = statusOf(
      row({ banned: false, banReason: null, profile: { deletedAt: new Date('2026-08-30T00:00:00.000Z') } }) as never,
    );
    expect(s.kind).toBe('deleted');
  });

  it('reports suspended with the reason and the expiry', () => {
    const s = statusOf(
      row({ banned: true, banReason: 'Propos abusifs', banExpires: new Date('2026-09-12T00:00:00.000Z') }) as never,
    );
    expect(s).toEqual({ kind: 'suspended', reason: 'Propos abusifs', until: '2026-09-12T00:00:00.000Z' });
  });

  // A ban with no reason set must still read as suspended: Better Auth's ban endpoint
  // takes banReason as OPTIONAL, which is the same trap §8.1's KPI #4 documents.
  it('reports suspended when banned is true and banReason is null', () => {
    expect(statusOf(row({ banned: true, banReason: null }) as never).kind).toBe('suspended');
  });

  it('does NOT report a deleted account as merely suspended', () => {
    const s = statusOf(
      row({ banned: true, banReason: 'account_deleted', profile: { deletedAt: new Date() } }) as never,
    );
    expect(s.kind).toBe('deleted');
  });

  it('reports active otherwise', () => {
    expect(statusOf(row() as never)).toEqual({ kind: 'active' });
  });
});

describe('markerOf', () => {
  it('marks the demo cast and the integration fixtures separately', () => {
    expect(markerOf('a@demo.revime.fr')).toBe('demo');
    expect(markerOf('b@repareme.test')).toBe('fixture');
    expect(markerOf('c@example.fr')).toBeNull();
  });

  // Recorded limit, asserted so nobody "fixes" it silently: it is case-sensitive.
  it('is case-sensitive, which is the stated accepted limitation', () => {
    expect(markerOf('a@DEMO.REVIME.FR')).toBeNull();
  });
});

describe('AdminUsersService.list', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminUsersService;
  let repairers: { repairerBlock: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = makePrisma();
    // Mock AdminRepairersService with repairerBlock returning null by default
    repairers = { repairerBlock: vi.fn().mockResolvedValue(null) };
    service = new AdminUsersService(prisma as never, repairers as never, {} as never);
  });

  it('returns items with the page size and total', async () => {
    const out = await service.list({});
    expect(out.pageSize).toBe(PAGE_SIZE);
    expect(out.page).toBe(1);
    expect(out.total).toBe(1);
    expect(out.items[0]!.userId).toBe('u1');
    expect(out.items[0]!.status).toEqual({ kind: 'active' });
  });

  // 🛑 The DEFAULT excludes deleted accounts. A tombstone is not a user an operator is
  // looking for, and §8.2 still reaches them through the explicit filter value.
  it('excludes deleted accounts by default', async () => {
    await service.list({});
    const where = prisma.user.findMany.mock.calls[0]![0].where;
    const s = JSON.stringify(where);
    expect(s).toContain('"deletedAt":null');
  });

  it('includes only deleted accounts when statut=supprime', async () => {
    await service.list({ statut: 'supprime' });
    const where = prisma.user.findMany.mock.calls[0]![0].where;
    const s = JSON.stringify(where);
    expect(s).toMatch(/"deletedAt":\s*\{\s*"not"/);
  });

  it('searches name, username, email and phone case-insensitively', async () => {
    await service.list({ q: 'Camille' });
    const s = JSON.stringify(prisma.user.findMany.mock.calls[0]![0].where);
    for (const f of ['name', 'username', 'email', 'phone']) expect(s).toContain(f);
    expect(s).toContain('insensitive');
  });

  it('filters by mode and by verification level', async () => {
    await service.list({ type: 'reparateur', niveau: 'IDENTITY' });
    const s = JSON.stringify(prisma.user.findMany.mock.calls[0]![0].where);
    expect(s).toContain('repairerEnabled');
    expect(s).toContain('IDENTITY');
  });

  it('type=equipe keeps only the six staff roles (CF4-40)', async () => {
    await service.list({ type: 'equipe' });
    const where = prisma.user.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain(
      JSON.stringify({ role: { in: ['super_admin', 'admin', 'moderation', 'support', 'finance', 'read_only'] } }),
    );
  });

  it('each row carries its staff role, null when not staff (CF4-40)', async () => {
    const p = makePrisma([row({ id: 'a', role: 'finance' }), row({ id: 'b', role: 'user' }), row({ id: 'c' })], 3);
    const s = new AdminUsersService(p as never, {} as never, {} as never);
    const res = await s.list({});
    expect(res.items.map((i) => i.staffRole)).toEqual(['finance', null, null]);
    expect(p.user.findMany.mock.calls[0]![0].select.role).toBe(true);
  });

  it('filters suspended accounts by banned: true', async () => {
    await service.list({ statut: 'suspendu' });
    const s = JSON.stringify(prisma.user.findMany.mock.calls[0]![0].where);
    expect(s).toContain('"banned":true');
  });

  it('ignores an unknown filter value rather than returning nothing', async () => {
    await service.list({ niveau: 'PLATINUM', statut: 'bogus', type: 'nope' });
    const s = JSON.stringify(prisma.user.findMany.mock.calls[0]![0].where);
    expect(s).not.toContain('PLATINUM');
  });

  it('paginates with skip and take, and clamps a bad page to 1', async () => {
    await service.list({ page: 3 });
    expect(prisma.user.findMany.mock.calls[0]![0].skip).toBe(2 * PAGE_SIZE);
    expect(prisma.user.findMany.mock.calls[0]![0].take).toBe(PAGE_SIZE);

    await service.list({ page: -5 });
    expect(prisma.user.findMany.mock.calls[1]![0].skip).toBe(0);

    await service.list({ page: Number.NaN });
    expect(prisma.user.findMany.mock.calls[2]![0].skip).toBe(0);
  });
});
