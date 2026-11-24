import { describe, expect, it, vi } from 'vitest';
import { AdminDemandesService } from '../src/admin/admin-demandes.service.js';
import { RepairerDashboardService } from '../src/repairers/repairer-dashboard.service.js';

/**
 * CF4-25 (spec §4.3 « À faire », §4.4 admin). The réparateur's QUOTE_REQUESTS todo line and
 * the admin demandes list / detail's private-request type, target and close reason.
 */

function dashboard(opts: { quoteCount: number; matchingCount?: number }) {
  const count = vi.fn(async (args: { where: Record<string, unknown> }) =>
    typeof args.where.targetRepairerUserId === 'string' ? opts.quoteCount : (opts.matchingCount ?? 0),
  );
  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
    commande: { findMany: vi.fn().mockResolvedValue([]) },
    repairerCategory: { findMany: vi.fn().mockResolvedValue([{ categoryId: 'c1' }]) },
    category: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', parentId: null }]) },
    demande: { count },
    commandeStepEvent: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
    dispute: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { count, service: new RepairerDashboardService(prisma as never) };
}

describe('dashboard QUOTE_REQUESTS', () => {
  it('counts OPEN visible requests addressed to him that he has not answered', async () => {
    const { service, count } = dashboard({ quoteCount: 2 });
    const dto = await service.get('me');
    expect(dto.todo).toContainEqual({ kind: 'QUOTE_REQUESTS', count: 2 });
    const quoteCall = count.mock.calls.find((c) => typeof c[0].where.targetRepairerUserId === 'string')!;
    expect(quoteCall[0].where).toEqual({
      status: 'OPEN',
      targetRepairerUserId: 'me',
      deletedAt: null,
      hiddenAt: null,
      offers: { none: { repairerUserId: 'me', status: 'SENT', deletedAt: null } },
    });
  });

  it('is omitted at 0', async () => {
    const { service } = dashboard({ quoteCount: 0, matchingCount: 3 });
    const dto = await service.get('me');
    expect(dto.todo.map((t) => t.kind)).toEqual(['MATCHING']);
  });

  it('sits before MATCHING', async () => {
    const { service } = dashboard({ quoteCount: 1, matchingCount: 3 });
    expect((await service.get('me')).todo.map((t) => t.kind)).toEqual(['QUOTE_REQUESTS', 'MATCHING']);
  });
});

function adminList(rows: unknown[], users: unknown[] = []) {
  const userFindMany = vi.fn().mockResolvedValue(users);
  const p = {
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => [rows, rows.length].slice(0, ops.length)),
    demande: { findMany: vi.fn().mockResolvedValue(rows), count: vi.fn().mockResolvedValue(rows.length) },
    user: { findMany: userFindMany },
  };
  return { p, userFindMany, svc: new AdminDemandesService(p as never) };
}

const listRow = (id: string, target: string | null, reason: string | null = null) => ({
  id,
  title: 'T',
  status: reason ? 'CANCELLED' : 'OPEN',
  locationLabel: 'Lyon',
  createdAt: new Date(0),
  deletedAt: null,
  hiddenAt: null,
  hiddenByUserId: null,
  deletedByUserId: null,
  authorUserId: 'c1',
  author: { name: 'Julie' },
  category: { labelFr: 'Tel' },
  _count: { offers: 0 },
  targetRepairerUserId: target,
  quoteClosedReason: reason,
});

describe('admin demandes list: type filter', () => {
  it.each([
    ['devis', { targetRepairerUserId: { not: null } }],
    ['publique', { targetRepairerUserId: null }],
  ])('type=%s', async (type, clause) => {
    const { p, svc } = adminList([]);
    await svc.list({ type });
    expect(p.demande.findMany.mock.calls[0]![0].where).toEqual({ AND: [clause] });
  });

  it('an unknown type is ignored', async () => {
    const { p, svc } = adminList([]);
    await svc.list({ type: 'autre' });
    expect(p.demande.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('items carry quoteTarget (name from one batched read) and null on public rows', async () => {
    const { svc, userFindMany } = adminList(
      [listRow('a', 'r1'), listRow('b', null), listRow('c', 'r1', 'DECLINED')],
      [{ id: 'r1', name: 'Martin' }],
    );
    const out = await svc.list({});
    expect(out.items.map((i) => i.quoteTarget)).toEqual([
      { userId: 'r1', displayName: 'Martin' },
      null,
      { userId: 'r1', displayName: 'Martin' },
    ]);
    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany.mock.calls[0]![0].where).toEqual({ id: { in: ['r1'] } });
  });

  it('no user read when every row is public', async () => {
    const { svc, userFindMany } = adminList([listRow('b', null)]);
    await svc.list({});
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe('admin demande detail: target and close reason', () => {
  const base = {
    id: 'd1', title: 'T', description: 'D', brand: null, model: null, parts: 'UNKNOWN', mode: 'OFFERS',
    budgetCents: null, locationLabel: 'Lyon', postalCode: '69001', status: 'CANCELLED', categoryId: 'c',
    createdAt: new Date(0), deletedAt: null, hiddenAt: null, hiddenReason: null, deletedReason: null,
    hiddenByUserId: null, deletedByUserId: null, author: { id: 'u1', name: 'Julie', email: 'j@x' },
    category: { labelFr: 'Tel' }, photos: [], offers: [], commandes: [],
  };
  const stub = (row: unknown) => ({
    demande: { findUnique: vi.fn().mockResolvedValue(row) },
    $transaction: vi.fn().mockResolvedValue([[], [], [], [], 0]),
    conversation: { findMany: vi.fn() },
    conversationReport: { findMany: vi.fn() },
    review: { findMany: vi.fn() },
    adminAuditLog: { findMany: vi.fn() },
    commande: { count: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'r1', name: 'Martin' }]) },
  });

  it('a private request carries its target and reason', async () => {
    const svc = new AdminDemandesService(
      stub({ ...base, targetRepairerUserId: 'r1', quoteClosedReason: 'EXPIRED' }) as never,
    );
    const out = await svc.detail('d1');
    expect(out.quoteTarget).toEqual({ userId: 'r1', displayName: 'Martin' });
    expect(out.quoteClosedReason).toBe('EXPIRED');
  });

  it('a public demande carries nulls', async () => {
    const svc = new AdminDemandesService(
      stub({ ...base, targetRepairerUserId: null, quoteClosedReason: null }) as never,
    );
    const out = await svc.detail('d1');
    expect(out.quoteTarget).toBeNull();
    expect(out.quoteClosedReason).toBeNull();
  });
});
