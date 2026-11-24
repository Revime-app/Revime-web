import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';
import { __resetSignLimit, SIGN_RATE_PER_HOUR } from '../src/storage/sign-limit.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-23`, the API half. Unit tests with a stubbed Prisma and the REAL `FakeStorageGateway`
 * rather than additions to an integration spec, for the standing reason: `DATABASE_URL` points
 * at PRODUCTION even locally and the integration suite writes.
 *
 * No `vi.mock` anywhere. The storage singleton is selected by `STORAGE_DRIVER` and cleared by
 * `__resetStorageGateway`, so the fake can be reached and seeded through the same public surface
 * production uses - which is what makes « the object is gone » and « the bucket is unreachable »
 * testable cases rather than commentary.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';

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
  /** What `Profile.avatarPath` currently holds. */
  avatarPath?: string | null;
  /** Both false is impossible in production, but a réparateur-only account is not. */
  clientEnabled?: boolean;
  repairerEnabled?: boolean;
};

/** Captures what the service wrote, so the column change is asserted rather than assumed. */
type Harness = { service: UsersService; profileUpdate: ReturnType<typeof vi.fn> };

function harness({
  avatarPath = null,
  clientEnabled = true,
  repairerEnabled = false,
}: Opts = {}): Harness {
  let current = avatarPath;
  const profileUpdate = vi.fn().mockImplementation(({ data }: { data: { avatarPath: string | null } }) => {
    current = data.avatarPath;
    return Promise.resolve({ userId: USER, avatarPath: current });
  });

  const prisma = {
    profile: {
      findFirst: vi.fn().mockImplementation(() =>
        Promise.resolve({ clientEnabled, repairerEnabled, avatarPath: current }),
      ),
      findUniqueOrThrow: vi.fn().mockImplementation(() =>
        Promise.resolve({ clientEnabled, repairerEnabled, avatarPath: current }),
      ),
      update: profileUpdate,
    },
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
            clientEnabled,
            repairerEnabled,
            activeMode: 'CLIENT',
            verificationLevel: 'NONE',
            onboardingCompletedAt: null,
            avatarPath: current,
            deletedAt: null,
            notifyOffers: true,
            notifyMessages: true,
            notifyCommandes: true,
          },
          repairerProfile: null,
          repairerCategories: [],
          repairerAvailability: [],
        }),
      ),
    },
  } as unknown as PrismaService;

  return { service: new UsersService(prisma, {} as GeocodeService), profileUpdate };
}

describe('MeResponse.avatarUrl', () => {
  it('is null for an account that has never uploaded one', async () => {
    const me = await harness().service.me(USER);
    expect(me.avatarUrl).toBeNull();
  });

  it('is a signed url once the object is in the bucket', async () => {
    const path = `avatars/${USER}/${OBJECT}.jpg`;
    (storageGateway() as FakeStorageGateway).seed(path);

    const me = await harness({ avatarPath: path }).service.me(USER);
    expect(me.avatarUrl).toBeTruthy();
    expect(me.avatarUrl).toContain(path);
  });

  /**
   * The column outliving its object is a real state, not a hypothetical: `setAvatar` writes the
   * column and deletes the OLD object as two steps, and the bucket can be edited by hand.
   * `createSignedReadUrls` omits a path with no object rather than fabricating a URL, so this
   * asserts the service does not turn that absence into a broken `<Image>`.
   */
  it('is null when the column points at an object that is GONE', async () => {
    const me = await harness({ avatarPath: `avatars/${USER}/${OBJECT}.jpg` }).service.me(USER);
    expect(me.avatarUrl).toBeNull();
  });

  it('is null when storage is not configured at all', async () => {
    delete process.env.STORAGE_DRIVER;
    __resetStorageGateway();

    const me = await harness({ avatarPath: `avatars/${USER}/${OBJECT}.jpg` }).service.me(USER);
    expect(me.avatarUrl).toBeNull();
  });

  it('leaves the OAuth `image` field alone -- the app decides precedence, not the server', async () => {
    const me = await harness().service.me(USER);
    // Both fields exist independently. Collapsing them here would take the choice away from the
    // one screen that renders both.
    expect(me).toHaveProperty('image');
    expect(me).toHaveProperty('avatarUrl');
  });
});

describe('signAvatarUpload', () => {
  it('mints a path under the caller\'s own avatar prefix', async () => {
    const { path, uploadUrl } = await harness().service.signAvatarUpload(USER, {
      contentType: 'image/jpeg',
    });

    expect(path).toMatch(new RegExp(`^avatars/${USER}/[0-9a-f-]{36}\\.jpg$`));
    expect(uploadUrl).toContain(path);
  });

  it('uses the png extension for a png', async () => {
    const { path } = await harness().service.signAvatarUpload(USER, { contentType: 'image/png' });
    expect(path.endsWith('.png')).toBe(true);
  });

  /**
   * 🛑 THE POINT OF THE WHOLE SEPARATE ROUTE. `POST /demandes/photos/sign` calls
   * `assertClientEnabled` and would 422 here. The client asked for avatar editing in the
   * RÉPARATEUR profile, so the one account that must work is exactly the one that route refuses.
   */
  it('serves a réparateur-only account, which the demande signing route refuses', async () => {
    const { path } = await harness({ clientEnabled: false, repairerEnabled: true })
      .service.signAvatarUpload(USER, { contentType: 'image/jpeg' });

    expect(path.startsWith(`avatars/${USER}/`)).toBe(true);
  });

  /**
   * Fails CLOSED rather than handing back a URL no upload can use: a client that PUT its bytes
   * to a fake URL would believe the photo was stored.
   */
  it('refuses when storage is unconfigured rather than returning a dead url', async () => {
    delete process.env.STORAGE_DRIVER;
    __resetStorageGateway();

    await expect(
      harness().service.signAvatarUpload(USER, { contentType: 'image/jpeg' }),
    ).rejects.toThrow(AppException);
  });

  it('shares the demande photo rate limit rather than opening a second unbounded route', async () => {
    const { service } = harness();
    for (let i = 0; i < SIGN_RATE_PER_HOUR; i++) {
      await service.signAvatarUpload(USER, { contentType: 'image/jpeg' });
    }

    await expect(service.signAvatarUpload(USER, { contentType: 'image/jpeg' })).rejects.toThrow(
      /Trop de photos/,
    );
  });
});

describe('setAvatar', () => {
  /** Seeds the bucket the way a completed client-side PUT would. */
  function uploaded(path: string): void {
    (storageGateway() as FakeStorageGateway).seed(path);
  }

  it('writes the column for an object the caller uploaded', async () => {
    const path = `avatars/${USER}/${OBJECT}.jpg`;
    uploaded(path);
    const h = harness();

    const me = await h.service.setAvatar(USER, { path });

    expect(h.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarPath: path } }),
    );
    expect(me.avatarUrl).toContain(path);
  });

  it('refuses another account\'s path even when that object exists', async () => {
    const path = `avatars/${OTHER}/${OBJECT}.jpg`;
    uploaded(path);
    const h = harness();

    await expect(h.service.setAvatar(USER, { path })).rejects.toThrow(AppException);
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  /**
   * A demande photo IS a path this caller owns, so ownership alone would allow it. It must not
   * be allowed: the orphan cron is free to delete an unreferenced demande object after 24h, which
   * would blank the profile photo with no error anywhere.
   */
  it('refuses the caller\'s own demande photo path', async () => {
    const path = `demandes/${USER}/${OBJECT}/${OBJECT}.jpg`;
    uploaded(path);
    const h = harness();

    await expect(h.service.setAvatar(USER, { path })).rejects.toThrow(AppException);
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  /**
   * Signing a URL does not create an object. Without this check a client could name a
   * well-formed path it never uploaded and leave the profile pointing at nothing.
   */
  it('refuses a well-formed path whose object was never uploaded', async () => {
    const h = harness();
    await expect(
      h.service.setAvatar(USER, { path: `avatars/${USER}/${OBJECT}.jpg` }),
    ).rejects.toThrow(AppException);
    expect(h.profileUpdate).not.toHaveBeenCalled();
  });

  it('clears the column on null, so « Supprimer » needs no second route', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    uploaded(old);
    const h = harness({ avatarPath: old });

    const me = await h.service.setAvatar(USER, { path: null });

    expect(h.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarPath: null } }),
    );
    expect(me.avatarUrl).toBeNull();
  });

  /**
   * There is no cron sweeping `avatars/`, so a replacement that left the old object behind would
   * leak one image per change, forever, with nothing to notice.
   */
  it('deletes the PREVIOUS object when the photo is replaced', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    const next = `avatars/${USER}/44444444-4444-4444-8444-444444444444.png`;
    uploaded(old);
    uploaded(next);

    await harness({ avatarPath: old }).service.setAvatar(USER, { path: next });

    const names = (await storageGateway().listPrefix(`avatars/${USER}`)).map((o) => o.name);
    expect(names).toEqual(['44444444-4444-4444-8444-444444444444.png']);
  });

  it('deletes the previous object when the photo is removed', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    uploaded(old);

    await harness({ avatarPath: old }).service.setAvatar(USER, { path: null });

    expect(await storageGateway().listPrefix(`avatars/${USER}`)).toEqual([]);
  });

  /**
   * Order matters and is asserted, not just commented: the column write is the user-visible
   * outcome, so a bucket that refuses the cleanup must leak one object rather than fail the
   * change the user asked for.
   */
  it('still changes the photo when deleting the old object fails', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    const next = `avatars/${USER}/44444444-4444-4444-8444-444444444444.jpg`;
    uploaded(old);
    uploaded(next);

    const gateway = storageGateway();
    vi.spyOn(gateway, 'remove').mockRejectedValue(new Error('bucket unreachable'));

    const h = harness({ avatarPath: old });
    const me = await h.service.setAvatar(USER, { path: next });

    expect(me.avatarUrl).toContain(next);
    expect(h.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarPath: next } }),
    );
  });

  /**
   * 🆕 `CF-24`. THE ABANDONED UPLOAD, and it is a real leak rather than a hypothetical: signing
   * mints a path and creates nothing, the client PUTs its bytes, and if the commit PATCH never
   * lands - a dropped connection, a backgrounded app, a 422 on a second attempt - the object stays
   * in the bucket referenced by nothing. Nothing swept it: the orphan cron is anchored at
   * `demandes`, and the delete here used to name only the PREVIOUSLY COMMITTED path.
   *
   * So the invariant is now stated over the whole prefix rather than over one column value: after
   * any commit, the caller's prefix holds exactly the committed object, or nothing. The listing
   * this asserts against is the SAME one the existence check already fetches, so closing the class
   * costs no extra round trip.
   */
  it('sweeps an ORPHAN from an abandoned upload, not just the previous photo', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    const orphan = `avatars/${USER}/55555555-5555-4555-8555-555555555555.jpg`;
    const next = `avatars/${USER}/44444444-4444-4444-8444-444444444444.png`;
    uploaded(old);
    uploaded(orphan);
    uploaded(next);

    await harness({ avatarPath: old }).service.setAvatar(USER, { path: next });

    const names = (await storageGateway().listPrefix(`avatars/${USER}`)).map((o) => o.name);
    expect(names).toEqual(['44444444-4444-4444-8444-444444444444.png']);
  });

  /** The same invariant on the removal path, which has no committed object to keep. */
  it('sweeps an orphan when the photo is removed', async () => {
    const old = `avatars/${USER}/${OBJECT}.jpg`;
    const orphan = `avatars/${USER}/55555555-5555-4555-8555-555555555555.jpg`;
    uploaded(old);
    uploaded(orphan);

    await harness({ avatarPath: old }).service.setAvatar(USER, { path: null });

    expect(await storageGateway().listPrefix(`avatars/${USER}`)).toEqual([]);
  });

  /**
   * 🛑 THE PRUNE IS PREFIX-SCOPED, AND THIS IS WHAT PROVES IT. A réparateur has objects under
   * `banners/` too (`CF-24`), and a sweep written against the caller rather than against the
   * prefix would delete his fiche-publique banner every time he changed his profile photo - with
   * no error and nothing to notice.
   *
   * 🛑 IT PASSED BEFORE THE PRUNE EXISTED, so it is a regression guard rather than red-green: the
   * old code deleted one named path and could not have reached a banner. It is here because the
   * failure it guards is silent and destructive, and because a prune is precisely the kind of
   * change somebody later "simplifies" into a per-user sweep.
   */
  it('does not touch the caller\'s BANNER object', async () => {
    const path = `avatars/${USER}/${OBJECT}.jpg`;
    const banner = `banners/${USER}/66666666-6666-4666-8666-666666666666.jpg`;
    uploaded(path);
    uploaded(banner);

    await harness({ avatarPath: null }).service.setAvatar(USER, { path });

    expect((await storageGateway().listPrefix(`banners/${USER}`)).map((o) => o.name)).toEqual([
      '66666666-6666-4666-8666-666666666666.jpg',
    ]);
  });

  it('does not call remove when there was no previous photo', async () => {
    const path = `avatars/${USER}/${OBJECT}.jpg`;
    uploaded(path);
    const removeSpy = vi.spyOn(storageGateway(), 'remove');

    await harness({ avatarPath: null }).service.setAvatar(USER, { path });

    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('is a no-op removal when there is nothing to remove', async () => {
    const h = harness({ avatarPath: null });
    const me = await h.service.setAvatar(USER, { path: null });
    expect(me.avatarUrl).toBeNull();
  });
});
