import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicTownLabel, type BrowseQuery } from '@revime/shared';
import {
  BROWSE_PAGE_SIZE,
  DemandesService,
  toPublicDemandeView,
} from '../src/demandes/demandes.service.js';
import { __resetStorageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

/** CF4-24 (spec §3 H1, §4.2.1) browse, and CF4-25's `quoteRequest` on the author's DTOs. */

const ME = 'client-2';

function harness(rows: unknown[] = [], matchingIds: string[] = []) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const queryRaw = vi.fn().mockResolvedValue(matchingIds.map((id) => ({ id })));
  const prisma = {
    $queryRaw: queryRaw,
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: false }) },
    category: { findMany: vi.fn().mockResolvedValue([{ id: 'child' }]) },
    demande: { findMany },
  };
  const service = new DemandesService(withUserLookups(prisma) as unknown as PrismaService, {} as GeocodeService, {} as NotificationsService);
  return { service, prisma, findMany, queryRaw };
}
const argsOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0]![0] as Record<string, any>;

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
});

describe('DemandesService.browse', () => {
  it('reads OPEN public demandes, never the caller\'s own, newest first, first page', async () => {
    const { service, findMany } = harness();
    await service.browse(ME, {} as BrowseQuery);
    const args = argsOf(findMany);
    expect(args.where).toEqual({
      status: 'OPEN',
      authorUserId: { not: ME },
      // PUB-33 (DECP-23): a real caller sees only real authors.
      author: { email: { not: { endsWith: '@review.revime.fr' }, mode: 'insensitive' } },
      deletedAt: null,
      hiddenAt: null,
      targetRepairerUserId: null,
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(BROWSE_PAGE_SIZE);
  });

  it('is available without réparateur mode', async () => {
    const { service, findMany } = harness();
    await expect(service.browse(ME, {} as BrowseQuery)).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('pages by BROWSE_PAGE_SIZE', async () => {
    const { service, findMany } = harness();
    await service.browse(ME, { page: 3 } as BrowseQuery);
    expect(argsOf(findMany).skip).toBe(2 * BROWSE_PAGE_SIZE);
  });

  it('honours q (narrowing, like the feed) and categoryId (with its children)', async () => {
    const { service, findMany } = harness([], ['match-1']);
    const cat = '11111111-1111-4111-8111-111111111111';
    await service.browse(ME, { q: 'écran', categoryId: cat } as BrowseQuery);
    const where = argsOf(findMany).where;
    expect(where.id).toEqual({ in: ['match-1'] });
    expect(where.categoryId).toEqual({ in: [cat, 'child'] });
    // Still public only.
    expect(where.targetRepairerUserId).toBeNull();
  });

  it('never searches locationLabel: the stored label holds the street and postcode, which the view never shows (H1)', async () => {
    const { service, findMany, queryRaw } = harness([], ['match-1']);
    await service.browse(ME, { q: '75001' } as BrowseQuery);
    // The search is a SQL query now, so the column list is read from the SQL itself.
    const sql = (queryRaw.mock.calls[0]![0] as { strings: string[] }).strings.join('?');
    expect(sql).not.toContain('locationLabel');
    expect(JSON.stringify(argsOf(findMany).where)).not.toContain('locationLabel');
    // The other columns still narrow.
    expect(sql).toContain('d."title"');
    expect(argsOf(findMany).where.id).toEqual({ in: ['match-1'] });
  });

  it('selects only what the view shows - no postcode, coordinates, author or offers', async () => {
    const { service, findMany } = harness();
    await service.browse(ME, {} as BrowseQuery);
    expect(Object.keys(argsOf(findMany).select).sort()).toEqual(
      ['budgetCents', 'category', 'createdAt', 'description', 'id', 'locationLabel', 'photos', 'title'].sort(),
    );
  });
});

describe('toPublicDemandeView (Review Focus 5)', () => {
  it('has exactly the H1 keys even when the row carries more', () => {
    const row = {
      id: 'd1',
      title: 'Écran cassé',
      description: 'Fissuré.',
      budgetCents: 8000,
      locationLabel: '12 rue de la Paix 75002 Paris',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      category: { id: 'c1', labelFr: 'Téléphone', slug: 'tel' },
      photos: [{ storagePath: 'demandes/u/d/a.jpg' }],
      // What must never leak, whatever a future select adds:
      postalCode: '75002',
      lat: 48.86,
      lng: 2.33,
      authorUserId: 'client-1',
      author: { username: 'julie' },
      offers: [{ priceCents: 5000 }],
      _count: { offers: 3 },
      distanceKm: 1.2,
      targetRepairerUserId: null,
    };
    const view = toPublicDemandeView(row, new Map([['demandes/u/d/a.jpg', 'https://signed/a']]));
    expect(Object.keys(view).sort()).toEqual(
      ['budgetCents', 'category', 'createdAt', 'description', 'id', 'locationLabel', 'photos', 'title'],
    );
    expect(Object.keys(view.category).sort()).toEqual(['id', 'labelFr']);
    expect(view).toEqual({
      id: 'd1',
      title: 'Écran cassé',
      description: 'Fissuré.',
      photos: ['https://signed/a'],
      category: { id: 'c1', labelFr: 'Téléphone' },
      budgetCents: 8000,
      locationLabel: 'Paris',
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('drops a photo it cannot sign', () => {
    const view = toPublicDemandeView(
      {
        id: 'd1', title: 't', description: 'd', budgetCents: null, locationLabel: 'Lyon',
        createdAt: new Date(0), category: { id: 'c', labelFr: 'C' }, photos: [{ storagePath: 'gone' }],
      },
      new Map(),
    );
    expect(view.photos).toEqual([]);
  });
});

describe('publicTownLabel (H1: the town, never the postcode)', () => {
  it.each([
    ['12 rue de la Paix 75002 Paris', 'Paris'],
    ['75002 Paris', 'Paris'],
    ['Lyon 3e', 'Lyon 3e'],
    ['Lyon', 'Lyon'],
    ['69003', ''],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(publicTownLabel(input)).toBe(expected);
  });
});

describe('GET demandes/browse is declared before GET demandes/:id', () => {
  it('in the controller source', () => {
    const src = readFileSync(new URL('../src/demandes/demandes.controller.ts', import.meta.url), 'utf8');
    const browse = src.indexOf("@Get('browse')");
    expect(browse).toBeGreaterThan(-1);
    expect(browse).toBeLessThan(src.indexOf("@Get(':id')"));
  });
});

describe('quoteRequest on the author\'s DTOs', () => {
  const TARGET = 'repairer-1';
  const quoteCols = {
    targetRepairerUserId: TARGET,
    quotePreferredTravel: 'HOME',
    quoteDetails: 'Le soir.',
    quoteExpiresAt: new Date('2026-10-07T10:00:00Z'),
    quoteClosedReason: null,
    quoteDeclineNote: null,
  };
  const publicCols = {
    targetRepairerUserId: null,
    quotePreferredTravel: null,
    quoteDetails: null,
    quoteExpiresAt: null,
    quoteClosedReason: null,
    quoteDeclineNote: null,
  };
  const expected = {
    repairer: { userId: TARGET, displayName: 'Atelier Martin' },
    preferredTravel: 'HOME',
    details: 'Le soir.',
    expiresAt: '2026-10-07T10:00:00.000Z',
    closedReason: null,
    declineNote: null,
  };
  const users = vi.fn().mockResolvedValue([
    { id: TARGET, username: 'martin', repairerProfile: { displayName: 'Atelier Martin' } },
  ]);

  const detailRow = (cols: Record<string, unknown>) => ({
    id: 'd1', authorUserId: 'client-1', title: 't', description: 'd', brand: null, model: null,
    parts: 'UNKNOWN', mode: 'OFFERS', budgetCents: null, locationLabel: 'Lyon', postalCode: '69001',
    status: 'OPEN', lat: null, lng: null, createdAt: new Date(0), category: { id: 'c', slug: 's', labelFr: 'C' },
    photos: [], author: { username: 'julie', createdAt: new Date(0) }, commandes: [], _count: { offers: 0 },
    ...cols,
  });

  function detailService(row: unknown) {
    const prisma = {
      profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: false }) },
      repairerProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      demande: { findFirst: vi.fn().mockResolvedValue(row), findMany: vi.fn().mockResolvedValue([{ ...(row as object), photos: [] }]) },
      user: { findMany: users },
    };
    return new DemandesService(withUserLookups(prisma) as unknown as PrismaService, {} as GeocodeService, {} as NotificationsService);
  }

  it('getForViewer carries it on a private request, with the réparateur\'s public name', async () => {
    const dto = await detailService(detailRow(quoteCols)).getForViewer('client-1', 'd1');
    expect(dto.quoteRequest).toEqual(expected);
  });

  it('carries the decline reason once closed', async () => {
    const dto = await detailService(
      detailRow({ ...quoteCols, status: 'CANCELLED', quoteExpiresAt: null, quoteClosedReason: 'DECLINED', quoteDeclineNote: 'Trop loin' }),
    ).getForViewer('client-1', 'd1');
    expect(dto.quoteRequest).toMatchObject({ closedReason: 'DECLINED', declineNote: 'Trop loin', expiresAt: null });
  });

  it('is null on a public demande', async () => {
    const dto = await detailService(detailRow(publicCols)).getForViewer('client-1', 'd1');
    expect(dto.quoteRequest).toBeNull();
  });

  it('listMine carries it too, one user lookup for the whole list', async () => {
    users.mockClear();
    const items = await detailService(detailRow(quoteCols)).listMine('client-1');
    expect(items[0]!.quoteRequest).toEqual(expected);
    expect(users).toHaveBeenCalledTimes(1);
    expect(users.mock.calls[0]![0].where).toEqual({ id: { in: [TARGET] } });
  });

  it('listMine on public rows reads no user', async () => {
    users.mockClear();
    const items = await detailService(detailRow(publicCols)).listMine('client-1');
    expect(items[0]!.quoteRequest).toBeNull();
    expect(users).not.toHaveBeenCalled();
  });
});
