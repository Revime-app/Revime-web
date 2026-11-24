import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('réparateur directory', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const list = (cookie: string, qs = '') =>
    request(app.getHttpServer()).get(`/api/v1/repairers${qs}`).set('Cookie', cookie);

  /** Renames a réparateur to a token unique to this run, so `q` can find exactly him. */
  const rename = async (email: string, displayName: string): Promise<string> => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.repairerProfile.update({ where: { userId: user.id }, data: { displayName } });
    return user.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects an anonymous caller', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/repairers');
    expect(res.status).toBe(401);
  });

  it('excludes the caller from his own directory', async () => {
    const token = `Annuaire${Date.now().toString(36)}`;
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);
    const meId = await rename(email, `${token}Moi`);

    const res = await list(cookie, `?q=${token}`).expect(200);

    // He matches his own token and must still not be in his own list. Same
    // precedent as the demande feed excluding your own demandes.
    expect(res.body.map((r: { userId: string }) => r.userId)).not.toContain(meId);
  });

  it('lists another réparateur, with his display name and service area', async () => {
    const token = `Annuaire${Date.now().toString(36)}b`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherId = await rename(other.email, `${token}Autre`);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', other.cookie)
      .send({ postalCode: '69003' })
      .expect(200);

    const res = await list(viewer.cookie, `?q=${token}`).expect(200);

    const row = res.body.find((r: { userId: string }) => r.userId === otherId);
    expect(row).toBeDefined();
    expect(row.displayName).toBe(`${token}Autre`);
    expect(row.serviceAreaLabel).toContain('Lyon');
    // No reviews anywhere, so this is the ordinary case and not an edge one.
    expect(row.rating).toBeNull();
    expect(row.reviewCount).toBe(0);
    // The badge starts at IDENTITY. A fresh account is NONE, so null is correct.
    expect(row.verifiedBadge).toBeNull();
    // kind must NOT be present -- design 4.4.
    expect(row.kind).toBeUndefined();
  });

  it('excludes a réparateur who has turned réparateur mode back off', async () => {
    const token = `Annuaire${Date.now().toString(36)}c`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherId = await rename(other.email, `${token}Parti`);

    // updateModes does NOT delete the RepairerProfile -- its upsert only clears
    // deletedAt on re-enable. So the row survives with a complete profile, and
    // repairerEnabled is the only thing that says he is no longer offering.
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', other.cookie)
      .send({ repairerEnabled: false, clientEnabled: true })
      .expect(200);

    const res = await list(viewer.cookie, `?q=${token}`).expect(200);
    expect(res.body.map((r: { userId: string }) => r.userId)).not.toContain(otherId);
  });

  it('excludes a soft-deleted réparateur profile', async () => {
    const token = `Annuaire${Date.now().toString(36)}d`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherId = await rename(other.email, `${token}Supprime`);
    await prisma.repairerProfile.update({
      where: { userId: otherId },
      data: { deletedAt: new Date() },
    });

    const res = await list(viewer.cookie, `?q=${token}`).expect(200);
    expect(res.body.map((r: { userId: string }) => r.userId)).not.toContain(otherId);
  });

  it('matches q case-insensitively on the display name', async () => {
    const token = `Annuaire${Date.now().toString(36)}e`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherId = await rename(other.email, `${token}MAJUSCULE`);

    const res = await list(viewer.cookie, `?q=${token.toLowerCase()}majuscule`).expect(200);
    expect(res.body.map((r: { userId: string }) => r.userId)).toContain(otherId);
  });

  it('returns an empty array for a q that matches nobody', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    const res = await list(viewer.cookie, '?q=zzzintrouvablezzz').expect(200);
    expect(res.body).toEqual([]);
  });

  it('rejects a q over 120 characters with 400 and the French envelope', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    const res = await list(viewer.cookie, `?q=${'a'.repeat(121)}`);

    // 400, not 422: app-exception.ts maps VALIDATION_FAILED to 400.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.q).toBe('Recherche trop longue.');
  });

  it('rejects an unknown sort', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    const res = await list(viewer.cookie, '?sort=prix');
    expect(res.status).toBe(400);
  });

  it('orders by display name when sort is absent, and identically when sort=az', async () => {
    const token = `Annuaire${Date.now().toString(36)}f`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const b = await signUpRepairer(app);
    createdEmails.push(b.email);
    const a = await signUpRepairer(app);
    createdEmails.push(a.email);
    // Created b-then-a so insertion order is the OPPOSITE of alphabetical, which is
    // what makes this test able to fail.
    const bId = await rename(b.email, `${token}Bravo`);
    const aId = await rename(a.email, `${token}Alpha`);

    const absent = await list(viewer.cookie, `?q=${token}`).expect(200);
    const az = await list(viewer.cookie, `?q=${token}&sort=az`).expect(200);

    const ids = (body: { userId: string }[]) => body.map((r) => r.userId);
    expect(ids(absent.body).indexOf(aId)).toBeLessThan(ids(absent.body).indexOf(bId));
    // Spec 6.3: absent and az are the SAME order, which is what lets the picker
    // display « A → Z » while sending nothing.
    expect(ids(az.body)).toEqual(ids(absent.body));
  });

  it('keeps unrated reparateurs in stable alphabetical order under sort=note', async () => {
    const token = `Annuaire${Date.now().toString(36)}g`;
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const one = await signUpRepairer(app);
    createdEmails.push(one.email);
    const two = await signUpRepairer(app);
    createdEmails.push(two.email);
    const oneId = await rename(one.email, `${token}Alpha`);
    const twoId = await rename(two.email, `${token}Bravo`);

    const res = await list(viewer.cookie, `?q=${token}&sort=note`).expect(200);

    // Nobody is rated, so both rank the same and the incoming alphabetical order must
    // survive the sort.
    //
    // 🛑 This does NOT pin the sentinel's FINITENESS, and an earlier version of this
    // comment claimed it did. A deliberate break substituting Number.POSITIVE_INFINITY
    // was run against this exact test and it PASSED: the comparator returns NaN, but
    // V8's insertion sort treats a NaN comparison as "not less than" and leaves a
    // short array's order alone. The ECMAScript spec leaves that unspecified, so the
    // finiteness requirement is real -- it is simply not observable from here.
    //
    // Where it IS pinned: `test/repairer-schemas.spec.ts`, which calls the comparator
    // directly and asserts `rank(null) - rank(null) === 0`. That test's own deliberate
    // break failed correctly. "Unrated sorts last" is also pinned there via
    // `rank(null) > rank(5)`.
    expect(res.body.map((r: { userId: string }) => r.userId)).toEqual([oneId, twoId]);
  });
});

describe('réparateur public profile', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const profile = (cookie: string, userId: string) =>
    request(app.getHttpServer()).get(`/api/v1/repairers/${userId}`).set('Cookie', cookie);

  /**
   * 🛑 A réparateur who definitely EXISTS, used as a positive control by every 404 test
   * in this describe. Not padding - it is what makes those tests falsifiable at all.
   *
   * `AllExceptionsFilter` derives the error envelope from the HTTP STATUS: `404` becomes
   * code `NOT_FOUND` with the message « Ressource introuvable. » regardless of where the
   * 404 came from. So a router-level 404 - meaning THE ROUTE DOES NOT EXIST - is
   * byte-identical to this service's own refusal, in status, code and message alike.
   *
   * Measured rather than theorised: with no route implemented, three of this describe's
   * 404 assertions PASSED. On their own they were checks whose failure path is
   * indistinguishable from a pass, which is a defect class this repo names explicitly.
   *
   * Asserting 200 for this control first means deleting the route FAILS those tests
   * instead of satisfying them.
   */
  let controlUserId: string;
  let controlCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const control = await signUpRepairer(app);
    createdEmails.push(control.email);
    controlCookie = control.cookie;
    controlUserId = (
      await prisma.user.findUniqueOrThrow({ where: { email: control.email } })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects an anonymous caller', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/repairers/anything');
    expect(res.status).toBe(401);
  });

  it('returns the profile of another réparateur, with repairerSince and empty derivations', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });

    const res = await profile(viewer.cookie, otherUser.id).expect(200);

    expect(res.body.userId).toBe(otherUser.id);
    expect(res.body.displayName).toBe('Test Utilisateur');
    // bio has no writer until the next task, so null is the only possible value here.
    expect(res.body.bio).toBeNull();
    expect(res.body.rating).toBeNull();
    expect(res.body.reviewCount).toBe(0);
    // 0 IS a true value for repairCount, unlike a rating of 0.
    expect(res.body.repairCount).toBe(0);
    expect(res.body.categoriesTreated).toEqual([]);
    // An ISO string, and it must parse. This is RepairerProfile.createdAt, not
    // user.createdAt -- see the field's own doc comment for why the distinction matters.
    expect(Number.isNaN(Date.parse(res.body.repairerSince))).toBe(false);
    expect(res.body.kind).toBeUndefined();
  });

  // The list excludes the caller; the DETAIL must not, because « Mon profil public »
  // reads this exact route for the caller's own id. Design 6.1.
  it('serves the CALLER his own profile, unlike the list', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const res = await profile(cookie, user.id).expect(200);
    expect(res.body.userId).toBe(user.id);
  });

  it('404s for a user who has never enabled réparateur mode', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const client = await signUp(app);
    createdEmails.push(client.email);
    const clientUser = await prisma.user.findUniqueOrThrow({ where: { email: client.email } });

    // Control first: without it a missing route satisfies this test. See controlUserId.
    await profile(viewer.cookie, controlUserId).expect(200);

    const res = await profile(viewer.cookie, clientUser.id);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
  });

  it('404s for a userId that does not exist at all, and the route itself answers', async () => {
    // Control first: without it a missing route satisfies this test. See controlUserId.
    await profile(controlCookie, controlUserId).expect(200);

    const res = await profile(controlCookie, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('404s for a soft-deleted réparateur profile', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });
    await prisma.repairerProfile.update({
      where: { userId: otherUser.id },
      data: { deletedAt: new Date() },
    });

    // Control first: without it a missing route satisfies this test. See controlUserId.
    await profile(viewer.cookie, controlUserId).expect(200);

    const res = await profile(viewer.cookie, otherUser.id);
    expect(res.status).toBe(404);
  });

  // The claim that Nest routes both without shadowing, asserted rather than assumed:
  // GET /repairers/:userId lives in RepairersModule and
  // GET /repairers/:userId/reviews lives in ReviewsModule.
  it('coexists with the reviews route on the same URL prefix', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });

    await profile(viewer.cookie, otherUser.id).expect(200);
    const reviews = await request(app.getHttpServer())
      .get(`/api/v1/repairers/${otherUser.id}/reviews`)
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(reviews.body).toEqual([]);
  });

  it('lists distinct categoriesTreated from offer history, without duplicating', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const repairerUser = await prisma.user.findUniqueOrThrow({ where: { email: repairer.email } });

    const categories = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Cookie', client.cookie)
      .expect(200);
    const leaf = categories.body.find((c: { parentId: string | null }) => c.parentId !== null);
    expect(leaf).toBeDefined();

    // TWO demandes in the SAME category, each carrying one offer from the same
    // réparateur. The label must appear ONCE.
    const stamp = Date.now().toString(36);
    for (const title of [`PieceC${stamp}a`, `PieceC${stamp}b`]) {
      const demande = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', client.cookie)
        .send({
          categoryId: leaf.id,
          title,
          description: "Description de test pour l'annuaire, assez longue pour passer.",
          // Required, min 2.
          locationLabel: 'Paris 17e',
          postalCode: '75017',
          mode: 'OFFERS',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/demandes/${demande.body.id}/offers`)
        .set('Cookie', repairer.cookie)
        .send({
          priceCents: 8900,
          // CF-29: no longer a closed set. Any integer from 1 to DELAY_HOURS_MAX
          // (2160, i.e. 90 days) is accepted; 48 is kept only because it is what
          // the rest of this suite sends.
          delayHours: 48,
          // z.enum(WARRANTY_OPTIONS): 'Aucune' | '3 mois' | '6 mois' | '12 mois'.
          // CF-31 pins it to « Aucune » rather than any of the other three: this
          // réparateur is at NONE, and a garantie is refused below BUSINESS.
          warrantyLabel: 'Aucune',
          // z.enum(PARTS_OPTIONS), and note it is SINGULAR.
          partsLabel: "Pièce d'origine",
          travel: 'WORKSHOP',
          // Required and deliberately NOT defaulted, so it must be sent explicitly.
          acceptsParcel: false,
        })
        .expect(201);
    }

    const res = await profile(client.cookie, repairerUser.id).expect(200);

    expect(res.body.categoriesTreated).toEqual([leaf.labelFr]);
  });
});
