import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminTipsService } from '../src/admin/admin-tips.service.js';
import { TipsService } from '../src/tips/tips.service.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * CF4-38 (spec §4.3). Admin « Conseils du jour » service, Prisma mocked (never PrismaService:
 * vitest loads `.env`, whose DATABASE_URL is production).
 */

type Row = {
  id: string;
  text: string;
  category: 'CLIENT' | 'REPAIRER' | 'ALL';
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

const NOW = new Date('2026-10-10T10:00:00.000Z');
const row = (id: string, category: Row['category'], extra: Partial<Row> = {}): Row => ({
  id,
  text: `Texte ${id}`,
  category,
  active: true,
  startsAt: null,
  endsAt: null,
  createdAt: new Date(`2026-01-${String(id.charCodeAt(0) % 28 + 1).padStart(2, '0')}T00:00:00Z`),
  ...extra,
});

const ROWS: Row[] = [
  row('a', 'CLIENT'),
  row('b', 'REPAIRER'),
  row('c', 'ALL'),
  row('d', 'CLIENT', { startsAt: new Date('2026-11-01T00:00:00Z') }),
  row('e', 'CLIENT', { endsAt: new Date('2026-10-01T00:00:00Z') }),
  row('f', 'REPAIRER', { active: false }),
  row('g', 'CLIENT'),
  row('h', 'REPAIRER'),
];

function makePrisma(rows: Row[] = ROWS) {
  return {
    tip: {
      findMany: vi.fn().mockResolvedValue(rows),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => rows.find((r) => r.id === id) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => ({ id: 'new', createdAt: NOW, ...data })),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<Row> }) => ({
        ...rows.find((r) => r.id === id)!,
        ...data,
      })),
      delete: vi.fn(async ({ where: { id } }: { where: { id: string } }) => rows.find((r) => r.id === id)),
    },
  };
}

describe('AdminTipsService.list', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('maps every row with its state and ISO dates', async () => {
    const svc = new AdminTipsService(makePrisma() as any);
    const res = await svc.list({});
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
    expect(byId.a).toEqual({
      id: 'a',
      text: 'Texte a',
      category: 'CLIENT',
      active: true,
      imageUrl: null,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      state: 'ACTIVE',
      createdAt: ROWS[0]!.createdAt.toISOString(),
    });
    expect(byId.d!.state).toBe('SCHEDULED');
    expect(byId.d!.startsAt).toBe('2026-11-01T00:00:00.000Z');
    expect(byId.e!.state).toBe('EXPIRED');
    expect(byId.f!.state).toBe('DISABLED');
    expect(res.items).toHaveLength(ROWS.length);
  });

  it('Review Focus 2: today per pool is exactly what /tips/daily returns', async () => {
    for (let i = 0; i < 14; i++) {
      vi.setSystemTime(new Date(NOW.getTime() + i * 86_400_000));
      const res = await new AdminTipsService(makePrisma() as any).list({});
      const client = await new TipsService(makePrisma(ROWS.filter((r) => r.category !== 'REPAIRER')) as any).getDailyTip('CLIENT');
      const repairer = await new TipsService(makePrisma(ROWS.filter((r) => r.category !== 'CLIENT')) as any).getDailyTip('REPAIRER');
      expect(res.today.CLIENT).toBe(client!.id);
      expect(res.today.REPAIRER).toBe(repairer!.id);
    }
  });

  it('today is computed over ALL tips even when the list is filtered', async () => {
    const svc = new AdminTipsService(makePrisma() as any);
    const all = await svc.list({});
    const filtered = await svc.list({ state: 'EXPIRED' });
    expect(filtered.today).toEqual(all.today);
    expect(filtered.items.map((i) => i.id)).toEqual(['e']);
  });

  it('category filter: a pool lists its own tips and the ALL tips (« Tous »), ALL lists ALL only', async () => {
    const svc = new AdminTipsService(makePrisma() as any);
    expect((await svc.list({ category: 'REPAIRER' })).items.map((i) => i.id).sort()).toEqual(['b', 'c', 'f', 'h']);
    expect((await svc.list({ category: 'ALL' })).items.map((i) => i.id)).toEqual(['c']);
  });

  it('today is null for a pool with nothing eligible', async () => {
    const svc = new AdminTipsService(makePrisma([row('x', 'CLIENT', { active: false })]) as any);
    expect((await svc.list({})).today).toEqual({ CLIENT: null, REPAIRER: null });
  });
});

describe('AdminTipsService writes', () => {
  it('create converts ISO strings to Dates and keeps nulls', async () => {
    const prisma = makePrisma();
    const svc = new AdminTipsService(prisma as any);
    const item = await svc.create({
      text: 'Nouveau',
      category: 'CLIENT',
      active: true,
      startsAt: '2026-10-01T22:00:00.000Z',
      endsAt: null,
    });
    expect(prisma.tip.create).toHaveBeenCalledWith({
      data: { text: 'Nouveau', category: 'CLIENT', active: true, imageUrl: null, linkUrl: null, startsAt: new Date('2026-10-01T22:00:00.000Z'), endsAt: null },
    });
    expect(item.startsAt).toBe('2026-10-01T22:00:00.000Z');
    expect(item.endsAt).toBeNull();
    expect(item.id).toBe('new');
  });

  it('update writes only the given fields, dates converted', async () => {
    const prisma = makePrisma();
    const svc = new AdminTipsService(prisma as any);
    await svc.update('a', { active: false, endsAt: '2026-12-01T23:00:00.000Z' });
    expect(prisma.tip.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { active: false, endsAt: new Date('2026-12-01T23:00:00.000Z') },
    });
  });

  it('update clears a bound with null', async () => {
    const prisma = makePrisma();
    await new AdminTipsService(prisma as any).update('d', { startsAt: null });
    expect(prisma.tip.update).toHaveBeenCalledWith({ where: { id: 'd' }, data: { startsAt: null } });
  });

  it('update refuses an end that is not after the STORED start (only one bound sent)', async () => {
    const prisma = makePrisma();
    const err = await new AdminTipsService(prisma as any)
      .update('d', { endsAt: '2026-10-15T00:00:00.000Z' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('VALIDATION_FAILED');
    expect((err as AppException).fields).toEqual({ endsAt: 'La date de fin doit être après la date de début.' });
    expect(prisma.tip.update).not.toHaveBeenCalled();
  });

  it('update of an unknown id → NOT_FOUND « Ressource introuvable. »', async () => {
    const prisma = makePrisma();
    const err = await new AdminTipsService(prisma as any).update('nope', { active: false }).catch((e) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('NOT_FOUND');
    expect((err as AppException).message).toBe('Ressource introuvable.');
    expect(prisma.tip.update).not.toHaveBeenCalled();
  });

  it('remove hard-deletes', async () => {
    const prisma = makePrisma();
    await expect(new AdminTipsService(prisma as any).remove('a')).resolves.toEqual({ ok: true });
    expect(prisma.tip.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
  });

  it('remove of an unknown id → NOT_FOUND', async () => {
    const prisma = makePrisma();
    const err = await new AdminTipsService(prisma as any).remove('nope').catch((e) => e);
    expect((err as AppException).code).toBe('NOT_FOUND');
    expect(prisma.tip.delete).not.toHaveBeenCalled();
  });
});
