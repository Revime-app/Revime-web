import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DemandeStatus } from '@revime/shared';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { AppException } from '../src/common/app-exception.js';
import {
  FakeStorageGateway,
  __resetStorageGateway,
  storageGateway,
} from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * `CF-17`. `DELETE /demandes/:id` - soft delete with the in-flight checkout guard.
 *
 * Unit tests against a stubbed Prisma, for the same reason `demandes-update.spec.ts` uses: several
 * of these tests assert that something was NOT called (no offer write, no `assertBasicVerified`
 * refusal), which is the behaviour a stub captures directly.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const DEMANDE = '33333333-3333-4333-8333-333333333333';
const CATEGORY = '55555555-5555-4555-8555-555555555555';

const savedEnv = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
});

afterEach(() => {
  process.env = { ...savedEnv };
  __resetStorageGateway();
});

type RowOpts = {
  status?: DemandeStatus;
  /** How many PENDING_PAYMENT commandes exist on this demande. */
  commandeCount?: number;
  /** Live SENT offers, which the delete leaves untouched. */
  offerCount?: number;
};

/**
 * One stored row shaped like `softDelete`'s own query returns it: the scalars it reads for the
 * policy gate, the title for the notification, plus the two counts.
 */
function storedRow({ status = 'OPEN', commandeCount = 0, offerCount = 0 }: RowOpts = {}) {
  return {
    id: DEMANDE,
    status,
    title: 'iPhone 13, écran cassé',
    _count: {
      commandes: commandeCount,
      offers: offerCount,
    },
  };
}

type Row = ReturnType<typeof storedRow>;

type Opts = {
  /** The row the ownership-scoped read answers. `null` is "not yours, or nonexistent". */
  row?: Row | null;
  clientEnabled?: boolean;
  verificationLevel?: string;
  /** Stub for NotificationsService.emit, for the notification tests. */
  notificationsEmit?: Mock;
  /** Stub for prisma.offer.findMany (the BEFORE-write query), for the notification tests. */
  offerFindMany?: Mock;
  /** Stub for prisma.offer.update/updateMany, to pin that offers are NOT touched. */
  offerUpdate?: Mock;
};

function harness({
  row = storedRow(),
  clientEnabled = true,
  verificationLevel = 'BASIC',
  notificationsEmit,
  offerFindMany,
  offerUpdate,
}: Opts = {}) {
  const gateway = storageGateway();
  if (!(gateway instanceof FakeStorageGateway)) {
    throw new Error('expected the FAKE storage gateway - STORAGE_DRIVER leaked into this test');
  }

  const demandeFindFirst = vi.fn().mockResolvedValue(row);
  const demandeUpdate = vi.fn().mockResolvedValue(undefined);

  const prisma = {
    profile: { findFirst: vi.fn().mockResolvedValue({ clientEnabled, verificationLevel }) },
    demande: { findFirst: demandeFindFirst, update: demandeUpdate },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    offer: {
      findMany: offerFindMany ?? vi.fn().mockResolvedValue([]),
      update: offerUpdate ?? vi.fn().mockResolvedValue(undefined),
      updateMany: offerUpdate ?? vi.fn().mockResolvedValue(undefined),
    },
    category: { findFirst: vi.fn().mockResolvedValue({ id: CATEGORY }) },
  } as unknown as PrismaService;

  const geocode = { lookupPostalCode: vi.fn().mockResolvedValue(null) } as unknown as GeocodeService;
  const notifications = { emit: notificationsEmit ?? vi.fn().mockResolvedValue(undefined) };

  return {
    service: new DemandesService(prisma, geocode, notifications as unknown as NotificationsService),
    demandeFindFirst,
    demandeUpdate,
  };
}

/** The rejection itself, so a test can assert on status and copy. */
async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

/** What the client receives in the body. */
function bodyOf(error: AppException): { message: string; fields?: Record<string, string> } {
  return error.getResponse() as { message: string; fields?: Record<string, string> };
}

/** The single argument the write was called with, or a loud failure rather than `undefined`. */
function writeArgs(update: Mock): { where: unknown; data: Record<string, unknown> } {
  const call = update.mock.calls[0];
  if (!call) throw new Error('expected prisma.demande.update to have been called');
  return call[0] as { where: unknown; data: Record<string, unknown> };
}

describe('DemandesService.softDelete', () => {
  it("404s when the demande belongs to someone else", async () => {
    const { service, demandeFindFirst, demandeUpdate } = harness({ row: null });

    const error = await rejection(service.softDelete(ME, DEMANDE));
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).message).toBe('Ressource introuvable.');

    // Ownership is in the WHERE, not a fetch-then-compare, so another author's demande 404s
    // indistinguishably from a nonexistent one and ids stay non-enumerable.
    const call = demandeFindFirst.mock.calls[0];
    if (!call) throw new Error('expected the demande read to have been called');
    expect(call[0].where).toEqual({ id: DEMANDE, authorUserId: ME, deletedAt: null, hiddenAt: null });

    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  /**
   * The second delete must 404, not succeed and re-stamp. `offers.withdraw` records that exact
   * defect: a second withdrawal used to succeed and corrupt history ordering.
   */
  it('404s on a second delete', async () => {
    const { service, demandeUpdate } = harness({ row: null });

    const error = await rejection(service.softDelete(ME, DEMANDE));
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).message).toBe('Ressource introuvable.');

    // findFirst (which filters deletedAt: null) resolves null => NOT_FOUND.
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  it('422s on an IN_PROGRESS demande', async () => {
    const row = storedRow({ status: 'IN_PROGRESS' });
    const { service, demandeUpdate } = harness({ row });

    const error = await rejection(service.softDelete(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe("Cette demande ne peut plus être supprimée.");
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  it('422s on a CANCELLED demande', async () => {
    const row = storedRow({ status: 'CANCELLED' });
    const { service, demandeUpdate } = harness({ row });

    const error = await rejection(service.softDelete(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe("Cette demande ne peut plus être supprimée.");
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  /**
   * 🛑 The load-bearing guard. A demande stays OPEN while the client is on Stripe's hosted
   * page - payment success is what moves it to IN_PROGRESS - so without this, deleting
   * mid-checkout strands a live payment against a demande that no longer exists. Same guard,
   * same condition, as `offers.withdraw`.
   */
  it('422s when a PENDING_PAYMENT commande exists', async () => {
    const row = storedRow({ commandeCount: 1 });
    const { service, demandeUpdate } = harness({ row });

    const error = await rejection(service.softDelete(ME, DEMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe('Un paiement est en cours sur cette demande.');

    // _count.commandes (filtered to PENDING_PAYMENT) = 1 => UNPROCESSABLE_ENTITY.
    expect(demandeUpdate).not.toHaveBeenCalled();
  });

  it('does NOT block on an ABANDONED commande', async () => {
    const row = storedRow({ commandeCount: 0 });
    const { service, demandeUpdate, demandeFindFirst } = harness({ row });

    await service.softDelete(ME, DEMANDE);

    // An abandoned checkout vacates the slot, so this demande is still deletable.
    // => update called with { deletedAt: <Date> }.
    expect(demandeUpdate).toHaveBeenCalledTimes(1);
    const { data } = writeArgs(demandeUpdate);
    expect(data.deletedAt).toBeInstanceOf(Date);

    // 🛑 Assert the _count select filters commandes to PENDING_PAYMENT - without it, an
    // ABANDONED commande on an OPEN demande would block deletion, which is wrong: abandoned
    // checkouts vacate the slot (spec §7 item 5).
    const call = demandeFindFirst.mock.calls[0];
    if (!call) throw new Error('expected demandeFindFirst to have been called');
    expect(call[0].select._count.select.commandes).toEqual({ where: { status: 'PENDING_PAYMENT' } });
  });

  /**
   * 🛑 B2 §5.2. THE GUARD IS FILTERED BY SUSPENSION, AND THAT WAS THE HARD CALL rather than an
   * oversight - so it gets an assertion instead of a comment.
   *
   * This `_count.offers` is the number `demandeEditPolicy(...).canDelete` reads, and it is the
   * SAME predicate `DEMANDE_INCLUDE` renders to the client as `offerCount`. The alternative -
   * hide a suspended réparateur's offer but let it keep blocking - walls the client out of
   * deleting his own demande beside a visible « 0 offre » and no explanation. A count of one
   * above a policy reading zero, or the reverse, is this project's recurring defect; asserting
   * the composed object is the version of « they agree » that cannot drift.
   *
   * `softDelete`'s OWN notification list - the `offer.findMany` it runs just before the write -
   * stays UNFILTERED on purpose, which is what makes the suspension self-healing; the test above
   * asserts that half. (An earlier draft located it by line distance, « eleven lines further on »,
   * which was both wrong and the kind of claim the next comment invalidates.)
   */
  it('the delete guard counts only offers from a réparateur who is not suspended', async () => {
    const row = storedRow();
    const { service, demandeFindFirst } = harness({ row });

    await service.softDelete(ME, DEMANDE);

    const call = demandeFindFirst.mock.calls[0];
    if (!call) throw new Error('expected demandeFindFirst to have been called');
    // Through `repairer.profile`, NOT `repairer.repairerProfile` - the latter is an OPTIONAL
    // to-one relation and Prisma would read a nested filter on it as « the row exists AND the
    // field matches », silently dropping every réparateur without one.
    expect(call[0].select._count.select.offers).toEqual({
      where: {
        status: 'SENT',
        deletedAt: null,
        repairer: { profile: { repairerSuspendedAt: null } },
      },
    });
  });

  it('writes deletedAt and nothing else', async () => {
    const row = storedRow();
    const { service, demandeUpdate } = harness({ row });

    await service.softDelete(ME, DEMANDE);

    // Assert the update `data` has exactly one key: deletedAt.
    const { data } = writeArgs(demandeUpdate);
    expect(Object.keys(data)).toEqual(['deletedAt']);
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('leaves SENT offers untouched', async () => {
    const row = storedRow({ offerCount: 2 });
    const offerUpdate = vi.fn();
    const { service } = harness({ row, offerUpdate });

    await service.softDelete(ME, DEMANDE);

    // prisma.offer.update / updateMany NOT called. Writing WITHDRAWN on a réparateur's
    // behalf was explicitly rejected in CF-D7 part 2.
    expect(offerUpdate).not.toHaveBeenCalled();
  });

  it('emits one DEMANDE_WITHDRAWN per réparateur holding a SENT offer', async () => {
    const REPAIRER_1 = '88888888-8888-4888-8888-888888888888';
    const REPAIRER_2 = '99999999-9999-4999-8999-999999999999';
    const row = storedRow({ offerCount: 2 });
    const notificationsEmit = vi.fn().mockResolvedValue(undefined);
    const offerFindMany = vi.fn().mockResolvedValue([
      { repairerUserId: REPAIRER_1 },
      { repairerUserId: REPAIRER_2 },
    ]);
    const { service, demandeUpdate } = harness({ row, notificationsEmit, offerFindMany });

    await service.softDelete(ME, DEMANDE);

    // Two SENT offers => emit called twice, once per repairerUserId
    expect(notificationsEmit).toHaveBeenCalledTimes(2);

    // First réparateur
    expect(notificationsEmit).toHaveBeenNthCalledWith(1, {
      userId: REPAIRER_1,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'iPhone 13, écran cassé',
      demandeId: DEMANDE,
    });

    // Second réparateur
    expect(notificationsEmit).toHaveBeenNthCalledWith(2, {
      userId: REPAIRER_2,
      mode: 'REPAIRER',
      type: 'DEMANDE_WITHDRAWN',
      actorName: null,
      subject: 'iPhone 13, écran cassé',
      demandeId: DEMANDE,
    });

    // The query scoped to SENT and not soft-deleted - one definition of "live"
    expect(offerFindMany).toHaveBeenCalledTimes(1);
    const call = offerFindMany.mock.calls[0];
    if (!call) throw new Error('expected offerFindMany to have been called');
    expect(call[0].where).toEqual({
      demandeId: DEMANDE,
      status: 'SENT',
      deletedAt: null,
    });

    // The write happens
    expect(demandeUpdate).toHaveBeenCalledTimes(1);
  });

  it('runs no verification gate', async () => {
    // With the verification gate enabled and the profile unverified, delete still succeeds.
    // A user must never be locked out of retracting their own listing - spec §4.2.
    process.env.VERIFICATION_GATE_ENABLED = 'true';
    const row = storedRow();
    const { service, demandeUpdate } = harness({ row, verificationLevel: 'NONE' });

    await service.softDelete(ME, DEMANDE);

    // No FORBIDDEN thrown, the write succeeds
    expect(demandeUpdate).toHaveBeenCalledTimes(1);
    const { data } = writeArgs(demandeUpdate);
    expect(data.deletedAt).toBeInstanceOf(Date);
  });
});
