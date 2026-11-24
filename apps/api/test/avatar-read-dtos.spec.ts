import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepairersService } from '../src/repairers/repairers.service.js';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ModerationService } from '../src/conversations/moderation.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * `CF-34` gave `RepairersService` a second constructor argument. This stub resolves nothing,
 * which is correct for every test in this file: none sends `near`, so `lookupPostalCode` must
 * never be called. Returning null rather than throwing keeps the failure mode "distance is
 * absent" rather than "the suite explodes" if one ever does.
 */
const noGeocode = {
  lookupPostalCode: () => Promise.resolve(null),
} as unknown as GeocodeService;

/**
 * `CF-23`, the read side. Three DTOs gained `avatarUrl`, and each is signed by a different
 * service - so each gets its own assertions rather than trusting that one implementation implies
 * the others.
 *
 * The batching assertions matter as much as the values. Signing is a network call, and the
 * directory and inbox are unbounded lists (neither has a `take`), so a per-row sign would be an
 * N+1 that only shows up once real accounts have photos. Asserted by counting calls, which is the
 * only thing that can tell one signed URL per row from one request for all of them.
 */

const CLIENT = 'client-1';
const REPAIRER = 'repairer-1';
const OTHER_REPAIRER = 'repairer-2';
const OBJ = '33333333-3333-4333-8333-333333333333';

const avatarOf = (userId: string) => `avatars/${userId}/${OBJ}.jpg`;

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  process.env.STORAGE_DRIVER = 'fake';
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

/** Seeds the bucket the way a completed upload would. */
function uploaded(...paths: string[]): void {
  const g = storageGateway() as FakeStorageGateway;
  for (const p of paths) g.seed(p);
}

// ---------------------------------------------------------------------------
// RepairerCardDto - the directory and the public profile, from one CARD_SELECT
// ---------------------------------------------------------------------------

function repairersService(
  rows: { userId: string; avatarPath: string | null }[],
): RepairersService {
  const shaped = rows.map((r) => ({
    userId: r.userId,
    displayName: `Atelier ${r.userId}`,
    serviceAreaLabel: 'Lyon',
    bio: null,
    // `CF-24` added this column to the row `getPublicProfile` selects. Stated explicitly rather
    // than left off: the stub is `as unknown as PrismaService`, so an omitted field would arrive
    // `undefined` and quietly exercise a shape the database cannot produce.
    bannerPath: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      username: `u_${r.userId}`,
      profile: { verificationLevel: 'NONE', avatarPath: r.avatarPath },
    },
  }));

  const prisma = withUserLookups({
    repairerProfile: {
      findMany: vi.fn().mockResolvedValue(shaped),
      findFirst: vi.fn().mockResolvedValue(shaped[0]),
    },
    repairerCategory: { findMany: vi.fn().mockResolvedValue([]) },
    review: { groupBy: vi.fn().mockResolvedValue([]) },
    commande: { groupBy: vi.fn().mockResolvedValue([]) },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return new RepairersService(prisma, noGeocode);
}

describe('RepairerCardDto.avatarUrl', () => {
  it('is null for a réparateur who has never uploaded one', async () => {
    const cards = await repairersService([{ userId: REPAIRER, avatarPath: null }]).list(CLIENT, {});
    expect(cards[0]!.avatarUrl).toBeNull();
  });

  it('is a signed url once his object is in the bucket', async () => {
    const path = avatarOf(REPAIRER);
    uploaded(path);

    const cards = await repairersService([{ userId: REPAIRER, avatarPath: path }]).list(CLIENT, {});
    expect(cards[0]!.avatarUrl).toContain(path);
  });

  /**
   * The directory has no `take`, so a sign-per-row would grow with the réparateur count. ONE call
   * for the whole page, the same shape `listMine` uses for demande thumbnails.
   */
  it('signs the WHOLE page in one call, not one call per row', async () => {
    const first = avatarOf(REPAIRER);
    const second = avatarOf(OTHER_REPAIRER);
    uploaded(first, second);
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    const cards = await repairersService([
      { userId: REPAIRER, avatarPath: first },
      { userId: OTHER_REPAIRER, avatarPath: second },
    ]).list(CLIENT, {});

    expect(cards.map((c) => c.avatarUrl)).toEqual([
      expect.stringContaining(first),
      expect.stringContaining(second),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not sign at all when nobody on the page has a photo', async () => {
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    await repairersService([
      { userId: REPAIRER, avatarPath: null },
      { userId: OTHER_REPAIRER, avatarPath: null },
    ]).list(CLIENT, {});

    // An empty batch is a round trip whose answer is already known -- the reason
    // `repairerStats` short-circuits on an empty id list.
    expect(spy).not.toHaveBeenCalled();
  });

  it('is null when the column outlives its object', async () => {
    const cards = await repairersService([
      { userId: REPAIRER, avatarPath: avatarOf(REPAIRER) },
    ]).list(CLIENT, {});
    expect(cards[0]!.avatarUrl).toBeNull();
  });

  it('reaches the PUBLIC PROFILE from the same select, so the two screens cannot disagree', async () => {
    const path = avatarOf(REPAIRER);
    uploaded(path);

    const profile = await repairersService([
      { userId: REPAIRER, avatarPath: path },
    ]).getPublicProfile(REPAIRER);

    expect(profile.avatarUrl).toContain(path);
  });

  /**
   * `MeResponse` falls back to the OAuth `image`; a public card must NOT. Publishing a
   * provider-supplied avatar on a directory would put a photo on the internet its owner never
   * chose to publish.
   */
  it('carries no OAuth image field of any kind', async () => {
    const cards = await repairersService([{ userId: REPAIRER, avatarPath: null }]).list(CLIENT, {});
    expect(JSON.stringify(cards[0]!)).not.toMatch(/googleusercontent|"image"/);
  });
});

// ---------------------------------------------------------------------------
// ConversationListItem - the inbox, both directions
// ---------------------------------------------------------------------------

function conversationsService(
  rows: { clientUserId: string; clientAvatar: string | null; repairerAvatar: string | null }[],
): ConversationsService {
  const shaped = rows.map((r, i) => ({
    id: `c${i}`,
    clientUserId: r.clientUserId,
    lastMessageAt: new Date('2026-08-30T10:00:00Z'),
    clientLastReadAt: null,
    repairerLastReadAt: null,
    demande: { title: 'iPhone 13' },
    client: { username: 'malek_k', profile: { avatarPath: r.clientAvatar } },
    repairer: {
      username: 'atelier_l',
      repairerProfile: { displayName: 'Atelier Lyon' },
      profile: { avatarPath: r.repairerAvatar },
    },
    messages: [{ body: 'Bonjour' }],
  }));

  const prisma = withUserLookups({
    conversation: { findMany: vi.fn().mockResolvedValue(shaped) },
    message: { groupBy: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return new ConversationsService(
    prisma,
    {} as ModerationService,
    {} as NotificationsService,
  );
}

describe('ConversationListItem.avatarUrl', () => {
  it('is null when the counterpart has no photo', async () => {
    const rows = await conversationsService([
      { clientUserId: CLIENT, clientAvatar: null, repairerAvatar: null },
    ]).listInbox(CLIENT);

    expect(rows[0]!.avatarUrl).toBeNull();
  });

  it('shows the RÉPARATEUR\'s photo to the client', async () => {
    const path = avatarOf(REPAIRER);
    uploaded(path, avatarOf(CLIENT));

    const rows = await conversationsService([
      { clientUserId: CLIENT, clientAvatar: avatarOf(CLIENT), repairerAvatar: path },
    ]).listInbox(CLIENT);

    // The counterpart's, never the caller's own -- an inbox shows who you are talking to.
    expect(rows[0]!.avatarUrl).toContain(path);
    expect(rows[0]!.avatarUrl).not.toContain(avatarOf(CLIENT));
  });

  it('shows the CLIENT\'s photo to the réparateur', async () => {
    const path = avatarOf(CLIENT);
    uploaded(path, avatarOf(REPAIRER));

    const rows = await conversationsService([
      { clientUserId: CLIENT, clientAvatar: path, repairerAvatar: avatarOf(REPAIRER) },
    ]).listInbox('someone-who-is-not-the-client');

    expect(rows[0]!.avatarUrl).toContain(path);
  });

  it('signs the whole inbox in one call', async () => {
    uploaded(avatarOf(REPAIRER), avatarOf(OTHER_REPAIRER));
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    await conversationsService([
      { clientUserId: CLIENT, clientAvatar: null, repairerAvatar: avatarOf(REPAIRER) },
      { clientUserId: CLIENT, clientAvatar: null, repairerAvatar: avatarOf(OTHER_REPAIRER) },
    ]).listInbox(CLIENT);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not sign at all for an inbox where no counterpart has a photo', async () => {
    const spy = vi.spyOn(storageGateway(), 'createSignedReadUrls');

    await conversationsService([
      { clientUserId: CLIENT, clientAvatar: null, repairerAvatar: null },
    ]).listInbox(CLIENT);

    expect(spy).not.toHaveBeenCalled();
  });
});
