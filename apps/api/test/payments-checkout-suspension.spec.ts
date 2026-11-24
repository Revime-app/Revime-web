import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

/**
 * `createCheckout`'s suspension guard - B2 §8.3, and the only place the suspension rule touches
 * money.
 *
 * 🛑 WHY A GUARD AND NOT ONLY A READ FILTER. §5.2 removes a suspended réparateur's offers from
 * every read, `listForDemande` included, and that is what the client's screen is built from. But a
 * read filter is not a guard: a client holding a screen loaded BEFORE the suspension, or replaying
 * the request, would otherwise accept and pay a réparateur the platform has just stopped listing.
 * Nothing writes `WITHDRAWN` on suspension - `CF-D7` part 2 refused writing a status on a
 * réparateur's behalf - so `offer.status` is still `SENT` and the existing status check passes.
 * Defence in depth on the money path.
 *
 * 🛑 THE FIXTURE IS THE WHOLE STATE THE GUARD EXISTS FOR: offer `SENT`, demande `OPEN`, réparateur
 * suspended. A fixture failing an earlier check would pass with the guard deleted, which is the
 * way a test like this is usually worthless. The `PARCEL` control below proves the fixture really
 * does reach the guard rather than dying before it.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const OFFER = '33333333-3333-4333-8333-333333333333';
const DEMANDE = '44444444-4444-4444-8444-444444444444';

/** The exact sentence, so a reworded refusal is a failure rather than a silent pass. */
const OFFER_UNAVAILABLE = "Cette offre n'est plus disponible.";
const PARCEL_REFUSED = "Ce réparateur n'accepte pas l'envoi par colis.";

/**
 * `arePaymentsEnabled()` reads five variables and the suite loads `dotenv/config`, so the ambient
 * `.env` decides them unless the test does. All five are set explicitly and restored, following
 * `payments-config.spec.ts` - in particular `STRIPE_SECRET_KEY` must be ABSENT, because a real key
 * beside a non-Stripe driver is a contradiction that turns payments off and would make every test
 * here pass for the wrong reason.
 */
const KEYS = [
  'PAYMENTS_ENABLED',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

type Opts = {
  /** `null` is the ordinary case: not suspended. */
  repairerSuspendedAt?: Date | null;
  status?: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  demandeStatus?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  acceptsParcel?: boolean;
};

function harness({
  repairerSuspendedAt = null,
  status = 'SENT',
  demandeStatus = 'OPEN',
  acceptsParcel = false,
}: Opts = {}) {
  // Shaped exactly like `createCheckout`'s own `select`.
  const offerFindFirst = vi.fn().mockResolvedValue({
    id: OFFER,
    status,
    priceCents: 14500,
    acceptsParcel,
    repairerUserId: REPAIRER,
    demandeId: DEMANDE,
    demande: { status: demandeStatus, author: { email: 'client@example.test' } },
    repairer: { profile: { repairerSuspendedAt } },
  });
  const prisma = {
    offer: { findFirst: offerFindFirst },
  } as unknown as PrismaService;
  const service = new PaymentsService(
    prisma,
    {} as unknown as NotificationsService,
    {} as unknown as ConversationsService,
  );
  return { service, offerFindFirst };
}

/**
 * Asserts BOTH halves of the refusal. `createCheckout` has five refusals reaching
 * `AppException('UNPROCESSABLE_ENTITY', …)`, so `rejects.toThrow()` alone would pass on any of
 * them and would not distinguish the guard from the check above it.
 */
async function refusalOf(run: () => Promise<unknown>): Promise<AppException> {
  try {
    await run();
  } catch (e) {
    if (e instanceof AppException) return e;
    // The harness stubs ONLY what the guarded prefix of `createCheckout` reads - no `commande`
    // delegate and no gateway. So any other error means execution ran past a refusal it should
    // have stopped at, and saying so is worth more than re-throwing a bare
    // `Cannot read properties of undefined (reading 'findFirst')`, which is what deleting the
    // suspension guard actually produces.
    throw new Error(
      `createCheckout ran PAST every refusal it should have stopped at, into the payment path: ${String(e)}`,
      { cause: e },
    );
  }
  throw new Error('expected createCheckout to refuse, but it resolved');
}

describe('createCheckout refuses a suspended réparateur', () => {
  it('refuses a SENT offer on an OPEN demande when the réparateur is suspended', async () => {
    const h = harness({ repairerSuspendedAt: new Date('2026-09-02T10:00:00Z') });

    // `WORKSHOP`, not `PARCEL`: this case must reach the suspension guard without any help from
    // the delivery-mode refusal below it. (`DeliveryMode` is HOME | WORKSHOP | PARCEL - `tsc`
    // refused an invented fourth value here while the stubbed Prisma had passed it happily, which
    // is the standing reason both gates run.)
    const e = await refusalOf(() =>
      h.service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' }),
    );

    expect(e.code).toBe('UNPROCESSABLE_ENTITY');
    expect(e.message).toBe(OFFER_UNAVAILABLE);
  });

  /**
   * 🛑 THE CONTROL THAT MAKES THE TEST ABOVE MEAN SOMETHING. Identical fixture but NOT suspended,
   * and a delivery mode the offer refuses. It reaches `PARCEL_REFUSED`, which sits AFTER the
   * suspension guard - so the fixture demonstrably passes both status checks and arrives at the
   * guard, and the guard is what refuses in the suspended case rather than something earlier.
   */
  it('reaches past the guard when the réparateur is not suspended', async () => {
    const h = harness({ repairerSuspendedAt: null, acceptsParcel: false });

    const e = await refusalOf(() =>
      h.service.createCheckout(CLIENT, OFFER, { delivery: 'PARCEL' }),
    );

    expect(e.message).toBe(PARCEL_REFUSED);
  });

  /**
   * The ordering, asserted rather than commented: suspension is checked BEFORE the delivery mode,
   * so a suspended réparateur is refused for the suspension and not for the parcel. Without this,
   * reordering the two guards would leave both tests above green while the client received a
   * message about parcels.
   */
  it('answers the suspension before the delivery mode', async () => {
    const h = harness({ repairerSuspendedAt: new Date(), acceptsParcel: false });

    const e = await refusalOf(() =>
      h.service.createCheckout(CLIENT, OFFER, { delivery: 'PARCEL' }),
    );

    expect(e.message).toBe(OFFER_UNAVAILABLE);
    expect(e.message).not.toBe(PARCEL_REFUSED);
  });

  /**
   * The guard cannot read what the query does not select. Prisma returns `undefined` for an
   * unselected field and `undefined` is falsy, so a dropped `select` would silently disarm the
   * guard rather than fail loudly - `tsc` is the primary defence (TS2339) and this is the second.
   */
  it('selects the marker it guards on', async () => {
    const h = harness();

    await refusalOf(() => h.service.createCheckout(CLIENT, OFFER, { delivery: 'PARCEL' }));

    const call = h.offerFindFirst.mock.calls[0];
    if (!call) throw new Error('expected offer.findFirst to have been called');
    const select = (call[0] as { select: Record<string, unknown> }).select;
    expect(select.repairer).toEqual({
      select: {
        profile: {
          select: {
            verificationLevel: true,
            repairerSuspendedAt: true,
          },
        },
      },
    });
  });
});
