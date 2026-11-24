import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowseQuery, FeedQuery } from '@revime/shared';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { matchingDemandeWhere } from '../src/demandes/matching-demande-where.js';
import { FavoritesService } from '../src/favorites/favorites.service.js';
import { OffersService } from '../src/offers/offers.service.js';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { __resetStorageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ModerationService } from '../src/conversations/moderation.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * CF4-25 (spec §4.2 « Visibility », Review Focus 1). A private request is readable by its
 * author, its target réparateur and admins - and by NO other read path. Each service below
 * runs against a fake Prisma whose `demande` reads evaluate the service's REAL `where`
 * against three rows, so a site that forgets the predicate returns the private row here.
 */

const C1 = 'client-1'; // author of every row
const C2 = 'client-2'; // third-party client
const R1 = 'repairer-1'; // target of PRIVATE_R1
const R2 = 'repairer-2'; // third-party réparateur

type Row = Record<string, unknown> & { id: string };

const base = (id: string, targetRepairerUserId: string | null): Row => ({
  id,
  authorUserId: C1,
  categoryId: 'c1',
  status: 'OPEN',
  deletedAt: null,
  hiddenAt: null,
  targetRepairerUserId,
  quoteClosedReason: null,
  quoteDeclineNote: null,
  quoteExpiresAt: null,
  quotePreferredTravel: null,
  quoteDetails: null,
  title: `Titre ${id}`,
  description: 'Une description assez longue.',
  brand: null,
  model: null,
  parts: 'UNKNOWN',
  mode: 'OFFERS',
  budgetCents: null,
  locationLabel: 'Lyon',
  postalCode: '69001',
  lat: null,
  lng: null,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  category: { id: 'c1', slug: 'tel', labelFr: 'Téléphone' },
  photos: [],
  offers: [],
  commandes: [],
  author: { username: 'julie', createdAt: new Date('2026-01-01T00:00:00Z') },
  _count: { offers: 0 },
});

const PUBLIC = base('public-open', null);
const PRIVATE_R1 = base('private-r1', R1);
const PRIVATE_R2 = base('private-r2', R2);
const ROWS = [PUBLIC, PRIVATE_R1, PRIVATE_R2];

/** The Demande scalars the matcher understands. */
/** Relation filters the fixture rows carry no data for, so they are skipped on purpose. */
const RELATIONS_NOT_MODELLED = new Set(['offers']);

const SCALARS = new Set(['id', 'authorUserId', 'categoryId', 'status', 'deletedAt', 'hiddenAt', 'targetRepairerUserId', 'title']);

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  for (const [k, v] of Object.entries(where ?? {})) {
    if (k === 'OR') {
      if (!(v as Record<string, unknown>[]).some((w) => matches(w, row))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as Record<string, unknown>[]).every((w) => matches(w, row))) return false;
      continue;
    }
    if (k === 'author') {
      // PUB-33 (DECP-23): the store-review seal filters on the author's e-mail. Every row here is
      // written by a real account, so the real side's filter keeps it and the review side's drops it.
      const email = `${String(row.authorUserId)}@example.fr`.toLowerCase();
      const f = (v as { email?: { endsWith?: string; not?: { endsWith?: string } } }).email ?? {};
      if (f.endsWith !== undefined && !email.endsWith(f.endsWith.toLowerCase())) return false;
      if (f.not?.endsWith !== undefined && email.endsWith(f.not.endsWith.toLowerCase())) return false;
      continue;
    }
    if (RELATIONS_NOT_MODELLED.has(k)) continue;
    // Loud, not silent: a key the matcher does not understand would otherwise count as « matches »
    // and let a dropped or misspelled predicate pass for a working one.
    if (!SCALARS.has(k)) throw new Error(`demande-visibility-leak matcher does not model the where key « ${k} »`);
    const actual = row[k];
    if (v === null) {
      if (actual !== null) return false;
    } else if (typeof v === 'object') {
      const f = v as { not?: unknown; in?: unknown[]; contains?: string };
      if ('not' in f && actual === f.not) return false;
      if ('in' in f && !f.in!.includes(actual)) return false;
      if ('contains' in f && typeof actual === 'string' && typeof f.contains === 'string') {
        if (!actual.toLowerCase().includes(f.contains.toLowerCase())) return false;
      }
    } else if (actual !== v) {
      return false;
    }
  }
  return true;
}

const pick = (args: { where?: Record<string, unknown> }) => ROWS.filter((r) => matches(args.where, r));

function fakePrisma(opts: { repairerEnabled: boolean; savedIds?: string[] }) {
  return {
    profile: {
      findFirst: vi.fn().mockResolvedValue({
        repairerEnabled: opts.repairerEnabled,
        verificationLevel: 'BUSINESS',
        repairerSuspendedAt: null,
        user: { emailVerified: new Date(), phoneVerifiedAt: new Date() },
      }),
    },
    repairerProfile: {
      findFirst: vi.fn().mockResolvedValue({ lat: null, lng: null, postalCode: '69001', kind: 'PRO' }),
      findUnique: vi.fn().mockResolvedValue({ kind: 'PRO' }),
    },
    repairerCategory: { findMany: vi.fn().mockResolvedValue([{ categoryId: 'c1' }]) },
    category: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', parentId: null }]) },
    // The search match is made in SQL (`searchFilter`); every row « matches » here, so what the
    // test pins is that the visibility predicate still excludes the private ones.
    $queryRaw: vi.fn().mockResolvedValue(ROWS.map((r) => ({ id: r.id }))),
    demande: {
      findMany: vi.fn(async (args) => pick(args)),
      findFirst: vi.fn(async (args) => pick(args)[0] ?? null),
    },
    favoriteDemande: {
      findMany: vi.fn().mockResolvedValue((opts.savedIds ?? []).map((demandeId) => ({ demandeId }))),
      upsert: vi.fn().mockResolvedValue({}),
    },
    offer: { findFirst: vi.fn().mockResolvedValue(null) },
    conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    // CF4-25 `quoteInfos`: the target's public name on private rows.
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const demandes = (p: ReturnType<typeof fakePrisma>) =>
  new DemandesService(withUserLookups(p) as unknown as PrismaService, {} as GeocodeService, {} as NotificationsService);

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
  process.env.MESSAGING_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.MESSAGING_ENABLED;
});

describe('feed and « Pour moi » never carry a private request', () => {
  it.each([R1, R2])('feed for %s is the public row only - even for the target', async (who) => {
    const items = await demandes(fakePrisma({ repairerEnabled: true })).feed(who, {} as FeedQuery);
    expect(items.map((i) => i.id)).toEqual([PUBLIC.id]);
  });

  it('matchingDemandeWhere excludes both private rows', () => {
    const where = matchingDemandeWhere(R1, ['c1']) as Record<string, unknown>;
    expect(ROWS.filter((r) => matches(where, r)).map((r) => r.id)).toEqual([PUBLIC.id]);
  });
});

describe('browse never carries a private request (CF6-16)', () => {
  it.each([C2, R1, R2])('browse for %s returns the public row only - never a private quote request', async (who) => {
    const items = await demandes(fakePrisma({ repairerEnabled: false })).browse(who, {} as BrowseQuery);
    expect(items.map((i) => i.id)).toEqual([PUBLIC.id]);
  });

  it('browse for author C1 excludes own requests and still returns no private rows', async () => {
    const items = await demandes(fakePrisma({ repairerEnabled: false })).browse(C1, {} as BrowseQuery);
    expect(items).toEqual([]);
  });

  it('browse with text search excludes private rows even if title matches', async () => {
    const items = await demandes(fakePrisma({ repairerEnabled: false })).browse(C2, { q: 'Titre' } as BrowseQuery);
    expect(items.map((i) => i.id)).toEqual([PUBLIC.id]);
  });

  it('browse with category filter excludes private rows', async () => {
    const items = await demandes(fakePrisma({ repairerEnabled: false })).browse(C2, { categoryId: 'c1' } as BrowseQuery);
    expect(items.map((i) => i.id)).toEqual([PUBLIC.id]);
  });
});

describe('favourites', () => {
  it('a third party cannot save a private request', async () => {
    const svc = new FavoritesService(withUserLookups(fakePrisma({ repairerEnabled: false })) as unknown as PrismaService);
    await expect(svc.addDemande(C2, PRIVATE_R1.id)).rejects.toThrow("Cette annonce n'est plus disponible.");
    await expect(svc.addDemande(R1, PRIVATE_R1.id)).rejects.toThrow("Cette annonce n'est plus disponible.");
  });

  it('the saved list drops a private request', async () => {
    const svc = new FavoritesService(
      withUserLookups(fakePrisma({ repairerEnabled: false, savedIds: ROWS.map((r) => r.id) })) as unknown as PrismaService,
    );
    const list = await svc.listDemandes(C2);
    expect(list.map((i) => i.id)).toEqual([PUBLIC.id]);
  });
});

describe('getForViewer', () => {
  const read = (who: string, repairerEnabled: boolean, id: string) =>
    demandes(fakePrisma({ repairerEnabled })).getForViewer(who, id);

  it.each([PRIVATE_R1.id, PRIVATE_R2.id])('a third-party client gets 404 on %s', async (id) => {
    await expect(read(C2, false, id)).rejects.toThrow('Ressource introuvable.');
  });
  it('a third-party client in réparateur mode still gets 404', async () => {
    await expect(read(C2, true, PRIVATE_R1.id)).rejects.toThrow('Ressource introuvable.');
  });
  it('the target réparateur reads his request', async () => {
    expect((await read(R1, true, PRIVATE_R1.id)).id).toBe(PRIVATE_R1.id);
  });
  it('the target reads it even after leaving réparateur mode (Review Focus 3)', async () => {
    expect((await read(R1, false, PRIVATE_R1.id)).id).toBe(PRIVATE_R1.id);
  });
  it('another réparateur gets 404', async () => {
    await expect(read(R2, true, PRIVATE_R1.id)).rejects.toThrow('Ressource introuvable.');
  });
  it('the author reads both', async () => {
    expect((await read(C1, false, PRIVATE_R1.id)).id).toBe(PRIVATE_R1.id);
    expect((await read(C1, false, PRIVATE_R2.id)).id).toBe(PRIVATE_R2.id);
  });
  it('a réparateur still reads an open public demande', async () => {
    expect((await read(R2, true, PUBLIC.id)).id).toBe(PUBLIC.id);
  });
  it('a third-party client reads an open public demande', async () => {
    expect((await read(C2, false, PUBLIC.id)).id).toBe(PUBLIC.id);
  });
  it('correctly populates isPrivate: true on private quote requests and false on public ones (CF6-16)', async () => {
    const priv = await read(R1, true, PRIVATE_R1.id);
    expect(priv.isPrivate).toBe(true);
    expect(priv.quoteRequest).not.toBeNull();

    const pub = await read(C2, false, PUBLIC.id);
    expect(pub.isPrivate).toBe(false);
    expect(pub.quoteRequest).toBeNull();
  });
});

describe('listMine distinguishes private and public requests with isPrivate (CF6-16)', () => {
  it('author listMine includes both public and private rows with distinct isPrivate flags', async () => {
    const svc = demandes(fakePrisma({ repairerEnabled: false }));
    const items = await svc.listMine(C1);
    const pub = items.find((i) => i.id === PUBLIC.id);
    const priv1 = items.find((i) => i.id === PRIVATE_R1.id);
    const priv2 = items.find((i) => i.id === PRIVATE_R2.id);

    expect(pub?.isPrivate).toBe(false);
    expect(priv1?.isPrivate).toBe(true);
    expect(priv2?.isPrivate).toBe(true);
  });
});

describe('side doors by id (Review Focus 1)', () => {
  const offerInput = {
    priceCents: 5000,
    delayHours: 24,
    warrantyLabel: 'Aucune' as const,
    partsLabel: "Pièce d'origine" as const,
    travel: 'WORKSHOP' as const,
    acceptsParcel: false,
  };

  it('offers.create on private-to-R1 by R2 → the existing 404', async () => {
    const p = fakePrisma({ repairerEnabled: true });
    const svc = new OffersService(withUserLookups(p) as unknown as PrismaService, {} as NotificationsService);
    await expect(svc.create(R2, PRIVATE_R1.id, offerInput)).rejects.toThrow('Ressource introuvable.');
  });

  it('offers.create on private-to-R1 by R1 passes the demande lookup', async () => {
    const p = fakePrisma({ repairerEnabled: true });
    p.offer.findFirst.mockResolvedValue({ id: 'already' }); // stop right after the lookup
    const svc = new OffersService(withUserLookups(p) as unknown as PrismaService, {} as NotificationsService);
    await expect(svc.create(R1, PRIVATE_R1.id, offerInput)).rejects.toThrow(
      'Vous avez déjà proposé une offre sur cette demande.',
    );
  });

  it('offers.listForDemande by R2 or R1 → 404 (author only)', async () => {
    const svc = new OffersService(withUserLookups(fakePrisma({ repairerEnabled: true })) as unknown as PrismaService, {} as NotificationsService);
    await expect(svc.listForDemande(R2, PRIVATE_R1.id)).rejects.toThrow('Ressource introuvable.');
    await expect(svc.listForDemande(R1, PRIVATE_R1.id)).rejects.toThrow('Ressource introuvable.');
  });

  const conversations = () =>
    new ConversationsService(
      withUserLookups(fakePrisma({ repairerEnabled: true })) as unknown as PrismaService,
      {} as ModerationService,
      {} as NotificationsService,
    );

  it('POST conversations with the private demandeId from R2 → 404', async () => {
    await expect(
      conversations().getOrCreate(R2, { demandeId: PRIVATE_R1.id, repairerUserId: R2 }),
    ).rejects.toThrow();
    await expect(
      conversations().getOrCreate(R2, { demandeId: PRIVATE_R1.id, repairerUserId: R2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POST conversations by the author naming a réparateur other than the target → 404', async () => {
    await expect(
      conversations().getOrCreate(C1, { demandeId: PRIVATE_R1.id, repairerUserId: R2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POST conversations author ↔ target reaches the offer check (no 404)', async () => {
    await expect(
      conversations().getOrCreate(C1, { demandeId: PRIVATE_R1.id, repairerUserId: R1 }),
    ).rejects.toThrow("Ce réparateur ne vous a pas encore fait d'offre.");
  });
});

/**
 * Every remaining `VISIBLE_DEMANDE_WHERE` use is an AUTHOR or OWN-ROW read, where a private
 * request is legitimately visible. A new public read written with the author predicate lands
 * here as an unexpected line and fails - use `PUBLIC_DEMANDE_WHERE` instead.
 */
describe('VISIBLE_DEMANDE_WHERE is left only on author / own-row sites', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === 'generated' ? [] : files(p);
      return p.endsWith('.ts') ? [p] : [];
    });

  it('matches the expected list', () => {
    const found: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (rel === 'demandes/demande-predicates.ts') continue;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line) => {
          const t = line.trim();
          if (!t.includes('VISIBLE_DEMANDE_WHERE')) return;
          if (t.startsWith('import ') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          found.push(`${rel} | ${t}`);
        });
    }
    expect(found.sort()).toEqual(
      [
        // update / remove / cancel (CF4-27): author-scoped in the WHERE.
        'demandes/demandes.service.ts | where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        'demandes/demandes.service.ts | where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        'demandes/demandes.service.ts | where: { id, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        // listMine.
        'demandes/demandes.service.ts | where: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        // getForViewer: the author branch and the target branch.
        'demandes/demandes.service.ts | { ...VISIBLE_DEMANDE_WHERE, authorUserId: userId },',
        'demandes/demandes.service.ts | { ...VISIBLE_DEMANDE_WHERE, targetRepairerUserId: userId },',
        // offers: withdraw and listMine (his own offers), decline, and listForDemande (author). (listReceived uses PUBLIC_DEMANDE_WHERE in CF6-14).
        'offers/offers.service.ts | demande: VISIBLE_DEMANDE_WHERE,',
        'offers/offers.service.ts | where: { repairerUserId: userId, deletedAt: null, demande: VISIBLE_DEMANDE_WHERE },',
        'offers/offers.service.ts | demande: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        'offers/offers.service.ts | where: { id: demandeId, authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        // createCheckout: author.
        'payments/payments.service.ts | demande: { authorUserId: userId, ...VISIBLE_DEMANDE_WHERE },',
        // CF4-25 listForRepairer: the target's own requests.
        'quote-requests/quote-requests.service.ts | where: { targetRepairerUserId: repairerId, ...VISIBLE_DEMANDE_WHERE },',
        // CF4-25 findRequest (author or target in the WHERE) and the expiry job (not a viewer).
        'quote-requests/quote-requests.service.ts | where: { ...party, targetRepairerUserId: party.targetRepairerUserId ?? { not: null }, ...VISIBLE_DEMANDE_WHERE },',
        'quote-requests/quote-requests.service.ts | ...VISIBLE_DEMANDE_WHERE,',
        // CF4-25 dashboard QUOTE_REQUESTS: requests addressed to him (target in the WHERE).
        'repairers/repairer-dashboard.service.ts | ...VISIBLE_DEMANDE_WHERE,',
      ].sort(),
    );
  });
});
