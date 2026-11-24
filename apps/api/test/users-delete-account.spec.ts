import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';

/**
 * `CF-47`, the refusals. Deletion is soft - see the design §9 - and these tests pin who
 * is allowed to ask, not what the scrub writes (that is the sibling describe block added
 * by the next task).
 *
 * The escrow rule is the one with teeth: a commande at status PAID whose step has not
 * reached RELEASED is money held against a repair that has not finished, and letting one
 * party evaporate mid-escrow is not a problem to solve later.
 */

const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

type Options = {
  deletedAt?: Date | null;
  /** Commandes the escrow guard will find. */
  blocking?: number;
  role?: string | null;
  activeSuperAdmins?: number;
};

function harness({ deletedAt = null, blocking = 0, role = 'user', activeSuperAdmins = 3 }: Options = {}) {
  const commandeCount = vi.fn().mockResolvedValue(blocking);
  const profileFindFirst = vi.fn().mockResolvedValue({ userId: USER, deletedAt });
  const transaction = vi.fn();
  const userFindUnique = vi.fn().mockResolvedValue({ role });
  const userCount = vi.fn().mockResolvedValue(activeSuperAdmins);
  const userUpdate = vi.fn().mockResolvedValue({});

  const prisma = {
    profile: { findFirst: profileFindFirst },
    commande: { count: commandeCount },
    identityVerification: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: transaction.mockImplementation((fn: (tx: unknown) => Promise<void>) =>
      fn({
        user: {
          findUnique: userFindUnique,
          count: userCount,
          update: userUpdate,
        },
        profile: { update: vi.fn().mockResolvedValue({}) },
        repairerProfile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        account: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        verificationAttempt: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        favoriteRepairer: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        favoriteDemande: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        repairerCategory: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        repairerAvailability: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        // B16. The deletion releases what was assigned to the user.
        dispute: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        conversationReport: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        // CF4-25 closeQuoteRequestsOfDeletedUser.
        demande: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        offer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
  };

  const geocode = { lookup: vi.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    geocode as unknown as GeocodeService,
  );
  return { service, commandeCount, transaction, userCount };
}

describe('UsersService.deleteAccount - refusals', () => {
  it('refuses with CONFLICT while a PAID commande has not reached RELEASED', async () => {
    const { service, transaction } = harness({ blocking: 1 });

    await expect(service.deleteAccount(USER)).rejects.toBeInstanceOf(AppException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('names the reason in French rather than leaving the user guessing', async () => {
    const { service } = harness({ blocking: 2 });

    await expect(service.deleteAccount(USER)).rejects.toThrowError(/réparation en cours/i);
  });

  it('counts commandes on BOTH sides - as client and as réparateur', async () => {
    const { service, commandeCount } = harness({ blocking: 0 });

    await service.deleteAccount(USER);

    const where = commandeCount.mock.calls[0]![0].where;
    expect(where.status).toBe('PAID');
    expect(where.step).toEqual({ not: 'RELEASED' });
    expect(where.OR).toEqual([{ clientUserId: USER }, { repairerUserId: USER }]);
  });

  it('is idempotent: an already-deleted profile returns without writing', async () => {
    const { service, transaction } = harness({ deletedAt: new Date('2026-08-01') });

    await expect(service.deleteAccount(USER)).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('proceeds when nothing is in escrow', async () => {
    const { service, transaction } = harness({ blocking: 0 });

    await service.deleteAccount(USER);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses deletion of a Super Admin with CONFLICT when active Super Admins <= 2 (CF5-01)', async () => {
    const { service, userCount } = harness({ role: 'super_admin', activeSuperAdmins: 2 });

    await expect(service.deleteAccount(USER)).rejects.toThrowError(/au moins 2 Super Admins/i);
    expect(userCount).toHaveBeenCalledWith({ where: { role: 'super_admin', profile: { deletedAt: null } } });
  });

  it('allows deletion of a Super Admin when more than 2 active Super Admins exist (CF5-01)', async () => {
    const { service, transaction, userCount } = harness({ role: 'super_admin', activeSuperAdmins: 3 });

    await expect(service.deleteAccount(USER)).resolves.toBeUndefined();
    expect(userCount).toHaveBeenCalledWith({ where: { role: 'super_admin', profile: { deletedAt: null } } });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

type Writes = {
  user: ReturnType<typeof vi.fn>;
  profile: ReturnType<typeof vi.fn>;
  repairerProfile: ReturnType<typeof vi.fn>;
  session: ReturnType<typeof vi.fn>;
  account: ReturnType<typeof vi.fn>;
  verificationAttempt: ReturnType<typeof vi.fn>;
  favoriteRepairer: ReturnType<typeof vi.fn>;
  favoriteDemande: ReturnType<typeof vi.fn>;
  repairerCategory: ReturnType<typeof vi.fn>;
  repairerAvailability: ReturnType<typeof vi.fn>;
};

type IdentityStub = {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
};

function scrubHarnessWith(identity?: IdentityStub, role = 'user', activeSuperAdmins = 3) {
  const writes: Writes = {
    user: vi.fn().mockResolvedValue({}),
    profile: vi.fn().mockResolvedValue({}),
    repairerProfile: vi.fn().mockResolvedValue({ count: 1 }),
    session: vi.fn().mockResolvedValue({ count: 3 }),
    account: vi.fn().mockResolvedValue({ count: 1 }),
    verificationAttempt: vi.fn().mockResolvedValue({ count: 5 }),
    favoriteRepairer: vi.fn().mockResolvedValue({ count: 0 }),
    favoriteDemande: vi.fn().mockResolvedValue({ count: 0 }),
    repairerCategory: vi.fn().mockResolvedValue({ count: 0 }),
    repairerAvailability: vi.fn().mockResolvedValue({ count: 0 }),
  };

  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ userId: USER, deletedAt: null }) },
    commande: { count: vi.fn().mockResolvedValue(0) },
    identityVerification: {
      findUnique: identity?.findUnique ?? vi.fn().mockResolvedValue(null),
      update: identity?.update ?? vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
      fn({
        user: {
          findUnique: vi.fn().mockResolvedValue({ role }),
          count: vi.fn().mockResolvedValue(activeSuperAdmins),
          update: writes.user,
        },
        profile: { update: writes.profile },
        repairerProfile: { updateMany: writes.repairerProfile },
        session: { deleteMany: writes.session },
        account: { deleteMany: writes.account },
        verificationAttempt: { deleteMany: writes.verificationAttempt },
        favoriteRepairer: { deleteMany: writes.favoriteRepairer },
        favoriteDemande: { deleteMany: writes.favoriteDemande },
        repairerCategory: { deleteMany: writes.repairerCategory },
        repairerAvailability: { deleteMany: writes.repairerAvailability },
        // B16. The deletion releases what was assigned to the user.
        dispute: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        conversationReport: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        // CF4-25 closeQuoteRequestsOfDeletedUser.
        demande: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        offer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
  };

  const geocode = { lookup: vi.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    geocode as unknown as GeocodeService,
  );
  return { service, writes };
}

function scrubHarness() {
  return scrubHarnessWith();
}

describe('UsersService.deleteAccount - the scrub', () => {
  it('replaces the display name with the tombstone and nulls both legal name fields', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    const data = writes.user.mock.calls[0]![0].data;
    expect(data.name).toBe('Utilisateur supprimé');
    expect(data.firstName).toBeNull();
    expect(data.lastName).toBeNull();
  });

  it('replaces email and username rather than nulling them, since both are NOT NULL', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    const data = writes.user.mock.calls[0]![0].data;
    expect(data.email).toBe(`deleted+${USER}@revime.invalid`);
    expect(data.username).toMatch(/^supprime_[a-z0-9]+$/);
  });

  it('resets user role to "user" so a tombstone never retains staff or admin privileges (CF5-01)', async () => {
    const { service, writes } = scrubHarnessWith(undefined, 'admin');

    await service.deleteAccount(USER);

    const data = writes.user.mock.calls[0]![0].data;
    expect(data.role).toBe('user');
  });

  it('frees the phone number by nulling it', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.user.mock.calls[0]![0].data.phone).toBeNull();
  });

  it('blocks sign-in with the admin plugin ban, and records why', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    const data = writes.user.mock.calls[0]![0].data;
    expect(data.banned).toBe(true);
    expect(data.banReason).toBe('account_deleted');
  });

  it('stamps Profile.deletedAt and clears the avatar path', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    const data = writes.profile.mock.calls[0]![0].data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.avatarPath).toBeNull();
  });

  it('scrubs the réparateur presentation and its geography', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    const data = writes.repairerProfile.mock.calls[0]![0].data;
    expect(data.displayName).toBe('Utilisateur supprimé');
    expect(data.bio).toBeNull();
    expect(data.bannerPath).toBeNull();
    expect(data.postalCode).toBeNull();
    expect(data.serviceAreaLabel).toBeNull();
    expect(data.lat).toBeNull();
    expect(data.lng).toBeNull();
  });

  it('deletes sessions, accounts, and verification attempts', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.session).toHaveBeenCalledTimes(1);
    expect(writes.account).toHaveBeenCalledTimes(1);
    expect(writes.verificationAttempt).toHaveBeenCalledTimes(1);
    for (const fn of [writes.session, writes.account, writes.verificationAttempt]) {
      expect(fn.mock.calls[0]![0].where).toEqual({ userId: USER });
    }
  });

  /**
   * `CF-18`. The scrub must remove favourites in BOTH directions, because `deleteAccount` is a
   * soft delete (`tx.user.update`) and `onDelete: Cascade` therefore never fires.
   *
   * These assert the statements are ISSUED. They cannot prove Postgres honoured them -
   * nothing runnable in this repo can, since there is no test database.
   */
  it('deletes the user\'s own favourite réparateurs AND other people\'s favourites of them', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.favoriteRepairer).toHaveBeenCalledWith({
      where: { OR: [{ userId: USER }, { repairerUserId: USER }] },
    });
  });

  it('deletes the user\'s own favourite annonces, one direction only', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.favoriteDemande).toHaveBeenCalledWith({ where: { userId: USER } });
  });

  it('deletes the réparateur\'s declared categories', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.repairerCategory).toHaveBeenCalledWith({ where: { repairerUserId: USER } });
  });

  it('deletes the réparateur\'s availability schedule', async () => {
    const { service, writes } = scrubHarness();

    await service.deleteAccount(USER);

    expect(writes.repairerAvailability).toHaveBeenCalledWith({ where: { repairerUserId: USER } });
  });
});

describe('UsersService.deleteAccount - the identity erasure hook', () => {
  it('asks for the identity verification to be redacted', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'iv_1', stripeSessionId: 'vs_1', status: 'CANCELED', erasureRequestedAt: null,
    });
    const update = vi.fn().mockResolvedValue({});
    const { service } = scrubHarnessWith({ findUnique, update });

    await service.deleteAccount(USER);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER } }),
    );
    expect(update.mock.calls[0]![0].data.erasureRequestedAt).toBeInstanceOf(Date);
  });

  /**
   * 🛑 THE ORDERING IS THE POINT, AND IT IS WORTH NOTHING UNLESS SOMETHING PROVES IT. The hook
   * runs AFTER the transaction and in a try/catch, for the same reason the storage cleanup in
   * this method does: a third-party call that fails must not roll back an account deletion.
   */
  it('completes the deletion even when the redaction fails', async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error('Stripe is down'));
    const { service, writes } = scrubHarnessWith({ findUnique, update: vi.fn() });

    await expect(service.deleteAccount(USER)).resolves.toBeUndefined();

    expect(writes.user).toHaveBeenCalledTimes(1);
    expect(writes.profile.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  /**
   * A PROCESSING session makes `redactIdentityForUser` throw, by design. The deletion must still
   * complete - and the erasure duty for that user is then discharged only by the « contact Stripe »
   * copy on the deletion screen. That is a real, accepted limitation, recorded here so it is not
   * mistaken for a bug later.
   */
  it('completes the deletion when the session is mid-check and cannot be redacted', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'iv_1', stripeSessionId: 'vs_1', status: 'PROCESSING', erasureRequestedAt: null,
    });
    const { service, writes } = scrubHarnessWith({ findUnique, update: vi.fn() });

    await expect(service.deleteAccount(USER)).resolves.toBeUndefined();

    expect(writes.user).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
