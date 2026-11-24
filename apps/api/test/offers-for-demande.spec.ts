import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * `listForDemande` - the offers a client sees on ONE of his demandes. B2 §5.2/§8.3.
 *
 * 🛑 WHY THIS FILE EXISTS. This read filters no `status` at all (the client asked to keep the
 * withdrawn trail), so the `grep "status: 'SENT'"` that enumerated B2 §5.2's eleven read
 * predicates **structurally could not see it** - a grep-built table missing the one site that
 * does not contain the grepped string. Until B2's fix round it consulted no suspension marker,
 * while « Mes demandes » one screen away had already started filtering its `offerCount`. So the
 * card read « Aucune offre » and this screen read « 1 offre reçue » for the same demande, and the
 * accept → `createCheckout` path was open. `payments-checkout-suspension.spec.ts` covers the
 * money-path half of the same fix.
 *
 * Unit tests with a stubbed Prisma, the standing shape in this suite and for the standing reason:
 * `DATABASE_URL` points at PRODUCTION even locally, so `test:unit` - which excludes the
 * `*.int.spec.ts` files - is the only gate that can ever run on these rules. It proves the
 * service BUILDS the right query; it cannot prove Postgres honours it.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const DEMANDE = '33333333-3333-4333-8333-333333333333';

function harness() {
  // Resolving `[]` is deliberate: it short-circuits `repairerStats` (which returns early on an
  // empty id list) and `present`, so this harness needs no fixture for either and the test is
  // about the WHERE and nothing else.
  const offerFindMany = vi.fn().mockResolvedValue([]);
  const demandeFindFirst = vi.fn().mockResolvedValue({ lat: null, lng: null });
  const prisma = {
    demande: { findFirst: demandeFindFirst },
    offer: { findMany: offerFindMany },
  } as unknown as PrismaService;
  const notifications = {} as unknown as NotificationsService;
  return {
    service: new OffersService(prisma, notifications),
    offerFindMany,
    demandeFindFirst,
  };
}

function whereOf(offerFindMany: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = offerFindMany.mock.calls[0];
  if (!call) throw new Error('expected offer.findMany to have been called');
  return (call[0] as { where: Record<string, unknown> }).where;
}

describe('listForDemande - the suspension clause', () => {
  /**
   * 🛑 THE ASSERTION THIS FILE EXISTS FOR. The clause reaches the marker through
   * `repairer.profile`, never `repairer.repairerProfile` - that relation is OPTIONAL, so Prisma
   * would read a nested filter on it as « the row exists AND the field matches » and silently
   * drop every réparateur without one.
   */
  it('excludes a suspended réparateur through repairer.profile', async () => {
    const h = harness();

    await h.service.listForDemande(CLIENT, DEMANDE);

    expect(whereOf(h.offerFindMany).repairer).toEqual({
      profile: { repairerSuspendedAt: null },
    });
  });

  /**
   * 🛑 DELIBERATELY BROADER THAN `ACCEPTABLE_OFFER_WHERE`, which is why this site spreads
   * `UNSUSPENDED_REPAIRER_WHERE` instead. No `status` clause: a suspended réparateur's offers
   * leave this screen **whatever their status**, including the withdrawn ones. The trail is the
   * client's history of offers he COULD HAVE ACCEPTED, and a suspended réparateur's were never
   * among them.
   *
   * The inverse matters just as much and is the reason this is asserted rather than commented:
   * using `ACCEPTABLE_OFFER_WHERE` here would have added `status: 'SENT'` and silently deleted
   * the withdrawn trail the client explicitly asked for.
   */
  it('still keeps the withdrawn trail, so it filters no status', async () => {
    const h = harness();

    await h.service.listForDemande(CLIENT, DEMANDE);

    const where = whereOf(h.offerFindMany);
    expect(where.status).toBeUndefined();
    // The two clauses that were already there are untouched by the spread.
    expect(where.demandeId).toBe(DEMANDE);
    expect(where.deletedAt).toBeNull();
  });

  /**
   * Ownership is answered BEFORE the offers are read, and the 404 is indistinguishable from a
   * nonexistent id - asserted here because the suspension clause is a sibling of that ordering
   * and a future edit could easily reorder them.
   */
  it('never reads offers when the caller does not own the demande', async () => {
    const h = harness();
    h.demandeFindFirst.mockResolvedValue(null);

    await expect(h.service.listForDemande(CLIENT, DEMANDE)).rejects.toThrow(/introuvable/);
    expect(h.offerFindMany).not.toHaveBeenCalled();
  });
});
