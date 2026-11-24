import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';
import { __resetSignLimit, SIGN_RATE_PER_HOUR } from '../src/storage/sign-limit.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-24`, the write side. Unit tests with a stubbed Prisma and the REAL `FakeStorageGateway`, the
 * shape `avatar-service.spec.ts` established and for the same standing reason: `DATABASE_URL` points
 * at PRODUCTION even locally and the integration suite writes, so `test:unit` excluding the 30
 * `*.int.spec.ts` files makes this the only gate that can ever run on these rules.
 *
 * No `vi.mock` anywhere. `STORAGE_DRIVER=fake` plus `__resetStorageGateway()` reach the gateway
 * through the same surface production uses.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';
const SECOND = '44444444-4444-4444-8444-444444444444';
const ORPHAN = '55555555-5555-4555-8555-555555555555';

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  __resetSignLimit();
  process.env.STORAGE_DRIVER = 'fake';
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
  __resetSignLimit();
});

type Opts = {
  /** What `RepairerProfile.bannerPath` currently holds. */
  bannerPath?: string | null;
  /** False models a CLIENT-ONLY account, which both banner routes must refuse. */
  repairerEnabled?: boolean;
};

type Harness = {
  service: UsersService;
  repairerUpdate: ReturnType<typeof vi.fn>;
};

function harness({ bannerPath = null, repairerEnabled = true }: Opts = {}): Harness {
  let current = bannerPath;
  const repairerUpdate = vi
    .fn()
    .mockImplementation(({ data }: { data: { bannerPath: string | null } }) => {
      current = data.bannerPath;
      return Promise.resolve({ userId: USER, bannerPath: current });
    });

  const prisma = {
    profile: {
      findFirst: vi.fn().mockImplementation(() =>
        Promise.resolve({ clientEnabled: true, repairerEnabled, avatarPath: null }),
      ),
      findUniqueOrThrow: vi.fn().mockImplementation(() =>
        Promise.resolve({ clientEnabled: true, repairerEnabled, avatarPath: null }),
      ),
      update: vi.fn(),
    },
    repairerProfile: { update: repairerUpdate },
    user: {
      findUniqueOrThrow: vi.fn().mockImplementation(() =>
        Promise.resolve({
          id: USER,
          email: 'a@b.fr',
          name: 'Malek K',
          firstName: 'Malek',
          lastName: 'K',
          username: 'malek_k',
          phone: null,
          emailVerified: true,
          phoneVerifiedAt: null,
          image: null,
          role: null,
          profile: {
            clientEnabled: true,
            repairerEnabled,
            activeMode: 'REPAIRER',
            verificationLevel: 'NONE',
            onboardingCompletedAt: null,
            avatarPath: null,
            deletedAt: null,
            notifyOffers: true,
            notifyMessages: true,
            notifyCommandes: true,
          },
          repairerProfile: repairerEnabled
            ? {
                kind: 'INDIVIDUAL',
                displayName: 'Atelier Lyon',
                bio: null,
                postalCode: '69003',
                serviceAreaLabel: 'Lyon',
                serviceRadiusKm: null,
                bannerPath: current,
                deletedAt: null,
              }
            : null,
          repairerCategories: [],
          repairerAvailability: [],
        }),
      ),
    },
  } as unknown as PrismaService;

  return { service: new UsersService(prisma, {} as GeocodeService), repairerUpdate };
}

/** Seeds the bucket the way a completed client-side PUT would. */
function uploaded(...paths: string[]): void {
  const g = storageGateway() as FakeStorageGateway;
  for (const p of paths) g.seed(p);
}

const bannerOf = (user: string, object: string) => `banners/${user}/${object}.jpg`;

describe('MeResponse.repairer.bannerUrl', () => {
  it('is null for a réparateur who has never uploaded one', async () => {
    const me = await harness().service.me(USER);
    expect(me.repairer?.bannerUrl).toBeNull();
  });

  it('is a signed url once the object is in the bucket', async () => {
    const path = bannerOf(USER, OBJECT);
    uploaded(path);

    const me = await harness({ bannerPath: path }).service.me(USER);
    expect(me.repairer?.bannerUrl).toContain(path);
  });

  /**
   * The column outliving its object is a real state: the write and the prune are two steps and the
   * bucket can be edited by hand. `createSignedReadUrls` omits a path with no object rather than
   * fabricating a URL, so the fiche falls back to its motif instead of drawing a broken full-width
   * `<Image>`.
   */
  it('is null when the column points at an object that is GONE', async () => {
    const me = await harness({ bannerPath: bannerOf(USER, OBJECT) }).service.me(USER);
    expect(me.repairer?.bannerUrl).toBeNull();
  });

  it('is null when storage is not configured at all', async () => {
    delete process.env.STORAGE_DRIVER;
    __resetStorageGateway();

    const me = await harness({ bannerPath: bannerOf(USER, OBJECT) }).service.me(USER);
    expect(me.repairer?.bannerUrl).toBeNull();
  });

  /**
   * 🛑 THE PLACEMENT IS THE PRODUCT RULE. `repairer` is null for a client-only account, so « a
   * client has no banner » is stated by the type rather than by a null the app must remember. A
   * `bannerUrl` beside the top-level `avatarUrl` would have been reachable for an account with no
   * fiche publique to draw it on.
   */
  it('does not exist at the top level, where a client would also have one', async () => {
    const me = await harness({ repairerEnabled: false }).service.me(USER);
    expect(me.repairer).toBeNull();
    expect(me).not.toHaveProperty('bannerUrl');
  });
});

describe('signBannerUpload', () => {
  it('mints a path under the caller\'s own banner prefix', async () => {
    const { path, uploadUrl } = await harness().service.signBannerUpload(USER, {
      contentType: 'image/jpeg',
    });

    expect(path).toMatch(new RegExp(`^banners/${USER}/[0-9a-f-]{36}\\.jpg$`));
    expect(uploadUrl).toContain(path);
  });

  it('uses the png extension for a png', async () => {
    const { path } = await harness().service.signBannerUpload(USER, { contentType: 'image/png' });
    expect(path.endsWith('.png')).toBe(true);
  });

  /**
   * 🛑 THE ONE RULE THE AVATAR ROUTE DELIBERATELY DOES NOT HAVE. `bannerPath` is on
   * `RepairerProfile`, a row that does not exist until réparateur mode is enabled - so without this
   * the commit would raise Prisma's P2025 and surface as an opaque 500 rather than an explanation.
   */
  it('refuses a client-only account', async () => {
    await expect(
      harness({ repairerEnabled: false }).service.signBannerUpload(USER, {
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(/mode réparateur/);
  });

  /**
   * Gating the SIGN and not only the commit is what stops a client PUTting bytes into `banners/`
   * that no route can ever reference. There is no cron for that prefix, so such an object would
   * sit there forever.
   */
  it('creates NO object for a client-only account', async () => {
    const spy = vi.spyOn(storageGateway(), 'createSignedUpload');

    await expect(
      harness({ repairerEnabled: false }).service.signBannerUpload(USER, {
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(AppException);

    expect(spy).not.toHaveBeenCalled();
  });

  /** Fails CLOSED: a client that PUT bytes to a fake URL would believe the banner was stored. */
  it('refuses when storage is unconfigured rather than returning a dead url', async () => {
    delete process.env.STORAGE_DRIVER;
    __resetStorageGateway();

    await expect(
      harness().service.signBannerUpload(USER, { contentType: 'image/jpeg' }),
    ).rejects.toThrow(AppException);
  });

  /**
   * ONE per-user allowance across all three signing routes. A réparateur who has spent it on
   * demande photos or avatars must not get a fresh 60 of bucket writes by picking this one.
   */
  it('shares the ONE signing rate limit rather than opening a third unbounded route', async () => {
    const { service } = harness();
    for (let i = 0; i < SIGN_RATE_PER_HOUR; i++) {
      await service.signBannerUpload(USER, { contentType: 'image/jpeg' });
    }

    await expect(service.signBannerUpload(USER, { contentType: 'image/jpeg' })).rejects.toThrow(
      /Trop de photos/,
    );
  });

  /**
   * The limit is checked BEFORE the réparateur gate, so a client hammering the route cannot use its
   * own refusals as free attempts. Asserted by exhausting the budget as a client and then finding
   * the réparateur path also refused - for the limit, not for the mode.
   */
  it('charges the limit before the mode check, so refusals are not free', async () => {
    const client = harness({ repairerEnabled: false }).service;
    for (let i = 0; i < SIGN_RATE_PER_HOUR; i++) {
      await expect(client.signBannerUpload(USER, { contentType: 'image/jpeg' })).rejects.toThrow();
    }

    await expect(
      harness().service.signBannerUpload(USER, { contentType: 'image/jpeg' }),
    ).rejects.toThrow(/Trop de photos/);
  });
});

describe('setBanner', () => {
  it('writes the column for an object the caller uploaded', async () => {
    const path = bannerOf(USER, OBJECT);
    uploaded(path);
    const h = harness();

    const me = await h.service.setBanner(USER, { path });

    expect(h.repairerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannerPath: path } }),
    );
    expect(me.repairer?.bannerUrl).toContain(path);
  });

  it('refuses a client-only account', async () => {
    const path = bannerOf(USER, OBJECT);
    uploaded(path);
    const h = harness({ repairerEnabled: false });

    await expect(h.service.setBanner(USER, { path })).rejects.toThrow(/mode réparateur/);
    expect(h.repairerUpdate).not.toHaveBeenCalled();
  });

  it('refuses another account\'s path even when that object exists', async () => {
    const path = bannerOf(OTHER, OBJECT);
    uploaded(path);
    const h = harness();

    await expect(h.service.setBanner(USER, { path })).rejects.toThrow(AppException);
    expect(h.repairerUpdate).not.toHaveBeenCalled();
  });

  it('refuses the caller\'s own demande photo path', async () => {
    const path = `demandes/${USER}/${OBJECT}/${OBJECT}.jpg`;
    uploaded(path);
    const h = harness();

    await expect(h.service.setBanner(USER, { path })).rejects.toThrow(AppException);
    expect(h.repairerUpdate).not.toHaveBeenCalled();
  });

  /**
   * 🛑 THE CASE `CF-23` COULD NOT HAVE HAD, and the reason it is dangerous rather than merely
   * untidy: an avatar is an object this caller genuinely owns, so ownership alone accepts it - and
   * the prune below then deletes everything else under whichever prefix it was handed. Accepting a
   * crossed path would point the fiche's cover at the avatar object and delete the avatar on the
   * next photo change, or vice versa.
   */
  it('refuses the caller\'s own AVATAR path, and leaves that object intact', async () => {
    const avatar = `avatars/${USER}/${OBJECT}.jpg`;
    uploaded(avatar);
    const h = harness();

    await expect(h.service.setBanner(USER, { path: avatar })).rejects.toThrow(AppException);
    expect(h.repairerUpdate).not.toHaveBeenCalled();
    expect((await storageGateway().listPrefix(`avatars/${USER}`)).map((o) => o.name)).toEqual([
      `${OBJECT}.jpg`,
    ]);
  });

  /** Signing creates no object, so a well-formed path proves nothing about the bucket. */
  it('refuses a well-formed path whose object was never uploaded', async () => {
    const h = harness();
    await expect(h.service.setBanner(USER, { path: bannerOf(USER, OBJECT) })).rejects.toThrow(
      AppException,
    );
    expect(h.repairerUpdate).not.toHaveBeenCalled();
  });

  it('names the BANNER in its French messages, not the profile photo', async () => {
    const h = harness();
    await expect(h.service.setBanner(USER, { path: bannerOf(USER, OBJECT) })).rejects.toThrow(
      /[Bb]annière/,
    );
  });

  it('clears the column on null, so « Supprimer » needs no second route', async () => {
    const old = bannerOf(USER, OBJECT);
    uploaded(old);
    const h = harness({ bannerPath: old });

    const me = await h.service.setBanner(USER, { path: null });

    expect(h.repairerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannerPath: null } }),
    );
    expect(me.repairer?.bannerUrl).toBeNull();
  });

  it('deletes the previous object when the banner is replaced', async () => {
    const old = bannerOf(USER, OBJECT);
    const next = `banners/${USER}/${SECOND}.png`;
    uploaded(old, next);

    await harness({ bannerPath: old }).service.setBanner(USER, { path: next });

    const names = (await storageGateway().listPrefix(`banners/${USER}`)).map((o) => o.name);
    expect(names).toEqual([`${SECOND}.png`]);
  });

  /**
   * The abandoned upload, the leak `CF-24` closes for both features. Signing mints a path and
   * creates nothing; if the commit never lands the bytes stay referenced by nothing, and no cron
   * sweeps `banners/`.
   */
  it('sweeps an ORPHAN from an abandoned upload, not just the previous banner', async () => {
    const old = bannerOf(USER, OBJECT);
    const orphan = bannerOf(USER, ORPHAN);
    const next = `banners/${USER}/${SECOND}.png`;
    uploaded(old, orphan, next);

    await harness({ bannerPath: old }).service.setBanner(USER, { path: next });

    const names = (await storageGateway().listPrefix(`banners/${USER}`)).map((o) => o.name);
    expect(names).toEqual([`${SECOND}.png`]);
  });

  it('sweeps the prefix clean when the banner is removed', async () => {
    uploaded(bannerOf(USER, OBJECT), bannerOf(USER, ORPHAN));

    await harness({ bannerPath: bannerOf(USER, OBJECT) }).service.setBanner(USER, { path: null });

    expect(await storageGateway().listPrefix(`banners/${USER}`)).toEqual([]);
  });

  /**
   * 🛑 THE PRUNE IS PREFIX-SCOPED. A sweep written against the caller rather than the prefix would
   * delete his profile photo every time he changed his banner - silently, with no error.
   */
  it('does not touch the caller\'s AVATAR object', async () => {
    const path = bannerOf(USER, OBJECT);
    const avatar = `avatars/${USER}/${SECOND}.jpg`;
    uploaded(path, avatar);

    await harness().service.setBanner(USER, { path });

    expect((await storageGateway().listPrefix(`avatars/${USER}`)).map((o) => o.name)).toEqual([
      `${SECOND}.jpg`,
    ]);
  });

  it('does not touch ANOTHER account\'s banner', async () => {
    const path = bannerOf(USER, OBJECT);
    const theirs = bannerOf(OTHER, SECOND);
    uploaded(path, theirs);

    await harness().service.setBanner(USER, { path });

    expect((await storageGateway().listPrefix(`banners/${OTHER}`)).map((o) => o.name)).toEqual([
      `${SECOND}.jpg`,
    ]);
  });

  /**
   * Order matters and is asserted rather than commented: the column write is the user-visible
   * outcome, so a bucket that refuses the cleanup must leak objects rather than fail the change.
   */
  it('still changes the banner when the prune fails', async () => {
    const old = bannerOf(USER, OBJECT);
    const next = `banners/${USER}/${SECOND}.jpg`;
    uploaded(old, next);

    vi.spyOn(storageGateway(), 'remove').mockRejectedValue(new Error('bucket unreachable'));

    const h = harness({ bannerPath: old });
    const me = await h.service.setBanner(USER, { path: next });

    expect(me.repairer?.bannerUrl).toContain(next);
    expect(h.repairerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannerPath: next } }),
    );
  });

  it('does not call remove when the prefix holds only the committed object', async () => {
    const path = bannerOf(USER, OBJECT);
    uploaded(path);
    const spy = vi.spyOn(storageGateway(), 'remove');

    await harness().service.setBanner(USER, { path });

    expect(spy).not.toHaveBeenCalled();
  });

  it('is a no-op removal when there is nothing to remove', async () => {
    const h = harness({ bannerPath: null });
    const me = await h.service.setBanner(USER, { path: null });
    expect(me.repairer?.bannerUrl).toBeNull();
  });

  /**
   * Clearing must work with no bucket at all: the column is the user-visible state and there is
   * nothing to prune. The SET path refuses in that situation, which is the asymmetry to keep.
   */
  it('still clears the column when storage is unconfigured', async () => {
    delete process.env.STORAGE_DRIVER;
    __resetStorageGateway();

    const h = harness({ bannerPath: bannerOf(USER, OBJECT) });
    await h.service.setBanner(USER, { path: null });

    expect(h.repairerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannerPath: null } }),
    );
  });
});
