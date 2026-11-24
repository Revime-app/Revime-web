import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parisDayIndex, pickDailyTip } from '@revime/shared';
import { TipsService } from '../src/tips/tips.service.js';
import { TipsController } from '../src/tips/tips.controller.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * `GET /tips/daily`. Was tip-table-missing-migration's preservation spec, pinning a UTC
 * `floor(now / DAY)` index and an `active: true` where-clause. CF4-L (spec L5) REPLACES both:
 * the day is a Europe/Paris calendar day (`parisDayIndex`) and eligibility is `tipState` in
 * memory, shared with the admin list - so the two properties below are the same two
 * properties, re-stated over `parisDayIndex`.
 *
 * Uses a stub `{ tip: { findMany } }` only - never PrismaService (vitest loads `.env`, whose
 * DATABASE_URL is production). No fast-check in apps/api: a seeded deterministic loop.
 */

const DAY_MS = 86_400_000;
const CATEGORIES = ['CLIENT', 'REPAIRER', 'ALL'] as const;

type TipRow = {
  id: string;
  text: string;
  category: (typeof CATEGORIES)[number];
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

function makeService(rows: TipRow[] = []) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const service = new TipsService({ tip: { findMany } } as any);
  return { service, findMany };
}

/** Mulberry32 — small seeded PRNG for deterministic generated inputs. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Always-eligible CLIENT tips, already in the service's order (createdAt asc). */
function genTips(rand: () => number): TipRow[] {
  const n = 1 + Math.floor(rand() * 12);
  return Array.from({ length: n }, (_, i) => ({
    id: `tip-${String(i).padStart(2, '0')}`,
    text: `Conseil ${i}`,
    category: rand() < 0.5 ? 'CLIENT' : 'ALL',
    active: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(1_700_000_000_000 + i * 1000),
  }));
}

describe('TipsService.getDailyTip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(CATEGORIES)('queries tips of category %s or ALL with NO active filter (eligibility is tipState)', async (category) => {
    const { service, findMany } = makeService([]);
    await service.getDailyTip(category as any);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { OR: [{ category }, { category: 'ALL' }] } });
  });

  it('returns null when no tip matches', async () => {
    const { service } = makeService([]);
    await expect(service.getDailyTip('CLIENT' as any)).resolves.toBeNull();
  });

  it('returns exactly pickDailyTip(rows, pool, now)', async () => {
    const rand = prng(7);
    for (let run = 0; run < 50; run++) {
      const tips = genTips(rand);
      vi.setSystemTime(Math.floor(rand() * 4_102_444_800_000));
      const { service } = makeService(tips);
      expect((await service.getDailyTip('CLIENT' as any))?.id).toBe(pickDailyTip(tips, 'CLIENT', new Date())?.id);
    }
  });

  it('category ALL still returns ALL tips only', async () => {
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const tips: TipRow[] = [
      { id: 'c', text: 'c', category: 'CLIENT', active: true, startsAt: null, endsAt: null, createdAt: new Date(1) },
      { id: 'a', text: 'a', category: 'ALL', active: true, startsAt: null, endsAt: null, createdAt: new Date(2) },
    ];
    const { service } = makeService(tips);
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(new Date(Date.parse('2026-10-10T10:00:00Z') + i * DAY_MS));
      expect((await service.getDailyTip('ALL' as any))?.id).toBe('a');
    }
  });

  it('never returns a scheduled or a disabled tip', async () => {
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const tips: TipRow[] = [
      { id: 's', text: 's', category: 'CLIENT', active: true, startsAt: new Date('2026-11-01T00:00Z'), endsAt: null, createdAt: new Date(1) },
      { id: 'd', text: 'd', category: 'CLIENT', active: false, startsAt: null, endsAt: null, createdAt: new Date(2) },
    ];
    const { service } = makeService(tips);
    await expect(service.getDailyTip('CLIENT' as any)).resolves.toBeNull();
  });

  it('property: result is eligible[parisDayIndex(now) % n] for generated lists and dates', async () => {
    const rand = prng(20260923);
    for (let run = 0; run < 200; run++) {
      const tips = genTips(rand);
      const now = Math.floor(rand() * 4_102_444_800_000); // 1970 .. 2100
      vi.setSystemTime(now);
      const { service } = makeService(tips);
      const got = await service.getDailyTip('CLIENT' as any);
      expect(got?.id).toBe(tips[parisDayIndex(new Date(now)) % tips.length]!.id);
    }
  });

  it('property: same tip all Paris day, next tip the next Paris day (flip at Paris midnight)', async () => {
    const rand = prng(42);
    for (let run = 0; run < 100; run++) {
      const tips = genTips(rand);
      // A Paris midnight: 22:00Z in summer, 23:00Z in winter. Probe both offsets.
      const utcDay = Math.floor(rand() * 20_000) * DAY_MS;
      const offsetH = parisDayIndex(new Date(utcDay + 22 * 3_600_000)) === parisDayIndex(new Date(utcDay)) ? 23 : 22;
      const parisMidnight = utcDay + offsetH * 3_600_000;
      const { service } = makeService(tips);

      vi.setSystemTime(parisMidnight);
      const morning = await service.getDailyTip('CLIENT' as any);
      vi.setSystemTime(parisMidnight + 23 * 3_600_000 - 1); // still the same Paris day (23h or 24h+)
      const evening = await service.getDailyTip('CLIENT' as any);
      vi.setSystemTime(parisMidnight - 1);
      const yesterday = await service.getDailyTip('CLIENT' as any);

      const idx = tips.findIndex((t) => t.id === yesterday?.id);
      expect(evening).toEqual(morning);
      expect(morning?.id).toBe(tips[(idx + 1) % tips.length]!.id);
    }
  });
});

describe('P23: what the app receives of the day tip', () => {
  const row = (over: Record<string, unknown> = {}): TipRow =>
    ({
      id: 't1',
      text: 'Sauvegardez avant de réparer.',
      category: 'ALL',
      active: true,
      startsAt: null,
      endsAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      imageUrl: null,
      linkUrl: null,
      ...over,
    }) as TipRow;

  it('returns the five rendered fields and nothing else of the row', async () => {
    const { service } = makeService([
      row({ imageUrl: 'https://images.revime.fr/a.jpg', linkUrl: 'https://revime.fr/guides/batterie' }),
    ]);
    const got = await service.getDailyTip('CLIENT' as any);
    expect(got).toEqual({
      id: 't1',
      text: 'Sauvegardez avant de réparer.',
      category: 'ALL',
      imageUrl: 'https://images.revime.fr/a.jpg',
      linkUrl: 'https://revime.fr/guides/batterie',
    });
  });

  it('drops a stored URL that is not https (rows written before the admin schema checked them)', async () => {
    const { service } = makeService([row({ imageUrl: 'data:text/html,x', linkUrl: 'javascript:alert(1)' })]);
    const got = await service.getDailyTip('CLIENT' as any);
    expect(got?.imageUrl).toBeNull();
    expect(got?.linkUrl).toBeNull();
  });
});

describe('TipsController.getDailyTip (preservation)', () => {
  function makeController() {
    const getDailyTip = vi.fn().mockResolvedValue(null);
    return { controller: new TipsController({ getDailyTip } as any), getDailyTip };
  }

  it('defaults an absent category to CLIENT', async () => {
    const { controller, getDailyTip } = makeController();
    await controller.getDailyTip({});
    expect(getDailyTip).toHaveBeenCalledWith('CLIENT');
  });

  it.each(CATEGORIES)('passes a valid category %s through', async (category) => {
    const { controller, getDailyTip } = makeController();
    await controller.getDailyTip({ category });
    expect(getDailyTip).toHaveBeenCalledWith(category);
  });

  it('rejects an invalid category with VALIDATION_FAILED before calling the service', async () => {
    const { controller, getDailyTip } = makeController();
    const err = await controller.getDailyTip({ category: 'FOO' }).catch((e) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('VALIDATION_FAILED');
    expect(getDailyTip).not.toHaveBeenCalled();
  });
});
