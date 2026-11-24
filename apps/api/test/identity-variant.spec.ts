import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/identity/identity.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeIdentityGateway, identityGateway, __resetIdentityGateway } from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

/**
 * 🛑 THE THREE OPTIONAL FIELDS ARE OPTIONAL ON PURPOSE, and the reason is the opposite of laziness.
 *
 * `start()`'s own `findUnique` selects only the four required ones, so a row without the other
 * three is the FAITHFUL fixture for every test that does not care about them. The three exist here
 * because two tests below need to put a value on the row that `start()` must be shown either to
 * ignore (`lastErrorCode`) or to overwrite (`erasureRequestedAt`, `redactionStatus`).
 */
type Row = {
  stripeSessionId: string;
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  variant: 'DOCUMENT_AND_SELFIE' | 'DOCUMENT_ONLY';
  selfieFraudSignalAt: Date | null;
  lastErrorCode?: string | null;
  erasureRequestedAt?: Date | null;
  redactionStatus?: 'PROCESSING' | 'VALIDATED' | 'REDACTED' | null;
} | null;

type ContactState = { emailVerified: boolean; phoneVerifiedAt: Date | null };
type ProfileLevel = 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
const BOTH_VERIFIED: ContactState = { emailVerified: true, phoneVerifiedAt: new Date() };

/**
 * `level` defaults to BASIC because every test in this file is about an ELIGIBLE account:
 * since `CF-D1` (2026-09-04) `start()` asks the profile's level, not the two contact columns,
 * so an eligible fixture needs a level. `user` is kept for the two tests that show the level
 * is the ONLY thing consulted.
 */
function harness(existing: Row = null, opts: { level?: ProfileLevel; user?: ContactState } = {}) {
  const upsert = vi.fn().mockResolvedValue({});
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.user ?? BOTH_VERIFIED),
    },
    profile: {
      findFirst: vi.fn().mockResolvedValue({ verificationLevel: opts.level ?? 'BASIC' }),
      // CF4-01: start() may call promoteToBasicIfEligible for a NONE account.
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    identityVerification: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert,
    },
  };
  const service = new IdentityService(prisma as unknown as PrismaService, { emit: vi.fn() } as never);
  return { service, upsert, gateway: identityGateway() as FakeIdentityGateway };
}

beforeEach(() => {
  __resetIdentityGateway();
  /**
   * `isConnectEnabled()` in `connect/config.ts` fails safe on FIVE conditions, not three, and two
   * of them are about coherence rather than presence. Read it before changing this block.
   *
   * 🛑 `STRIPE_SECRET_KEY` MUST BE DELETED, and forgetting it is not a subtle failure - the fifth
   * guard returns false when a key is present while `STRIPE_DRIVER !== 'stripe'` (live credentials
   * beside the fake gateway), so every test here would fail with « La vérification d'identité
   * n'est pas encore disponible. » `apps/api/.env` really does carry a Stripe test key, so this is
   * the normal local state rather than a hypothetical.
   *
   * Deleting both also makes `identityGateway()` choose `FakeIdentityGateway`, which is what these
   * tests assert against - so the two decisions are consistent rather than coincidental.
   */
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'https://api.example.test';
  delete process.env.STRIPE_DRIVER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe('IdentityService.start - the variant', () => {
  it('returns sessionId, ephemeralKeySecret, and url on successful start', async () => {
    const { service } = harness(null);
    const response = await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });
    expect(response.sessionId).toMatch(/^vs_fake_/);
    expect(response.ephemeralKeySecret).toMatch(/^ek_fake_secret_/);
    expect(response.url).toContain('fake_identity=');
  });

  it('hands Stripe require_matching_selfie for the default variant', async () => {
    const { service, gateway } = harness(null);

    await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

    expect(gateway.createCalls).toHaveLength(1);
    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_AND_SELFIE');
  });

  it('asks for a document-only session when that variant is requested', async () => {
    const { service, gateway } = harness(null);

    await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_ONLY');
  });

  it('records the variant on the row, so a later request can tell whether it changed', async () => {
    const { service, upsert } = harness(null);

    await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    expect(upsert.mock.calls[0]![0].create.variant).toBe('DOCUMENT_ONLY');
    expect(upsert.mock.calls[0]![0].update.variant).toBe('DOCUMENT_ONLY');

    /**
     * 🛑 AND THE UPSERT MUST NOT TOUCH `selfieFraudSignalAt`. Until this line only a comment said
     * so, and the clearing path is REACHABLE: a fraud-signalled user asking for
     * DOCUMENT_AND_SELFIE whose stored session is spent (no hosted URL, or CANCELED) falls past the
     * refusals and the resume into create + upsert. Writing `selfieFraudSignalAt: null` there would
     * clear his own signal and reopen the document-only route - the spec's §6.1 laundering hole by
     * a second door, which is the entire justification for the column existing.
     *
     * Asserted as ABSENCE rather than as a null check, because the property is that the field is
     * never written here at all, by any value.
     */
    expect(upsert.mock.calls[0]![0].update).not.toHaveProperty('selfieFraudSignalAt');
    expect(upsert.mock.calls[0]![0].create).not.toHaveProperty('selfieFraudSignalAt');
  });
});

describe('IdentityService.start - the fraud refusal', () => {
  it('refuses document-only once a selfie fraud signal has been recorded, before any Stripe call', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: new Date('2026-09-01'),
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toBeInstanceOf(
      AppException,
    );

    /**
     * 🛑 THE NEGATIVE ASSERTIONS PIN THE OTHER HALF OF THE RULE. « AFTER the VERIFIED and
     * PROCESSING refusals » is pinned by the two precedence tests below; « BEFORE the resume path,
     * because the point is to refuse before any Stripe call happens » is pinned only here.
     *
     * Without them the refusal could sit AFTER the resume block and every assertion in this
     * describe would still pass - a DOCUMENT_ONLY request would then cancel the old session (a
     * Stripe call) and only then refuse, which is a Stripe round trip made on behalf of a request
     * we were always going to reject.
     */
    expect(gateway.cancelCalls).toHaveLength(0);
    expect(gateway.createCalls).toHaveLength(0);
  });

  it('names the rule in French and offers nothing, because there is no support channel', async () => {
    const { service } = harness({
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: new Date('2026-09-01'),
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toThrowError(
      /reconnaissance faciale est nécessaire/i,
    );
  });

  /**
   * The signal blocks the ALTERNATIVE, not verification itself. A user who failed a face match
   * must still be able to try again properly, or the fraud rule becomes a permanent lockout.
   */
  it('still allows the SELFIE variant after a fraud signal', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: new Date('2026-09-01'),
    });
    gateway.seed({
      id: 'vs_1',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/retry',
      lastErrorCode: 'selfie_face_mismatch',
      redactionStatus: null,
    });

    // 🛑 ASSERT THE SUCCESS, NOT A REJECTION. An earlier draft of this test asserted
    // `rejects.toThrow()` and passed for the wrong reason entirely - the fake did not hold
    // `vs_1`, so `retrieveSession` rejected and the fraud rule was never exercised at all. A test
    // that passes whether or not the code is right is worse than no test.
    const { url } = await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

    expect(url).toBe('https://verify.stripe.com/start/retry');
    expect(gateway.cancelCalls).toHaveLength(0);
  });

  /**
   * 🛑 THE POSITIVE HALF OF « READS `selfieFraudSignalAt`, NEVER `lastErrorCode` », and until this
   * test that property was pinned only by ABSENCE. The `Row` type above omitted `lastErrorCode`
   * entirely, so a regression to reading the error code would have read `undefined`, matched
   * nothing in `SELFIE_FRAUD_CODES`, and left every test in this file green. Putting the fraud CODE
   * on a row with NO signal is what makes that regression fail here.
   *
   * The state is real, not contrived. It is what the row looks like between the failed check and
   * the webhook that stamps the signal - and, more importantly, it is what a redacted row looks
   * like in reverse: `lastErrorCode` may be replaced by a placeholder while `selfieFraudSignalAt`
   * survives, which is the entire justification for the column. See `error-codes.ts` and the
   * spec's §6.1.
   */
  it('allows document-only when the fraud CODE is on the row but no signal has been stamped', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
      lastErrorCode: 'selfie_face_mismatch',
    });
    // Seeded so the variant-change cancel RESOLVES. Not strictly required - the cancel is
    // best-effort - but an unseeded id makes the fake reject and emits a `console.warn`, which is
    // noise this test is not about.
    gateway.seed({
      id: 'vs_1',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/retry',
      lastErrorCode: 'selfie_face_mismatch',
      redactionStatus: null,
    });

    // 🛑 ASSERT THE SUCCESS, NOT A REJECTION - the same trap the SELFIE-variant test above records.
    const { url } = await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    expect(url).toContain('fake_identity=');
    expect(gateway.createCalls).toHaveLength(1);
    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_ONLY');
  });

  it('is outranked by ALREADY_VERIFIED - a verified user needs no alternative', async () => {
    const { service } = harness({
      stripeSessionId: 'vs_1',
      status: 'VERIFIED',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: new Date('2026-09-01'),
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toThrowError(
      /déjà vérifiée/i,
    );
  });

  /**
   * The SECOND half of « both of those answers outrank this one », and it was untested. Only the
   * VERIFIED precedence had a test, so moving the fraud refusal one line up - above the PROCESSING
   * refusal but below the VERIFIED one - would have kept the whole file green while telling a user
   * mid-check to go and do a face scan he cannot start, instead of telling him to wait.
   */
  it('is outranked by the PROCESSING refusal - a processing user must wait, not switch', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_1',
      status: 'PROCESSING',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: new Date('2026-09-01'),
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toThrowError(
      /Vérification en cours/i,
    );
    expect(gateway.cancelCalls).toHaveLength(0);
    expect(gateway.createCalls).toHaveLength(0);
  });
});

describe('IdentityService.start - a variant change cannot resume', () => {
  /**
   * 🛑 TWO TESTS COVER THE `else` BRANCH AND BOTH ARE NECESSARY. DO NOT MERGE THEM.
   *
   * They differ by ONE line - whether `vs_old` is seeded into the fake - and that line decides
   * which half of a best-effort call is exercised:
   *
   *   seeded   → `cancelSession` RESOLVES. Pins « the old session really is cancelled », which is
   *              the money property: an un-cancelled session's later `verified` webhook finds no
   *              row, because the upsert has repointed `stripeSessionId`, and Stripe billed us for
   *              it anyway.
   *   unseeded → `cancelSession` REJECTS. Pins « a failed cleanup does not block verification »,
   *              which is the `.catch` in `start()`. Deleting that `.catch` leaves the seeded test
   *              green, so only this one can fail for it.
   *
   * One test cannot do both: `cancelCalls` is populated either way, because
   * `FakeIdentityGateway.cancelSession` records the call BEFORE its map lookup. Which is exactly
   * how the first version of the seeded test passed while never once cancelling anything.
   */
  it('cancels the OLD session and creates a new one when the variant changes', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_old',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
    });
    // 🛑 SEEDED SO THE CANCEL SUCCEEDS, AND THAT IS THE POINT OF THE SEED. Without it the fake
    // rejects with « No such fake session: vs_old », the best-effort `.catch` swallows it, and the
    // assertion below still holds - because `FakeIdentityGateway.cancelSession` records the call
    // BEFORE its map lookup. The test would then pass while never once exercising a cancel that
    // worked, which is the whole property the no-resume rule turns on.
    gateway.seed({
      id: 'vs_old',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/old',
      lastErrorCode: null,
      redactionStatus: null,
    });

    await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    expect(gateway.cancelCalls).toEqual(['vs_old']);
    expect(gateway.createCalls).toHaveLength(1);
    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_ONLY');
  });

  it('creates a new session even when cancelling the old one fails, because a failed cleanup must not block verification', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_old',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
    });
    // 🛑 DELIBERATELY NOT SEEDED, WHICH IS THIS TEST'S ENTIRE SETUP. An unseeded id makes the
    // fake's `cancelSession` reject, which is the only way to reach `start()`'s `.catch` from here.
    // Do not "fix" the missing seed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    // The attempt is asserted as well as the outcome. Without this line the test would pass even if
    // the `else` branch never ran at all - creating is what an unchanged variant does too - so it
    // would no longer be about a FAILED cancel.
    expect(gateway.cancelCalls).toEqual(['vs_old']);
    expect(gateway.createCalls).toHaveLength(1);
    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_ONLY');

    // « A failure is logged so the orphan is discoverable » is half of the best-effort design, and
    // the id is what makes it discoverable, so the id is what is asserted rather than the wording.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('vs_old');

    warn.mockRestore();
  });

  /**
   * 🛑 THE VARIANT-CHANGE BRANCH MUST RE-CHECK STRIPE, NOT THE ROW. Added 2026-09-02, and it
   * closes a defect the spec's §4.4 rule 3 actively justified: « the guards above are what make
   * this call safe by construction » is FALSE, because those guards read `existing.status` and the
   * row is written only by the webhook.
   *
   * The state below is the ordinary one, not a contrived one - he submitted his document seconds
   * ago and the webhook has not landed yet, which is the same window the SAME-variant branch's own
   * live re-check exists for. With no live check here, `cancelSession` is illegal, the best-effort
   * `.catch` swallows the refusal, `createSession` mints a SECOND BILLED session, and the upsert
   * repoints `stripeSessionId` away from the one Stripe is about to verify - whose `verified`
   * webhook then finds no row and returns quietly. A passed, billed verification thrown away.
   *
   * Both assertions are negative and both are needed: `createCalls` 0 is « we did not double-bill »,
   * `cancelCalls` 0 is « we did not make an illegal call ». Proven to fail: deleting the
   * `live?.status === 'PROCESSING'` throw gives cancelCalls ['vs_old'] and createCalls 1.
   */
  it('refuses a variant change while STRIPE says processing, even though the ROW still says REQUIRES_INPUT', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_old',
      // 🛑 THE ROW IS STALE ON PURPOSE. If this said PROCESSING the earlier row-based refusal would
      // catch it and the branch under test would never run - the test would pass for the wrong
      // reason, which is this slice's recurring failure.
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
    });
    gateway.seed({
      id: 'vs_old',
      status: 'PROCESSING',
      // A processing session has no hosted URL, which is Stripe's real shape here.
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toThrowError(
      /Vérification en cours/i,
    );

    expect(gateway.createCalls).toHaveLength(0);
    expect(gateway.cancelCalls).toHaveLength(0);
  });

  /**
   * The VERIFIED half of the same re-check. Separate from the test above because the two throws are
   * two lines: deleting only the `VERIFIED` one leaves that test green, and the consequence differs
   * - a verified session cannot be cancelled either, and a second session would ask a réparateur
   * who has already passed for his passport again and bill us for it.
   */
  it('refuses a variant change while STRIPE says verified, even though the ROW still says REQUIRES_INPUT', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_old',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
    });
    gateway.seed({
      id: 'vs_old',
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_ONLY' })).rejects.toThrowError(
      /déjà vérifiée/i,
    );

    expect(gateway.createCalls).toHaveLength(0);
    expect(gateway.cancelCalls).toHaveLength(0);
  });

  /**
   * 🛑 THE NEGATIVE ASSERTION IS THE POINT OF THIS TEST. « We did not double-bill » is the
   * property; not calling create is how it is observable. An unchanged variant must resume the
   * existing session, because every created session is BILLED.
   */
  it('resumes an unchanged variant, calling neither cancel nor create', async () => {
    const { service, gateway } = harness({
      stripeSessionId: 'vs_live',
      status: 'REQUIRES_INPUT',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
    });
    // The fake must hold the session the row names, or `retrieveSession` rejects and the resume
    // path is never exercised.
    gateway.seed({
      id: 'vs_live',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/live',
      lastErrorCode: null,
      redactionStatus: null,
    });

    const response = await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

    expect(response.sessionId).toBe('vs_live');
    expect(response.ephemeralKeySecret).toMatch(/^ek_fake_secret_/);
    expect(response.url).toBe('https://verify.stripe.com/start/live');
    expect(gateway.cancelCalls).toHaveLength(0);
    expect(gateway.createCalls).toHaveLength(0);
  });
});

describe('IdentityService.start - repointing the row clears the PER-SESSION fields', () => {
  /**
   * 🛑 THE SILENT ARTICLE 17 FAILURE THIS PINS, and it was a defect in the DESIGN rather than in
   * any implementation. `IdentityVerification` is keyed per USER and repointed at every new
   * session, so: the user erases a REQUIRES_INPUT session → the redaction CANCELS it and the row
   * carries `erasureRequestedAt` plus `redactionStatus` → he decides to verify after all → the
   * upsert below repoints `stripeSessionId` at a fresh BILLED session. If the two erasure fields
   * survive that repoint, the webhook carries the row to VERIFIED still wearing the old stamp, and
   * `redactIdentityForUser`'s idempotence guard answers a genuine second erasure request against
   * the NEW document with an early return, having redacted nothing. The screen meanwhile renders a
   * `redactionStatus` belonging to a session no longer on the row. See the spec's §5.2.
   *
   * 🛑 WHAT MAKES THIS TEST FAIL IS THE UPSERT, NOT THE ROW'S VALUES. `start()`'s `findUnique`
   * select does not read `erasureRequestedAt` or `redactionStatus` at all, so the two writes are
   * unconditional and the non-null values below are the SCENARIO rather than the input. They are
   * set anyway, so the next reader can see which state is being reproduced - but do not read them
   * as the thing under test. Deleting either `null` from the `update` branch is what breaks this,
   * and both deletions were tried.
   */
  it('clears erasureRequestedAt and redactionStatus, while still never touching selfieFraudSignalAt', async () => {
    const { service, upsert, gateway } = harness({
      stripeSessionId: 'vs_erased',
      status: 'CANCELED',
      variant: 'DOCUMENT_AND_SELFIE',
      selfieFraudSignalAt: null,
      erasureRequestedAt: new Date('2026-09-01T09:00:00.000Z'),
      redactionStatus: 'PROCESSING',
    });
    /**
     * Seeded as a SPENT session - CANCELED with a null URL - because that is precisely what
     * redacting a REQUIRES_INPUT session leaves behind, and it is what carries a SAME-variant
     * request past the resume block into create + upsert. Without the seed `retrieveSession`
     * rejects and `start()` throws before the upsert is ever reached, so the seed is this test's
     * setup rather than decoration.
     */
    gateway.seed({
      id: 'vs_erased',
      status: 'CANCELED',
      url: null,
      lastErrorCode: null,
      redactionStatus: 'PROCESSING',
    });

    await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

    const update = upsert.mock.calls[0]![0].update;
    expect(update.erasureRequestedAt).toBeNull();
    expect(update.redactionStatus).toBeNull();

    /**
     * The CONTRAST is the point of keeping this assertion beside the two above. Both classes of
     * field live in one `update` object, so the only thing separating them is that these two lines
     * exist and a `selfieFraudSignalAt: null` line must not. Writing that one would clear a fraud
     * signal and reopen the document-only route - §6.1's laundering hole by a second door.
     */
    expect(update).not.toHaveProperty('selfieFraudSignalAt');

    // Pins the PREMISE, not the conclusion: the clearing only matters because the row really has
    // been repointed at a different, newly billed session. Without these two lines the test would
    // still pass if `start()` stopped creating anything at all.
    expect(gateway.createCalls).toHaveLength(1);
    expect(update.stripeSessionId).not.toBe('vs_erased');
  });
});

/**
 * `CF-D1`, 2026-09-04: the contact precondition became a LEVEL check. BASIC is now e-mail OR
 * phone (`promote-basic.ts`), and re-reading the two contact columns here would have restated
 * the old AND rule in a second place. `start()` asks the profile's level instead, so the door
 * rule has exactly one owner - and these two tests show the columns are not consulted by start()
 * itself. Since CF4-01 a NONE account is first offered promoteToBasicIfEligible (the owner),
 * so NONE is refused only when that promotion leaves it at NONE.
 */
describe('IdentityService.start - the contact precondition is the BASIC level', () => {
  it('admits an account at BASIC whose e-mail is not verified', async () => {
    const { service, gateway } = harness(null, {
      level: 'BASIC',
      user: { emailVerified: false, phoneVerifiedAt: new Date() },
    });

    await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

    expect(gateway.createCalls).toHaveLength(1);
  });

  it('refuses an account that stays at NONE because its contacts do not qualify for BASIC', async () => {
    // CF4-01: a NONE account is now offered promoteToBasicIfEligible before being refused, so the
    // refusal is pinned on an account the promotion cannot lift (no contact verified). The
    // both-verified NONE case is now ADMITTED - see cf4-01-become-gate.spec.ts.
    const { service, gateway } = harness(null, {
      level: 'NONE',
      user: { emailVerified: false, phoneVerifiedAt: null },
    });

    await expect(service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' })).rejects.toThrowError(
      'Confirmez votre e-mail ou votre téléphone avant de vérifier votre identité.',
    );
    expect(gateway.createCalls).toHaveLength(0);
  });
});
