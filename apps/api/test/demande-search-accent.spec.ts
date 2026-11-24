import { describe, expect, it, vi } from 'vitest';
import type { BrowseQuery } from '@revime/shared';
import {
  DemandesService,
  expandAccentVariants,
  searchFilter,
} from '../src/demandes/demandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

// `expandAccentVariants` no longer serves the demande search (it is `searchFilter`, below); the admin
// search still imports it, so its own behaviour stays pinned here.
describe('expandAccentVariants (shared with the admin search)', () => {
  it('generates unaccented and accented variants for "Ecran"', () => {
    const variants = expandAccentVariants('Ecran');
    expect(variants).toContain('Ecran');
    expect(variants).toContain('ecran');
    expect(variants).toContain('écran');
  });

  it('generates variants when starting from accented "Écran"', () => {
    const variants = expandAccentVariants('Écran');
    expect(variants).toContain('Écran');
    expect(variants).toContain('ecran');
    expect(variants).toContain('écran');
  });

  it('handles "velo" and "vélo"', () => {
    const variantsVelo = expandAccentVariants('velo');
    expect(variantsVelo).toContain('velo');
    expect(variantsVelo).toContain('vélo');

    const variantsVeloAccented = expandAccentVariants('vélo');
    expect(variantsVeloAccented).toContain('velo');
    expect(variantsVeloAccented).toContain('vélo');
  });

  it('handles "fissure" and "fissuré"', () => {
    const variants = expandAccentVariants('fissure');
    expect(variants).toContain('fissure');
    expect(variants).toContain('fissuré');

    const variantsAccented = expandAccentVariants('fissuré');
    expect(variantsAccented).toContain('fissure');
    expect(variantsAccented).toContain('fissuré');
  });

  it('handles "reparation" and "réparation"', () => {
    const variants = expandAccentVariants('reparation');
    expect(variants).toContain('reparation');
    expect(variants).toContain('réparation');
  });

  it('handles "telephone" and "téléphone"', () => {
    const variants = expandAccentVariants('telephone');
    expect(variants).toContain('telephone');
    expect(variants).toContain('téléphone');
  });

  it('handles tréma ë (e.g. Noël, Citroën)', () => {
    const noelVariants = expandAccentVariants('Noel');
    expect(noelVariants).toContain('Noel');
    expect(noelVariants).toContain('noël');

    const citroenVariants = expandAccentVariants('Citroën');
    expect(citroenVariants).toContain('Citroën');
    expect(citroenVariants).toContain('citroen');
  });

  it('does not explode for non-accentable strings or numbers', () => {
    const variants = expandAccentVariants('75001');
    expect(variants).toEqual(['75001']);

    const iphoneVariants = expandAccentVariants('iPhone 12');
    expect(iphoneVariants).toContain('iPhone 12');
    expect(iphoneVariants).toContain('iphone 12');
  });
});

/** A prisma whose `$queryRaw` answers with `ids`, and remembers the SQL it was handed. */
function rawPrisma(ids: string[]) {
  const queryRaw = vi.fn().mockResolvedValue(ids.map((id) => ({ id })));
  return { prisma: withUserLookups({ $queryRaw: queryRaw }) as unknown as PrismaService, queryRaw };
}

function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  const sql = call[0] as { strings: string[]; values: unknown[] };
  return { text: sql.strings.join('?'), values: sql.values };
}

describe('searchFilter (Bug V1: accent-insensitive on both sides, in SQL)', () => {
  it('returns an empty filter, and asks the database nothing, for a missing or blank query', async () => {
    const { prisma, queryRaw } = rawPrisma([]);
    expect(await searchFilter(prisma, undefined)).toEqual({});
    expect(await searchFilter(prisma, '')).toEqual({});
    expect(await searchFilter(prisma, '   ')).toEqual({});
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('turns the matching ids into an id filter', async () => {
    const { prisma } = rawPrisma(['a', 'b']);
    expect(await searchFilter(prisma, 'Ecran')).toEqual({ id: { in: ['a', 'b'] } });
  });

  it('matches nothing, rather than everything, when no row matches', async () => {
    const { prisma } = rawPrisma([]);
    expect(await searchFilter(prisma, 'zzz')).toEqual({ id: { in: [] } });
  });

  it('folds BOTH sides with unaccent and lower, so « Ecran » and « Écran » meet either way', async () => {
    const { prisma, queryRaw } = rawPrisma([]);
    await searchFilter(prisma, 'Écran');
    const { text } = sqlOf(queryRaw.mock.calls[0]!);
    const folded = [
      'unaccent(lower(d."title"))',
      'unaccent(lower(coalesce(d."brand", \'\')))',
      'unaccent(lower(coalesce(d."model", \'\')))',
      'unaccent(lower(c."labelFr"))',
      'unaccent(lower(d."locationLabel"))',
    ];
    for (const column of folded) expect(text).toContain(column);
    // The query side is folded too, once per column.
    expect(text.split('unaccent(lower(?::text))')).toHaveLength(folded.length + 1);
  });

  it('binds the query as a parameter and never splices it into the SQL', async () => {
    const { prisma, queryRaw } = rawPrisma([]);
    await searchFilter(prisma, "100% d'écran_");
    const { text, values } = sqlOf(queryRaw.mock.calls[0]!);
    expect(text).not.toContain('100%');
    expect(values.every((v) => v === "100% d'écran_")).toBe(true);
    // position(), not LIKE: a typed % or _ is a character, not a wildcard.
    expect(text).not.toMatch(/\bLIKE\b/i);
  });

  it('leaves locationLabel out when withLocation is false (browse, CF4-24)', async () => {
    const { prisma, queryRaw } = rawPrisma([]);
    await searchFilter(prisma, 'Ecran', false);
    expect(sqlOf(queryRaw.mock.calls[0]!).text).not.toContain('locationLabel');
  });

  it('searches locationLabel when withLocation is true (feed)', async () => {
    const { prisma, queryRaw } = rawPrisma([]);
    await searchFilter(prisma, 'Ecran', true);
    expect(sqlOf(queryRaw.mock.calls[0]!).text).toContain('locationLabel');
  });
});

describe('DemandesService.browse with the accent-insensitive search', () => {
  it('ANDs the matching ids into findMany, and reads no locationLabel', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'match-1' }]);
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: false }) },
      category: { findMany: vi.fn().mockResolvedValue([]) },
      demande: { findMany },
      $queryRaw: queryRaw,
    };
    const service = new DemandesService(
      withUserLookups(prisma) as unknown as PrismaService,
      {} as GeocodeService,
      {} as NotificationsService,
    );

    await service.browse('client-user-1', { q: 'Ecran' } as BrowseQuery);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where.id).toEqual({ in: ['match-1'] });
    expect(sqlOf(queryRaw.mock.calls[0]!).text).not.toContain('locationLabel');
  });
});

describe('DemandesService.feed with the accent-insensitive search', () => {
  it('ANDs the matching ids into findMany, and searches locationLabel', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'match-2' }]);
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
      repairerProfile: { findFirst: vi.fn().mockResolvedValue({ lat: 48.8566, lng: 2.3522 }) },
      category: { findMany: vi.fn().mockResolvedValue([]) },
      demande: { findMany },
      $queryRaw: queryRaw,
    };
    const service = new DemandesService(
      withUserLookups(prisma) as unknown as PrismaService,
      {} as GeocodeService,
      {} as NotificationsService,
    );

    await service.feed('repairer-user-1', { q: 'Ecran' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where.id).toEqual({ in: ['match-2'] });
    expect(sqlOf(queryRaw.mock.calls[0]!).text).toContain('locationLabel');
  });

  it('runs no search query when there is no q', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn();
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
      repairerProfile: { findFirst: vi.fn().mockResolvedValue({ lat: 48.8566, lng: 2.3522 }) },
      category: { findMany: vi.fn().mockResolvedValue([]) },
      demande: { findMany },
      $queryRaw: queryRaw,
    };
    const service = new DemandesService(
      withUserLookups(prisma) as unknown as PrismaService,
      {} as GeocodeService,
      {} as NotificationsService,
    );

    await service.feed('repairer-user-1', {});
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0]![0].where.id).toBeUndefined();
  });
});
