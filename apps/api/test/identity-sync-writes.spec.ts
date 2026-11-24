import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/identity/identity.service.js';
import {
  FakeIdentityGateway,
  identityGateway,
  __resetIdentityGateway,
} from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * `syncSession`'s two NEW writes: the `selfieFraudSignalAt` stamp and the `redactionStatus` mirror.
 *
 * 🛑 WHY THIS FILE EXISTS AT ALL. Every webhook path through `syncSession` was covered only by
 * `identity.int.spec.ts`, which `test:unit` EXCLUDES and which writes to the PRODUCTION database -
 * so it is run by NO gate, and the design spec's §8.2 coverage list does not mention `syncSession`
 * either. That left the stamp's « once and never again » rule resting on a comment. It is a FRAUD
 * CONTROL, and `start()`'s document-only refusal is its only consumer, so a stamp that re-fires or
 * never fires decides whether a user who failed a face match can route around the check that caught
 * him.
 *
 * It is deliberately NOT a test of the row `select` - see the long note on the second test for
 * which half `tsc` already owns and why an assertion on the `select` argument was removed.
 */

const SESSION = 'vs_sync_1';
const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

type SyncRow = {
  id: string;
  userId: string;
  verifiedAt: Date | null;
  selfieFraudSignalAt: Date | null;
  status?: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  lastErrorCode?: string | null;
};

function harness(row: SyncRow) {
  const update = vi.fn().mockResolvedValue({});
  /**
   * CF4-42: the `verifiedAt` stamp is a CONDITIONAL write (`where verifiedAt IS NULL`), and only
   * the call that actually stamped (count 1) may notify. This mock models the database row:
   * the first stamp wins, every later one finds `verifiedAt` already set and gets count 0.
   */
  let stamped = row.verifiedAt !== null;
  const updateMany = vi.fn().mockImplementation(async () => {
    if (stamped) return { count: 0 };
    stamped = true;
    return { count: 1 };
  });
  /**
   * ONE mock serves two callers: `syncSession`'s lookup by `stripeSessionId` and
   * `promoteFromIdentityIfEligible`'s by `userId`. Both are satisfied by this row, and the
   * promotion returns early on a null `verifiedAt` - which keeps this file about the writes rather
   * than about the level grant, which `promote-identity` already owns.
   */
  const findUnique = vi.fn().mockResolvedValue(row);
  const emit = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    identityVerification: { findUnique, update, updateMany },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new IdentityService(prisma as unknown as PrismaService, { emit } as never);
  return { service, update, updateMany, emit, gateway: identityGateway() as FakeIdentityGateway };
}

/**
 * `syncSession` is private. Reaching it through `handleWebhook` would mean building a real signed
 * Stripe payload and mocking the event-claim table, for a property that has nothing to do with
 * signatures or claims. The cast names exactly ONE method rather than widening the whole instance
 * to `any`, so a rename still breaks this line.
 */
const sync = (service: IdentityService, stripeSessionId: string): Promise<void> =>
  (service as unknown as { syncSession(id: string): Promise<void> }).syncSession(stripeSessionId);

beforeEach(() => {
  __resetIdentityGateway();
  // Both must be unset for `identityGateway()` to choose the fake. `apps/api/.env` really does
  // carry a Stripe test key, so this is the normal local state rather than a hypothetical - and a
  // real key here would make this file reach Stripe.
  delete process.env.STRIPE_DRIVER;
  delete process.env.STRIPE_SECRET_KEY;
});

/** The row as it is before any signal has been recorded. */
const freshRow: SyncRow = {
  id: 'row_1',
  userId: USER,
  verifiedAt: null,
  selfieFraudSignalAt: null,
  status: 'PROCESSING',
  lastErrorCode: null,
};

describe('syncSession - the selfieFraudSignalAt stamp', () => {
  it('stamps the signal the first time a selfie FRAUD code lands', async () => {
    const { service, update, gateway } = harness(freshRow);
    gateway.seed({
      id: SESSION,
      status: 'REQUIRES_INPUT',
      url: null,
      lastErrorCode: 'selfie_face_mismatch',
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(update.mock.calls[0]![0].data.selfieFraudSignalAt).toBeInstanceOf(Date);
  });

  /**
   * 🛑 THIS IS THE TEST THAT CARRIES THE `select`'s OTHER HALF, and the division of labour was
   * MEASURED on 2026-09-02 rather than assumed - an earlier draft of this file added a test
   * asserting the `select` argument itself, and it was removed as redundant once both probes ran:
   *
   *   drop `selfieFraudSignalAt: true` from the select → **`tsc` fails** (TS2339). Prisma narrows
   *     the row to the selected keys, so the read below does not compile. No test needed, and a
   *     mocked `findUnique` could not have caught it anyway: mocks ignore `select` and return the
   *     whole fixture, so all of these stayed green.
   *   drop the `row.selfieFraudSignalAt === null` guard → **types pass** and this test fails. It is
   *     the only thing standing between us and a re-stamp on every delivery.
   *
   * Note the failure directions are opposite, and the intuitive guess is the wrong one: an
   * unselected field arrives as `undefined`, and `undefined === null` is false, so a missing select
   * would make the stamp never fire at all rather than fire every time.
   */
  it('never overwrites a signal the row already carries', async () => {
    const { service, update, gateway } = harness({
      ...freshRow,
      selfieFraudSignalAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    gateway.seed({
      id: SESSION,
      status: 'REQUIRES_INPUT',
      url: null,
      lastErrorCode: 'selfie_manipulated',
      redactionStatus: null,
    });

    await sync(service, SESSION);

    /**
     * ABSENCE, not an equality check on the old date. « Stamped once and NEVER cleared » is a
     * property about the field not being WRITTEN here at all - an equality assertion would pass
     * just as well if the code re-wrote the same value it read, which is a different behaviour
     * that happens to look identical from one row.
     */
    expect(update.mock.calls[0]![0].data).not.toHaveProperty('selfieFraudSignalAt');
  });

  it('does not stamp for a failure that is not a fraud signal', async () => {
    const { service, update, gateway } = harness(freshRow);
    // `consent_declined` is the code the alternative is RECOMMENDED for. Stamping on it would
    // refuse the document-only route to precisely the user it exists for.
    gateway.seed({
      id: SESSION,
      status: 'REQUIRES_INPUT',
      url: null,
      lastErrorCode: 'consent_declined',
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(update.mock.calls[0]![0].data).not.toHaveProperty('selfieFraudSignalAt');
  });
});

describe('syncSession - the redactionStatus mirror', () => {
  it("copies Stripe's redaction progress onto the row", async () => {
    const { service, update, gateway } = harness(freshRow);
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: 'REDACTED',
    });

    await sync(service, SESSION);

    // A redaction takes up to four days, so this webhook is the only thing that moves the row from
    // PROCESSING to REDACTED - `redactIdentityForUser` writes only the initial value.
    expect(update.mock.calls[0]![0].data.redactionStatus).toBe('REDACTED');
  });

  /**
   * 🛑 A NULL MUST NOT BE WRITTEN, and the reason is `summariseRedaction`'s deliberate
   * null-degradation rather than anything about this row. That helper returns `null` for any
   * redaction status it does not recognise - correctly, because a screen's wording must not make
   * Stripe retry for three days - so an unconditional write would carry a row from REDACTED back to
   * « nothing has been redacted » the first time Stripe ships a fourth value. On a GDPR screen that
   * is a false statement about an Article 17 request.
   *
   * Asserted as ABSENCE from the `data` object, not as a null check, because the property is that
   * the field is not written here AT ALL when there is nothing to say. Probed by making the write
   * unconditional again, which fails exactly this test and nothing else.
   *
   * Note the seed is the ORDINARY case, not an exotic one: every session that has never been
   * redacted reports null, so this path runs on essentially every identity webhook we receive.
   */
  it('does not write redactionStatus at all when Stripe reports none', async () => {
    const { service, update, gateway } = harness(freshRow);
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(update.mock.calls[0]![0].data).not.toHaveProperty('redactionStatus');
    // The rest of the write still happens - this is a suppressed FIELD, not a suppressed update.
    expect(update.mock.calls[0]![0].data.status).toBe('VERIFIED');
  });
});

describe('syncSession - identity notifications (CF4-E §3, Controller Ruling R3)', () => {
  it('emits IDENTITY_VERIFIED once, on the first sync that verifies the session', async () => {
    const { service, emit, gateway } = harness({ ...freshRow, status: 'PROCESSING', lastErrorCode: null });
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      userId: USER,
      mode: 'REPAIRER',
      type: 'IDENTITY_VERIFIED',
    });
  });

  it('does not re-emit on a redelivery once the stored row is already stamped verified', async () => {
    const { service, emit, gateway } = harness({
      ...freshRow,
      verifiedAt: new Date('2026-09-01T00:00:00.000Z'),
      status: 'VERIFIED',
      lastErrorCode: null,
    });
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(emit).not.toHaveBeenCalled();
  });
});

describe('syncSession - CF4-42, concurrent webhooks for one verification', () => {
  /**
   * Observed in production 2026-10-01: one Stripe Identity verification produced TWO
   * IDENTITY_VERIFIED notifications, 0.8 s apart. Stripe sends several events for one session
   * (distinct event ids, so `claimStripeEvent` does not dedupe them); two ran concurrently, both
   * read `verifiedAt = null` before either wrote, and both emitted. The pre-update read alone
   * cannot decide « first »; only the conditional stamp can.
   */
  it('emits IDENTITY_VERIFIED once when two syncs of the same verified session race', async () => {
    const { service, emit, gateway } = harness({ ...freshRow, status: 'PROCESSING', lastErrorCode: null });
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await Promise.all([sync(service, SESSION), sync(service, SESSION)]);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ userId: USER, mode: 'REPAIRER', type: 'IDENTITY_VERIFIED' });
  });

  it('stamps verifiedAt with a conditional write guarded on verifiedAt IS NULL', async () => {
    const { service, updateMany, gateway } = harness({ ...freshRow, status: 'PROCESSING', lastErrorCode: null });
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 'row_1', verifiedAt: null });
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
  });

  it('does not notify when the conditional stamp finds verifiedAt already set', async () => {
    const { service, emit, updateMany, gateway } = harness({ ...freshRow, status: 'PROCESSING', lastErrorCode: null });
    // The other webhook stamped between our read and our write.
    updateMany.mockResolvedValueOnce({ count: 0 });
    gateway.seed({
      id: SESSION,
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await sync(service, SESSION);

    expect(emit).not.toHaveBeenCalled();
  });
});
