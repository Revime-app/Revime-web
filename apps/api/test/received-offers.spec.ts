import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * `CF-11`, the API half. `GET /offers/received` - every offer the CLIENT has been sent, across
 * all of their demandes, for the « Mes offres reçues » rubrique in his mockup `01`.
 *
 * It mirrors `listMine` with the ownership flipped, and the mirror is the point: `listMine`
 * answers « offers I sent » from `repairerUserId`, this answers « offers I received » from
 * `demande.authorUserId`. Nothing about blind bidding changes - `listForDemande` is already
 * author-only, and a réparateur reading sibling offers is what that rule forbids.
 *
 * Unit tests with a stubbed Prisma, the shape `banner-service.spec.ts` established and for the
 * same standing reason: `DATABASE_URL` points at PRODUCTION even locally and the integration
 * suite writes, so `test:unit` excluding the 30 `*.int.spec.ts` files makes this the only gate
 * that can ever run on these rules. No `vi.mock` anywhere.
 *
 * 🛑 WHAT A STUBBED PRISMA CAN AND CANNOT PROVE, stated because the sibling specs were both
 * written after overstating a gate. It proves the service BUILDS the right query and maps the
 * rows it is handed. It cannot prove Postgres honours the `where` - so the ownership assertion
 * reads the args, which is the only thing observable here, and the integration suite is where a
 * real row would be refused.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';

type Row = {
  id: string;
  demandeId: string;
  priceCents: number;
  delayHours: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: Date;
  demande: {
    title: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    /**
     * 🛑 PLURAL, because the column is. A demande holds one commande row per checkout attempt -
     * `resolvePending` reaps rather than deletes - so the service must run them through
     * `pickCommande`, the one place that decides which one counts.
     *
     * This spec was first written with a singular `commande` and all nine tests passed, because
     * a stubbed Prisma returns whatever shape the stub declares. `tsc` is what refused it. That
     * is the standing lesson in this repo pointing the other way for once: the type checker
     * caught what the tests could not, so run BOTH gates before believing either.
     */
    commandes: {
      status: string;
      step: string | null;
      id: string;
      delivery: string;
      dispute: { status: string } | null;
      createdAt: Date;
    }[];
  };
  repairer: {
    username: string;
    repairerProfile: { displayName: string | null } | null;
  };
};

/**
 * A SENT offer on a demande still awaiting a choice - the ordinary case, so every test below
 * states only its own departure from it.
 */
function row(over: Partial<Row> = {}): Row {
  return {
    id: 'offer-1',
    demandeId: 'demande-1',
    priceCents: 14500,
    delayHours: 72,
    status: 'SENT',
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    demande: { title: 'Écran iPhone 12 cassé', status: 'OPEN', commandes: [] },
    repairer: { username: 'marc', repairerProfile: { displayName: 'Marc D.' } },
    ...over,
  };
}

type Harness = {
  service: OffersService;
  findMany: ReturnType<typeof vi.fn>;
};

function harness(rows: Row[]): Harness {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { offer: { findMany } } as unknown as PrismaService;
  const notifications = {} as unknown as NotificationsService;
  return { service: new OffersService(prisma, notifications), findMany };
}

/**
 * The query the service actually built. Declared as a type rather than reached through `any`,
 * so a test asserting on a key the service never passes is a compile error here too.
 */
type Query = {
  where: {
    status?: string;
    deletedAt?: null;
    demande?: { authorUserId?: string; deletedAt?: null; targetRepairerUserId?: null };
    /** B2. The suspension clause `ACCEPTABLE_OFFER_WHERE` contributes; see its test below. */
    repairer?: { profile?: { repairerSuspendedAt?: null } };
  };
  orderBy?: { createdAt?: 'asc' | 'desc' };
};

function queryOf(h: Harness): Query {
  const call = h.findMany.mock.calls[0] as [Query] | undefined;
  if (!call) throw new Error('findMany was never called');
  return call[0];
}

/** Exactly one result, unwrapped. `toHaveLength` first, so a wrong count fails as a count. */
function only<T>(items: T[]): T {
  expect(items).toHaveLength(1);
  const [first] = items;
  if (!first) throw new Error('expected exactly one item');
  return first;
}

describe('listReceived - ownership', () => {
  it('asks only for offers on demandes the caller authored', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          demande: expect.objectContaining({ authorUserId: CLIENT }),
        }),
      }),
    );
  });

  it('excludes soft-deleted offers AND soft-deleted demandes', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    const { where } = queryOf(h);
    // Both halves, because a moderation removal on either side must take the row out.
    // `listForDemande` filters the demande the same way; a list that disagreed would
    // surface an offer on a demande the client can no longer open.
    expect(where.deletedAt).toBeNull();
    expect(where.demande?.deletedAt).toBeNull();
  });

  it('excludes offers on private quote requests (CF6-14: PUBLIC_DEMANDE_WHERE enforces targetRepairerUserId null)', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    const { where } = queryOf(h);
    expect(where.demande?.targetRepairerUserId).toBeNull();
  });

  /**
   * 🛑 B2 §5.2, AND THE ONE ASSERTION THAT CATCHES THE DEFECT MOST LIKELY TO SHIP WITH IT.
   *
   * This is the only site in B2 that SPREADS `ACCEPTABLE_OFFER_WHERE` rather than assigning it,
   * and the predicate carries a `repairer:` key. Object spread is not a deep merge, so a sibling
   * `repairer:` key added to this `where` later would REPLACE the suspension clause outright -
   * silently, with no type error, because both spellings are valid `Prisma.OfferWhereInput`
   * values. The source-level assertion in `offer-predicates.spec.ts` guards the shape; this
   * guards the COMPOSED OBJECT the service actually hands Prisma, which is the property that
   * matters. Task 5's plan proposed the same composition against the directory fragment and
   * would have stripped every listability clause from it.
   *
   * A suspended réparateur's offer must not appear on the client's « Mes offres reçues » - it is
   * neither visible nor binding, per §5.2's rule - while the notification lists in
   * `demandes.service.ts` deliberately stay unfiltered so he is still told what happens to it.
   */
  it('excludes a suspended réparateur, and the spread keeps that clause', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    const { where } = queryOf(h);
    // Through `repairer.profile` and NOT `repairer.repairerProfile`: the latter is an OPTIONAL
    // to-one relation, so Prisma would read a nested filter on it as « the row exists AND the
    // field matches » and silently drop every réparateur without one. `Profile` exists for
    // every account.
    expect(where.repairer).toEqual({ profile: { repairerSuspendedAt: null } });
    // Still both original clauses, so the spread contributed rather than replaced.
    expect(where.status).toBe('SENT');
    expect(where.demande?.authorUserId).toBe(CLIENT);
  });

  it('newest first, so the list agrees with the per-demande offers screen', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});

describe('listReceived - shape', () => {
  it('carries the demande title and the réparateur, which listMine has no need for', async () => {
    const h = harness([row()]);

    const item = only(await h.service.listReceived(CLIENT));

    expect(item).toEqual({
      id: 'offer-1',
      demandeId: 'demande-1',
      demandeTitle: 'Écran iPhone 12 cassé',
      repairerName: 'Marc D.',
      priceCents: 14500,
      delayHours: 72,
      status: 'SENT',
      createdAt: '2026-08-30T10:00:00.000Z',
    });
  });

  it('resolves the name through publicIdentity, so it cannot disagree with OfferDto', async () => {
    // No displayName is the common case for a réparateur who has not filled in a profile.
    // `publicIdentity` answers `@username`; a second rule here would let the same person
    // read as « Marc D. » on one screen and « marc » on another.
    const h = harness([
      row({ repairer: { username: 'marc', repairerProfile: null } }),
    ]);

    const item = only(await h.service.listReceived(CLIENT));

    expect(item.repairerName).toBe('@marc');
  });
});

describe('listReceived - which offers still matter', () => {
  it('asks the database for SENT only, agreeing with offerCount', async () => {
    const h = harness([]);

    await h.service.listReceived(CLIENT);

    // `liveOffers`'s own comment fixes this: « Live means SENT, deliberately, so this agrees
    // with DemandesService's offerCount, which counts SENT alone. » A wider filter here would
    // make this screen and every demande card disagree about how many offers exist.
    expect(queryOf(h).where.status).toBe('SENT');
  });

  it('🛑 drops an offer whose demande has moved past « En attente d\'offres »', async () => {
    // THE DEFECT THIS GUARDS IS ONE THE CLIENT ALREADY REPORTED, on 2026-08-21: an offer count
    // rendered beside « Paiement effectué ». `offersStillMatter` exists to have exactly one
    // definition of that rule and its comment forbids a second copy, so this list imports it
    // rather than re-expressing it as a where clause.
    //
    // In production `payments.service.ts:413` flips every sibling to REJECTED on accept, so a
    // SENT offer on a paid demande should not exist. That is another service's transaction,
    // not a rule this endpoint enforces - which is precisely why the guard is here and why the
    // stub is allowed to produce the state a bug there would produce.
    const h = harness([
      row({
        demande: {
          title: 'Payée',
          status: 'IN_PROGRESS',
          commandes: [
            {
              id: 'c1',
              status: 'PAID',
              step: 'PAID',
              delivery: 'HOME',
              dispute: null,
              createdAt: new Date('2026-08-29T00:00:00.000Z'),
            },
          ],
        },
      }),
    ]);

    await expect(h.service.listReceived(CLIENT)).resolves.toEqual([]);
  });

  it('drops an offer on a CANCELLED demande, which is an exit and not a chain position', async () => {
    // `repairStatus()` returns `exit: 'Annulée'` here, and `offersStillMatter` is false for
    // every exit. Worth its own case because an exit is NOT « past index 0 » - it is off the
    // chain entirely, and a filter written as `currentIndex === 0` alone (ignoring `exit`)
    // would let it through.
    const h = harness([
      row({ demande: { title: 'Annulée', status: 'CANCELLED', commandes: [] } }),
    ]);

    await expect(h.service.listReceived(CLIENT)).resolves.toEqual([]);
  });

  it('keeps an offer whose checkout was abandoned, because the demande awaits offers again', async () => {
    // `repairStatus()` sends ABANDONED back to client index 0 deliberately - `resolvePending`
    // can reap it - so these offers are live again and belong in the list. The opposite case to
    // the two above, and it is what stops the guard being a blanket « has a commande » test.
    const h = harness([
      row({
        demande: {
          title: 'Abandonnée',
          status: 'OPEN',
          commandes: [
            {
              id: 'c1',
              status: 'ABANDONED',
              step: null,
              delivery: 'HOME',
              dispute: null,
              createdAt: new Date('2026-08-29T00:00:00.000Z'),
            },
          ],
        },
      }),
    ]);

    const item = only(await h.service.listReceived(CLIENT));

    expect(item.demandeTitle).toBe('Abandonnée');
  });
});
