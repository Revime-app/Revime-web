import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  demandeRequest,
  modesRequest,
  offerRequest,
  postalCodeRequest,
  publicProfileRequest,
  SEED_ORIGIN,
  signupRequest,
} from '../scripts/seed-demo/phase1-http.mjs';
import { CLIENTS, EXISTING_REPAIRERS, OPEN_DEMANDES, REPAIRERS, TUNED_OFFERS } from '../scripts/seed-demo/cast.mjs';
import { planHistory } from '../scripts/seed-demo/plan-history.mjs';
import { planThreads } from '../scripts/seed-demo/plan-threads.mjs';
import { planBackdate } from '../scripts/seed-demo/backdate.mjs';
import {
  capturePlan,
  deletePlan,
  DOOMED,
  CLIENT_USER_ID,
  MUTATIONS,
  OWNER_DEMO_CONVERSATION_IDS,
  OWNER_USER_ID,
  SEEDED_OFFER_ACTOR_NAMES,
} from '../scripts/seed-demo/teardown.mjs';
import { INSERT_ORDER } from '../scripts/seed-demo/phase2-prisma.mjs';
import { planPhotoPaths } from '../scripts/seed-demo/photos.mjs';
import { adminLinkOrigin, adminOrigins } from '../src/auth/admin-origins.js';

describe('phase 1 request builders address the real routes', () => {
  it('signs up OUTSIDE the api/v1 prefix, where Better Auth is mounted', () => {
    const { path } = signupRequest(CLIENTS[0]);
    expect(path).toBe('/api/auth/sign-up/email');
    expect(path).not.toContain('/api/v1');
  });

  it('sends only what signup accepts', () => {
    const { body } = signupRequest(CLIENTS[0]);
    expect(Object.keys(body).sort()).toEqual(['email', 'name', 'password', 'username']);
  });

  it('enables reparateur mode through me/modes', () => {
    const r = modesRequest('REPAIRER');
    expect(r.path).toBe('/api/v1/users/me/modes');
    expect(r.method).toBe('PATCH');
    expect(r.body).toEqual({ repairerEnabled: true, activeMode: 'REPAIRER' });
  });

  it('keeps geography and public profile on their two separate routes', () => {
    expect(postalCodeRequest('75011').path).toBe('/api/v1/users/me/repairer');
    expect(publicProfileRequest({ displayName: 'A', bio: 'b' }).path).toBe(
      '/api/v1/users/me/repairer-profile',
    );
  });

  it('posts an offer to the ENGLISH offers path', () => {
    const r = offerRequest('abc', TUNED_OFFERS[0]);
    expect(r.path).toBe('/api/v1/demandes/abc/offers');
    expect(r.path).not.toContain('offres');
  });

  it('never sends repairerKey to the API', () => {
    const { body } = offerRequest('abc', TUNED_OFFERS[0]);
    expect(body).not.toHaveProperty('repairerKey');
    expect(Object.keys(body).sort()).toEqual([
      'acceptsParcel',
      'comment',
      'delayHours',
      'partsLabel',
      'priceCents',
      'travel',
      'warrantyLabel',
    ]);
  });

  it('resolves the category slug to a uuid and never sends the slug', () => {
    const { body } = demandeRequest(OPEN_DEMANDES[0], '11111111-2222-3333-4444-555555555555');
    expect(body.categoryId).toBe('11111111-2222-3333-4444-555555555555');
    expect(body).not.toHaveProperty('categorySlug');
    expect(body).not.toHaveProperty('clientKey');
  });

  it('omits budgetCents on an OFFERS demande and includes it on a BUDGET one', () => {
    const offers = OPEN_DEMANDES.find((d) => d.mode === 'OFFERS');
    const budget = OPEN_DEMANDES.find((d) => d.mode === 'BUDGET');
    if (!offers || !budget) {
      throw new Error('the cast must carry at least one OFFERS demande and one BUDGET demande');
    }
    expect(demandeRequest(offers, 'x').body).not.toHaveProperty('budgetCents');
    // toMatchObject rather than a property read: `budgetCents` is assigned conditionally
    // inside demandeRequest, so it is not on the builder's inferred return type.
    expect(demandeRequest(budget, 'x').body).toMatchObject({ budgetCents: budget.budgetCents });
  });

  it('builds a request for every reparateur and client in the cast', () => {
    for (const a of [...REPAIRERS, ...CLIENTS]) {
      expect(signupRequest(a).body.email).toBe(a.email);
    }
  });
});

describe('the history substrate', () => {
  const ids = Object.fromEntries([...REPAIRERS.map((r) => [r.key, `u-${r.key}`]), ['testr', 'u-testr'], ['owner', 'u-owner']]);
  const clientIds = Object.fromEntries(CLIENTS.map((c) => [c.key, `c-${c.key}`]));
  const plan = () =>
    planHistory({
      repairerIds: ids,
      clientIds,
      categoryId: '11111111-2222-3333-4444-555555555555',
      now: new Date('2026-08-20T00:00:00Z'),
    });

  it('produces one demande, one offer and one commande per review', () => {
    const p = plan();
    expect(p.reviews).toHaveLength(36);
    expect(p.commandes).toHaveLength(36);
    expect(p.offers).toHaveLength(36);
    expect(p.demandes).toHaveLength(36);
  });

  it('marks every history demande DONE, so none of them enters the feed', () => {
    for (const d of plan().demandes) expect(d.status).toBe('DONE');
  });

  it('marks every history offer ACCEPTED', () => {
    for (const o of plan().offers) expect(o.status).toBe('ACCEPTED');
  });

  it('keeps every commande in the cron-invisible shape', () => {
    for (const c of plan().commandes) {
      expect(c.status).toBe('PAID');
      expect(c.step).toBe('RELEASED');
      expect(c.stripeChargeId).toBeTruthy();
      expect(c.stripeTransferId).toBeTruthy();
      expect(c.stripeRefundId).toBeNull();
      expect(c.stripeTransferReversalId).toBeNull();
      expect(c.disputedAt).toBeNull();
    }
  });

  it('gives every Stripe id a unique value, since four of those columns are @unique', () => {
    const p = plan();
    for (const field of ['stripeSessionId', 'stripePaymentIntentId', 'stripeTransferId']) {
      const values = p.commandes.map((c) => c[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('points each review at its own commande and the right reparateur', () => {
    const p = plan();
    const byId = new Map(p.commandes.map((c) => [c.id, c]));
    for (const r of p.reviews) {
      const c = byId.get(r.commandeId);
      expect(c).toBeDefined();
      expect(r.repairerUserId).toBe(c.repairerUserId);
      expect(r.authorUserId).toBe(c.clientUserId);
    }
  });

  it('never has a reparateur review his own repair', () => {
    for (const r of plan().reviews) expect(r.authorUserId).not.toBe(r.repairerUserId);
  });

  it('honours each declared rating multiset', () => {
    const p = plan();
    for (const r of [...REPAIRERS, ...EXISTING_REPAIRERS]) {
      const got = p.reviews.filter((x) => x.repairerUserId === ids[r.key]).map((x) => x.rating);
      expect(got.sort()).toEqual([...r.ratings].sort());
    }
  });

  it('leaves some sub-ratings and some comments null, because both are ordinary', () => {
    const p = plan();
    expect(p.reviews.some((r) => r.qualityRating === null)).toBe(true);
    expect(p.reviews.some((r) => r.qualityRating !== null)).toBe(true);
    expect(p.reviews.some((r) => r.comment === null)).toBe(true);
  });

  it('spreads review dates over roughly four months and never into the future', () => {
    const now = new Date('2026-08-20T00:00:00Z');
    const dates = plan().reviews.map((r) => r.createdAt.getTime());
    expect(Math.max(...dates)).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - Math.min(...dates)).toBeGreaterThan(90 * 86_400_000);
  });

  it('orders timestamps chronologically for every item: demande < offer < commande < review', () => {
    const p = plan();
    const demandesById = new Map(p.demandes.map((d) => [d.id, d]));
    const offersById = new Map(p.offers.map((o) => [o.id, o]));
    const commandesById = new Map(p.commandes.map((c) => [c.id, c]));

    for (const review of p.reviews) {
      const commande = commandesById.get(review.commandeId);
      const offer = offersById.get(commande.offerId);
      const demande = demandesById.get(commande.demandeId);

      expect(demande.createdAt.getTime()).toBeLessThan(offer.createdAt.getTime());
      expect(offer.createdAt.getTime()).toBeLessThan(commande.paidAt.getTime());
      expect(commande.paidAt.getTime()).toBeLessThan(review.createdAt.getTime());
    }
  });
});

describe('the two seeded threads', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const plan = () =>
    planThreads({
      clientUserId: 'him',
      clientDemandeId: 'his-demande',
      repairerIds: { voltaire: 'u-voltaire', karim: 'u-karim' },
      now,
    });

  it('opens exactly two conversations on his own demande', () => {
    const p = plan();
    expect(p.conversations).toHaveLength(2);
    for (const c of p.conversations) {
      expect(c.demandeId).toBe('his-demande');
      expect(c.clientUserId).toBe('him');
    }
  });

  it('keys each conversation on a distinct reparateur, per the unique index', () => {
    const keys = plan().conversations.map((c) => `${c.demandeId}:${c.repairerUserId}`);
    expect(new Set(keys).size).toBe(2);
  });

  it('gives every thread at least four messages', () => {
    const p = plan();
    for (const c of p.conversations) {
      expect(p.messages.filter((m) => m.conversationId === c.id).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('ends every thread with a message FROM the reparateur, so it reads as awaiting him', () => {
    const p = plan();
    for (const c of p.conversations) {
      const thread = p.messages
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      expect(thread.at(-1).senderUserId).toBe(c.repairerUserId);
    }
  });

  it('leaves clientLastReadAt BEFORE the last message, so the inbox badge is genuine', () => {
    const p = plan();
    for (const c of p.conversations) {
      expect(c.clientLastReadAt.getTime()).toBeLessThan(c.lastMessageAt.getTime());
    }
  });

  it('sets lastMessageAt to the newest message in that thread', () => {
    const p = plan();
    for (const c of p.conversations) {
      const newest = Math.max(
        ...p.messages.filter((m) => m.conversationId === c.id).map((m) => m.createdAt.getTime()),
      );
      expect(c.lastMessageAt.getTime()).toBe(newest);
    }
  });

  it('adds one MESSAGE_RECEIVED notification per thread, addressed to him in CLIENT mode', () => {
    const p = plan();
    expect(p.notifications).toHaveLength(2);
    for (const nn of p.notifications) {
      expect(nn.type).toBe('MESSAGE_RECEIVED');
      expect(nn.userId).toBe('him');
      expect(nn.mode).toBe('CLIENT');
    }
  });

  it('routes on conversationId and joins its body on messageId, per the schema', () => {
    // Notification carries NO foreign keys, and the message body is JOINED on
    // messageId at read time rather than snapshotted -- the one deliberate exception
    // to that model's snapshot rule. A row without both is unroutable and bodyless.
    const p = plan();
    const messageIds = new Set(p.messages.map((m) => m.id));
    for (const nn of p.notifications) {
      expect(nn.conversationId).toBeTruthy();
      expect(nn.messageId).toBeTruthy();
      expect(messageIds.has(nn.messageId)).toBe(true);
      expect(nn.readAt).toBeNull();
    }
  });

  it('points each notification at the LAST message of its own thread', () => {
    const p = plan();
    for (const nn of p.notifications) {
      const thread = p.messages
        .filter((m) => m.conversationId === nn.conversationId)
        .sort((a, b) => a.createdAt - b.createdAt);
      expect(nn.messageId).toBe(thread.at(-1).id);
    }
  });

  it('satisfies the partial unique index on (userId, conversationId)', () => {
    // @@unique([userId, conversationId]) where type = MESSAGE_RECEIVED and readAt is
    // null. Both rows are unread and addressed to the same user, so their
    // conversationIds MUST differ.
    const p = plan();
    const keys = p.notifications.map((n) => `${n.userId}:${n.conversationId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('advertises no payment journey', () => {
    const types = plan().notifications.map((n) => n.type);
    expect(types).not.toContain('FUNDS_RELEASED');
    expect(types).not.toContain('COMMANDE_STEP');
  });
});

describe('backdating', () => {
  const now = new Date('2026-08-20T12:00:00Z');

  it('spreads the four offers over hours, never all on one timestamp', () => {
    // Stated rather than inferred: backdate.mjs is JavaScript, so tsc types its return
    // as `any`. Naming the shape here is what makes the callback below typed at all.
    const rows: Array<{ id: string; createdAt: Date }> = planBackdate({
      offerIds: ['a', 'b', 'c', 'd'],
      now,
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.createdAt.getTime())).size).toBe(4);
  });

  it('puts every offer in the past and inside the last three days', () => {
    for (const r of planBackdate({ offerIds: ['a', 'b', 'c', 'd'], now })) {
      expect(r.createdAt.getTime()).toBeLessThan(now.getTime());
      expect(now.getTime() - r.createdAt.getTime()).toBeLessThan(3 * 86_400_000);
    }
  });
});

describe('teardown is safe by construction', () => {
  it('produces exactly 7 delete steps (users, 2 client notification sets, client photo, 2 doomed rows, owner notifications)', () => {
    expect(deletePlan()).toHaveLength(7);
  });

  it('declares exactly 2 mutations', () => {
    expect(MUTATIONS).toHaveLength(2);
  });

  it('never issues a delete without a WHERE that names demo data', () => {
    for (const step of deletePlan()) {
      expect(step.where, `${step.table} has no WHERE`).toBeTruthy();
      expect(Object.keys(step.where).length).toBeGreaterThan(0);
    }
  });

  it('scopes the account delete to the demo domain and never to repareme.test', () => {
    const accounts = deletePlan().find((s) => s.table === 'user');
    expect(JSON.stringify(accounts.where)).toContain('demo.revime.fr');
    expect(JSON.stringify(accounts.where)).not.toContain('repareme.test');
  });

  it('targets the pre-existing rows by id, never by a pattern that could widen', () => {
    for (const d of DOOMED) {
      expect(d.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(d.reason).toBeTruthy();
    }
  });

  it('declares a prior value for every mutation, so cleanup can restore it', () => {
    for (const m of MUTATIONS) {
      expect(m).toHaveProperty('restore');
      expect(m.restore).toBeDefined();
      expect(Object.keys(m.restore).length).toBeGreaterThan(0);
    }
  });

  it('names the client nowhere in any delete, because the surgical steps go by captured id', () => {
    const CLIENT_USER_ID = 'v0lvQzcoWXqVNFAJqGU8e4PqE5jOFuxz';
    expect(MUTATIONS.every((m) => m.userId !== CLIENT_USER_ID)).toBe(true);
    // His id belongs to the CAPTURE predicates, not to a DELETE. Deletes carry only the
    // ids capture recorded, so no predicate of theirs can widen onto his rows.
    expect(JSON.stringify(deletePlan())).not.toContain(CLIENT_USER_ID);
    expect(JSON.stringify(capturePlan({ demoConversationIds: [] }))).toContain(CLIENT_USER_ID);
  });

  it('issues every surgical delete by id, so nothing is destroyed that was not captured', () => {
    // Notification x2 and DemandePhoto are the three rows no cascade reaches. Each is
    // deleted by the ids captureBackup recorded -- never by the predicate that found
    // them, which is what stops a row created between capture and delete from being
    // destroyed unrecorded.
    for (const step of deletePlan().filter((s) => s.table === 'Notification' || s.table === 'DemandePhoto')) {
      expect(Object.keys(step.where)).toEqual(['id']);
      expect(step.where.id).toHaveProperty('in');
    }
  });

  it('consumes the captured ids rather than re-deriving them', () => {
    const backup = {
      captured: [
        { table: 'Notification', reason: 'a', ids: ['n1', 'n2'] },
        { table: 'Notification', reason: 'b', ids: ['n3'] },
        { table: 'DemandePhoto', reason: 'c', ids: ['p1'] },
      ],
    };
    const steps = deletePlan(backup);
    // 1 user + 3 captured (this fixture's own count, not capturePlan's) + 2 doomed.
    expect(steps).toHaveLength(6);
    expect(steps[1].where).toEqual({ id: { in: ['n1', 'n2'] } });
    expect(steps[2].where).toEqual({ id: { in: ['n3'] } });
    expect(steps[3].where).toEqual({ id: { in: ['p1'] } });
  });

  it('scopes the client notification capture narrowly enough to survive the MESSAGING_ENABLED flip', () => {
    /**
     * The predicate this replaced matched « any notification of his carrying a
     * conversationId, or any on his demande », justified by messaging being off. Task 9
     * turns messaging on while he is using the app, at which point that predicate would
     * take his real messages with it. So MESSAGE_RECEIVED is scoped to the conversations
     * the seed created and OFFER_RECEIVED to the four display names it puts on screen.
     */
    const [, clientStep] = capturePlan({ demoConversationIds: ['conv-a', 'conv-b'] });
    if (!clientStep) throw new Error('capturePlan lost its client-notification step');
    const json = JSON.stringify(clientStep.where);
    expect(json).not.toContain('"not":null');
    expect(json).toContain('conv-a');
    expect(json).toContain('conv-b');
    for (const name of SEEDED_OFFER_ACTOR_NAMES) expect(json).toContain(name);
    expect(SEEDED_OFFER_ACTOR_NAMES).toHaveLength(4);
  });

  it('never deletes his demande, only notifications related to it', () => {
    const HIS_DEMANDE = '808b65fa-2a3f-4787-8886-147d96473665';
    expect(DOOMED.every((d) => d.id !== HIS_DEMANDE)).toBe(true);
    // Demande deletes must not target his ID
    const demandeDeletes = deletePlan().filter((s) => s.table === 'Demande');
    for (const d of demandeDeletes) {
      expect(d.where.id).not.toBe(HIS_DEMANDE);
    }
  });
});

describe('every row handed to createMany carries only columns that exist', () => {
  /**
   * 🛑 The generalised form of the check that `DemandePhoto` needed and did not have.
   * Two keys the uploader needed -- `localFile` and `contentType` -- reached
   * `demandePhoto.createMany`, and Prisma answers an unknown argument with a
   * PrismaClientValidationError that aborts the WHOLE Phase 2 transaction. Every planned
   * table is checked here rather than only that one, and against `schema.prisma` itself
   * rather than a hand-copied list, so a column renamed in a migration surfaces here
   * instead of inside a production write.
   */
  const SCHEMA = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

  /** Field names declared on a model, relation fields included -- an allowed superset. */
  function fieldsOf(model: string): string[] {
    const block = new RegExp(`^model ${model} \\{$([\\s\\S]*?)^\\}$`, 'm').exec(SCHEMA);
    const body = block?.[1];
    if (body === undefined) throw new Error(`model ${model} is not declared in schema.prisma`);
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0] as string);
  }

  it('parses schema.prisma rather than trusting a list typed here', () => {
    // Non-vacuity: a parser returning everything, nothing, or the wrong block fails one
    // of these four.
    const declared = fieldsOf('DemandePhoto');
    expect(declared).toContain('storagePath');
    expect(declared).toContain('sortOrder');
    expect(declared).not.toContain('localFile');
    expect(declared).not.toContain('contentType');
  });

  const repairerIds = Object.fromEntries([
    ...REPAIRERS.map((r) => [r.key, `u-${r.key}`]),
    ['testr', 'u-testr'],
    ['owner', 'u-owner'],
  ]);
  const clientIds = Object.fromEntries(CLIENTS.map((c) => [c.key, `c-${c.key}`]));
  const now = new Date('2026-08-20T00:00:00Z');

  const rowsByTable = (): Map<string, Array<Record<string, unknown>>> => {
    const history = planHistory({
      repairerIds,
      clientIds,
      categoryId: '11111111-2222-3333-4444-555555555555',
      now,
    });
    const threads = planThreads({
      clientUserId: 'him',
      clientDemandeId: 'his-demande',
      repairerIds: { voltaire: 'u-voltaire', karim: 'u-karim' },
      now,
    });
    const photo = planPhotoPaths({
      demandes: [
        {
          id: 'd-1',
          categorySlug: 'smartphone',
          authorUserId: 'u-1',
          file: 'smartphone.png',
          pathExt: 'png',
          contentType: 'image/png',
        },
      ],
    })[0].row;

    return new Map([
      ['Demande', history.demandes],
      ['DemandePhoto', [photo]],
      ['Offer', history.offers],
      ['Commande', history.commandes],
      ['Review', history.reviews],
      ['Conversation', threads.conversations],
      ['Message', threads.messages],
      ['Notification', threads.notifications],
    ]);
  };

  it('covers every table in the transaction, so a new one cannot slip past unchecked', () => {
    expect([...rowsByTable().keys()].sort()).toEqual([...INSERT_ORDER].sort());
  });

  it('passes no key that schema.prisma does not declare', () => {
    const byTable = rowsByTable();
    for (const table of INSERT_ORDER) {
      const declared = fieldsOf(table);
      const rows = byTable.get(table);
      if (!rows) throw new Error(`no sample rows for ${table}`);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          expect(declared, `${table}.${key} is not declared in schema.prisma`).toContain(key);
        }
      }
    }
  });
});

describe('phase 2 insert order', () => {
  it('satisfies FK dependencies', () => {
    const demandeIdx = INSERT_ORDER.indexOf('Demande');
    const offerIdx = INSERT_ORDER.indexOf('Offer');
    const commandeIdx = INSERT_ORDER.indexOf('Commande');
    const reviewIdx = INSERT_ORDER.indexOf('Review');
    const conversationIdx = INSERT_ORDER.indexOf('Conversation');
    const messageIdx = INSERT_ORDER.indexOf('Message');

    expect(demandeIdx).toBeLessThan(offerIdx); // Offers depend on Demandes
    expect(offerIdx).toBeLessThan(commandeIdx); // Commandes depend on Offers
    expect(commandeIdx).toBeLessThan(reviewIdx); // Reviews depend on Commandes
    expect(conversationIdx).toBeLessThan(messageIdx); // Messages depend on Conversations
  });
});

describe('the seed sends an Origin that auth.ts actually trusts', () => {
  // Better Auth's origin-check.mjs throws FORBIDDEN / MISSING_OR_NULL_ORIGIN when the
  // header is absent, and Node's fetch sends none. That 403'd every signup on the FIRST
  // live run, after these unit tests had been green for a day: the builders are pure and
  // covered, and the header lives in `send`, which no unit test reaches. This pins the
  // linkage instead, in the same spirit as the cron canary.
  it('derives its origin from ADMIN_ORIGIN, which is what auth.ts trusts', () => {
    const authSrc = readFileSync(new URL('../src/auth/auth.ts', import.meta.url), 'utf8');
    const line = authSrc.split('\n').find((l) => l.includes('trustedOrigins'));
    expect(line, 'auth.ts no longer declares trustedOrigins -- re-derive SEED_ORIGIN').toBeTruthy();
    // V7 U10: auth.ts trusts every entry of ADMIN_ORIGIN through adminOrigins(); the seed sends the first.
    expect(
      line,
      'auth.ts stopped trusting adminOrigins(), so the seed origin is no longer trusted',
    ).toContain('adminOrigins()');
    expect(adminOrigins()).toContain(SEED_ORIGIN);
    expect(SEED_ORIGIN).toBe(adminLinkOrigin());
  });

  it('is never empty or the literal "null", the two values Better Auth rejects outright', () => {
    expect(SEED_ORIGIN).toBeTruthy();
    expect(SEED_ORIGIN).not.toBe('null');
  });
});

describe('every seeded postal code is one BAN can actually resolve', () => {
  // 33100 is a real Bordeaux postcode and BAN returns ZERO features for it under
  // `type=municipality`; Bordeaux is indexed at 33000. The cast shipped 33100, the live
  // run geocoded it to null, and only the post-seed coordinate assertion caught it --
  // no unit test could, because the cast test asserts five digits and nothing more.
  // This is a known-bad list rather than a network call: cheap, offline, and it grows
  // whenever another one bites.
  const BAN_UNRESOLVABLE_AS_MUNICIPALITY = ['33100'];

  it('avoids postal codes known to return no BAN municipality', () => {
    for (const r of REPAIRERS) {
      expect(
        BAN_UNRESOLVABLE_AS_MUNICIPALITY,
        `${r.displayName} sits on ${r.postalCode}, which BAN cannot resolve as a municipality`,
      ).not.toContain(r.postalCode);
    }
    for (const c of CLIENTS) {
      expect(BAN_UNRESOLVABLE_AS_MUNICIPALITY).not.toContain(c.postalCode);
    }
  });
});

describe("the owner's hand-added demo conversations clean up too", () => {
  // These four were inserted with raw SQL, not by this script, so nothing about them is
  // discoverable at teardown time. Their conversations, messages and backing offers cascade
  // away on their own; the notifications do NOT, because Notification carries no foreign key
  // on conversationId. That is the same leak the client-side entry exists to prevent, and it
  // recurred the moment rows were added outside the script -- so it is pinned here.
  //
  // Asserted against capturePlan rather than deletePlan on purpose: an existing test enforces
  // that every surgical Notification delete goes by a CAPTURED id, so the predicate lives at
  // capture time and the rows land in the backup before they are destroyed.

  /** Throws rather than returning undefined, so a missing step fails with a readable reason. */
  function notificationStepFor(userId: string) {
    const step = capturePlan({ demoConversationIds: [] }).find(
      (s) => s.table === 'Notification' && s.where?.userId === userId,
    );
    if (!step) throw new Error(`capturePlan has no Notification step for user ${userId}`);
    const ids = step.where?.conversationId?.in;
    return { step, ids };
  }

  it('captures the owner notifications, scoped to the four fixed conversation ids', () => {
    const { ids } = notificationStepFor(OWNER_USER_ID);
    expect(ids).toEqual(OWNER_DEMO_CONVERSATION_IDS);
    expect(OWNER_DEMO_CONVERSATION_IDS).toHaveLength(4);
  });

  it('scopes by fixed ids, never by a bare not-null predicate that could reach real rows', () => {
    const { step, ids } = notificationStepFor(OWNER_USER_ID);
    // A `{ not: null }` here would eventually capture every message notification he receives.
    expect(JSON.stringify(step.where)).not.toContain('not');
    for (const id of ids ?? []) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the owner and client notification scopes separate', () => {
    expect(notificationStepFor(OWNER_USER_ID).step.where?.userId).not.toBe(
      notificationStepFor(CLIENT_USER_ID).step.where?.userId,
    );
  });
});
