import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('demandes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];

  const body = (over: Record<string, unknown> = {}) => ({
    categoryId,
    brand: 'Apple',
    model: 'iPhone 13',
    title: 'Écran iPhone 13 fissuré',
    description: "L'écran est fissuré en haut à droite et la batterie tient mal.",
    mode: 'OFFERS',
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow({ where: { slug: 'smartphone' } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects an anonymous publication', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/demandes').send(body());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('creates a demande and returns the presented shape', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body())
      .expect(201);

    expect(res.body).toMatchObject({
      title: 'Écran iPhone 13 fissuré',
      status: 'OPEN',
      mode: 'OFFERS',
      budgetCents: null,
      category: { slug: 'smartphone', labelFr: 'Smartphones' },
      photoUrls: [],
    });
    expect(res.body.id).toBeTypeOf('string');
    // The author is never exposed on the wire.
    expect(res.body).not.toHaveProperty('authorUserId');
  });

  it('geocodes the postal code on write', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body())
      .expect(201);

    const row = await prisma.demande.findUniqueOrThrow({ where: { id: res.body.id } });
    // 69003 is central Lyon. Loose bounds so a BAN wording change cannot break
    // this, tight enough that null or a wrong country fails.
    expect(row.lat).toBeGreaterThan(45);
    expect(row.lat).toBeLessThan(46.5);
    expect(row.lng).toBeGreaterThan(4);
    expect(row.lng).toBeLessThan(5.5);
  });

  it('still publishes when the postal code cannot be geocoded', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body({ postalCode: '99999' }))
      .expect(201);

    const row = await prisma.demande.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });

  it('rejects a budget mode demande with no budget, in French', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body({ mode: 'BUDGET' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.budgetCents).toBe('Indiquez votre budget.');
  });

  it('refuses an unknown category with a French 422', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      // Must be a well-formed v4 UUID that does not exist, so it passes zod and
      // reaches the lookup. zod 4.4.3's .uuid() enforces RFC 4122 version and
      // variant bits, so an all-1s UUID would 400 in validation and never test
      // the 422 path at all.
      .send(body({ categoryId: '11111111-1111-4111-8111-111111111111' }));

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Cette catégorie est introuvable.');
  });

  it('rejects a malformed category id in validation, before the lookup', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body({ categoryId: 'not-a-uuid' }));

    expect(res.status).toBe(400);
    expect(res.body.error.fields.categoryId).toBe('Choisissez une catégorie.');
  });

  it('refuses to publish when client mode is disabled', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ repairerEnabled: true, clientEnabled: false })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Activez le mode client pour publier une demande.');
  });

  it('lists only the caller own demandes, newest first', async () => {
    const mine = await signUp(app);
    const other = await signUp(app);
    createdEmails.push(mine.email, other.email);

    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', other.cookie)
      .send(body({ title: 'Demande de quelqu un d autre' }))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', mine.cookie)
      .send(body({ title: 'Ma première demande' }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', mine.cookie)
      .send(body({ title: 'Ma seconde demande' }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', mine.cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Ma seconde demande');
    expect(res.body.map((d: { title: string }) => d.title)).not.toContain(
      'Demande de quelqu un d autre',
    );
    expect(res.body[0]).toMatchObject({
      categoryLabelFr: 'Smartphones',
      offerCount: 0,
      status: 'OPEN',
    });
  });

  it('returns a single demande to its author', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
  });

  it('hides another author demande behind a 404, not a 403', async () => {
    const mine = await signUp(app);
    const other = await signUp(app);
    createdEmails.push(mine.email, other.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', other.cookie)
      .send(body())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', mine.cookie);

    // 404 rather than 403 so ids are not enumerable.
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
  });

  it('never returns a soft-deleted demande', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send(body())
      .expect(201);
    await prisma.demande.update({
      where: { id: created.body.id },
      data: { deletedAt: new Date() },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', cookie)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('returns a French 404 for a malformed id without leaking database errors', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/not-a-uuid-at-all')
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Ressource introuvable.');
    // Ensure no English database error leaks through.
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input|syntax|uuid|prisma/i);
  });

  it('shows other authors OPEN demandes in the réparateur feed, never your own', async () => {
    const author = await signUpRepairer(app);
    const other = await signUpRepairer(app);
    createdEmails.push(author.email, other.email);

    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: 'Ma propre demande' }))
      .expect(201);

    const feed = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', other.cookie)
      .expect(200);

    const titles = feed.body.map((d: { title: string }) => d.title);
    expect(titles).toContain('Ma propre demande');

    // The same feed, seen by the author, must exclude their own demande.
    const own = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', author.cookie)
      .expect(200);
    expect(own.body.map((d: { title: string }) => d.title)).not.toContain('Ma propre demande');
  });

  it('refuses a plain client requesting the feed with the réparateur-mode message', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Activez le mode réparateur pour proposer une offre.');
  });

  it('excludes soft-deleted and non-OPEN demandes from the feed', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const deleted = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: 'Demande supprimée' }))
      .expect(201);
    const closed = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: 'Demande fermée' }))
      .expect(201);

    await prisma.demande.update({
      where: { id: deleted.body.id },
      data: { deletedAt: new Date() },
    });
    await prisma.demande.update({
      where: { id: closed.body.id },
      data: { status: 'IN_PROGRESS' },
    });

    const feed = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', pro.cookie)
      .expect(200);

    const titles = feed.body.map((d: { title: string }) => d.title);
    expect(titles).not.toContain('Demande supprimée');
    expect(titles).not.toContain('Demande fermée');
  });

  it('reports hasMyOffer so the feed can mark demandes already bid on', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: 'Demande à chiffrer' }))
      .expect(201);

    const before = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', pro.cookie)
      .expect(200);
    expect(before.body.find((d: { id: string }) => d.id === created.body.id).hasMyOffer).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', pro.cookie)
      .send({
        priceCents: 8900,
        delayHours: 24,
        // CF-31: « Aucune ». A NONE réparateur is refused any garantie.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'HOME',
        acceptsParcel: false,
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', pro.cookie)
      .expect(200);
    const row = after.body.find((d: { id: string }) => d.id === created.body.id);
    expect(row.hasMyOffer).toBe(true);
    expect(row.offerCount).toBe(1);
  });

  it('lets a réparateur read an OPEN demande they did not author', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('still hides a non-OPEN demande from a réparateur', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);
    await prisma.demande.update({
      where: { id: created.body.id },
      data: { status: 'IN_PROGRESS' },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(404);

    // The author can still read it. Widening the read for réparateurs must not
    // narrow it for the person who owns it.
    await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', author.cookie)
      .expect(200);
  });

  it('gates OPEN demande reads on repairerEnabled, not just authentication', async () => {
    const author = await signUp(app);
    const client = await signUp(app);
    createdEmails.push(author.email, client.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);

    // A plain client cannot read another client's OPEN demande.
    await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', client.cookie)
      .expect(404);

    // Enable réparateur mode for the same account.
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', client.cookie)
      .send({ repairerEnabled: true })
      .expect(200);

    // Now they can read it.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${created.body.id}`)
      .set('Cookie', client.cookie)
      .expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('counts SENT offers on /demandes/mine, and a withdrawal decrements it', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', pro.cookie)
      .send({
        priceCents: 8900,
        delayHours: 24,
        // CF-31: « Aucune ». A NONE réparateur is refused any garantie.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'HOME',
        acceptsParcel: false,
      })
      .expect(201);

    const withOffer = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect(withOffer.body.find((d: { id: string }) => d.id === created.body.id).offerCount).toBe(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offer.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    const afterWithdraw = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    // A withdrawn offer must not inflate "N offres reçues".
    expect(
      afterWithdraw.body.find((d: { id: string }) => d.id === created.body.id).offerCount,
    ).toBe(0);
  });

  it('excludes soft-deleted offers from the count', async () => {
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', pro.cookie)
      .send({
        priceCents: 8900,
        delayHours: 24,
        // CF-31: « Aucune ». A NONE réparateur is refused any garantie.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'HOME',
        acceptsParcel: false,
      })
      .expect(201);

    const withOffer = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect(withOffer.body.find((d: { id: string }) => d.id === created.body.id).offerCount).toBe(1);

    // Soft-delete the offer (admin/moderation removal). Note this leaves status
    // as SENT, which is precisely the case where counting it would make the
    // tally disagree with the list - a soft-deleted offer is invisible everywhere
    // else, so including it in offerCount would show "1 offre reçue" with no
    // visible offer to open.
    await prisma.offer.update({
      where: { id: offer.body.id },
      data: { deletedAt: new Date() },
    });

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect(
      afterDelete.body.find((d: { id: string }) => d.id === created.body.id).offerCount,
    ).toBe(0);
  });

  it('counts one offer, not two, after a réparateur adjusts their price', async () => {
    // Withdraw-and-re-offer now leaves two rows. offerCount must keep meaning
    // "offers on the table", or the home tab would say "2 offres reçues" for one
    // réparateur while the Offres screen shows one live offer and one retirée.
    const author = await signUp(app);
    const pro = await signUpRepairer(app);
    createdEmails.push(author.email, pro.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body())
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', pro.cookie)
      .send({
        priceCents: 8900,
        delayHours: 24,
        // CF-31: « Aucune ». A NONE réparateur is refused any garantie.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'HOME',
        acceptsParcel: false,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${first.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', pro.cookie)
      .send({
        priceCents: 7500,
        delayHours: 24,
        // CF-31: « Aucune ». A NONE réparateur is refused any garantie.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'HOME',
        acceptsParcel: false,
      })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/demandes/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect(mine.body.find((d: { id: string }) => d.id === created.body.id).offerCount).toBe(1);
  });

  it('accepts a demande attached to a top-level category', async () => {
    // Spec §2: any node is selectable. His « Autres » has no children at all,
    // so a parent must be a valid destination or that category is unusable.
    const parent = await prisma.category.findFirstOrThrow({ where: { slug: 'autres' } });
    const client = await signUp(app);
    createdEmails.push(client.email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send(body({ categoryId: parent.id }))
      .expect(201);

    expect(res.body.category.slug).toBe('autres');
  });

  it('refuses a category whose parent is inactive, with the same French 422', async () => {
    const parent = await prisma.category.create({
      data: { slug: 'tmp-parent-off', labelFr: 'Parent désactivé', sortOrder: 98, active: false },
    });
    const child = await prisma.category.create({
      data: {
        slug: 'tmp-child-on',
        labelFr: 'Enfant actif',
        sortOrder: 1,
        active: true,
        parentId: parent.id,
      },
    });
    const client = await signUp(app);
    createdEmails.push(client.email);

    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', client.cookie)
        .send(body({ categoryId: child.id }));

      expect(res.status).toBe(422);
      // One message for every unusable category. Distinguishing why would leak
      // taxonomy state for no user benefit.
      expect(res.body.error.message).toBe('Cette catégorie est introuvable.');
    } finally {
      // Delete any demande first: if the assertion above ever regresses to 201,
      // a demande points at tmp-child-on and ON DELETE RESTRICT would make the
      // category delete fail, stranding fixtures in the live taxonomy.
      await prisma.demande.deleteMany({ where: { categoryId: { in: [child.id, parent.id] } } });
      await prisma.category.delete({ where: { id: child.id } });
      await prisma.category.delete({ where: { id: parent.id } });
    }
  });

  it('orders the feed nearest first once the réparateur is located', async () => {
    // The point of piece D. This sort has existed since Étape 4a and had never
    // executed, because a réparateur's coordinates were written only by their
    // first offer.
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    // Unique per run: the feed is the whole shared database, so absolute
    // positions are meaningless and only the relative order of these three is.
    const tag = Math.random().toString(36).slice(2, 8);
    const near = `Proximité ${tag} Lyon`;
    const far = `Proximité ${tag} Lille`;
    const unlocated = `Proximité ${tag} nulle part`;

    for (const [title, postalCode] of [
      [far, '59000'],
      [near, '69003'],
      [unlocated, '99999'],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title, postalCode }))
        .expect(201);
    }

    // Before locating the viewer, the fallback is newest first, which is the
    // reverse of the insertion order above.
    const before = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', viewer.cookie)
      .expect(200);
    const beforeOrder = before.body
      .map((d: { title: string }) => d.title)
      .filter((t: string) => t.includes(tag));
    expect(beforeOrder).toEqual([unlocated, near, far]);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', viewer.cookie)
      .send({ postalCode: '69003' })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed')
      .set('Cookie', viewer.cookie)
      .expect(200);
    const afterOrder = after.body
      .map((d: { title: string }) => d.title)
      .filter((t: string) => t.includes(tag));

    // Lyon before Lille, and the demande with no coordinates last, so a missing
    // distance never masquerades as proximity.
    expect(afterOrder).toEqual([near, far, unlocated]);

    const located = after.body.find((d: { title: string }) => d.title === near);
    expect(located.distanceKm).not.toBeNull();
    expect(located.distanceKm).toBeLessThan(20);
    const distant = after.body.find((d: { title: string }) => d.title === far);
    expect(distant.distanceKm).toBeGreaterThan(300);
    const nowhere = after.body.find((d: { title: string }) => d.title === unlocated);
    expect(nowhere.distanceKm).toBeNull();
  });

  it('narrows the feed to demandes matching q on the title', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    // The feed is the whole shared database, so a unique token is what makes an
    // absolute assertion legitimate here: it narrows the corpus to these rows.
    const tag = Math.random().toString(36).slice(2, 8);
    const hit = `Recherche ${tag} trouvable`;
    const miss = `Recherche autrechose introuvable`;

    for (const title of [hit, miss]) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title }))
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([hit]);
  });

  it('matches q on brand and on the category label, not only the title', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const title = `Recherche champs ${tag}`;
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title, brand: `Marque${tag}` }))
      .expect(201);

    // brand
    const byBrand = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=Marque${tag}`)
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(byBrand.body.map((d: { title: string }) => d.title)).toEqual([title]);

    // category label. The fixture category is 'smartphone' / « Smartphones »,
    // so this cannot be narrowed by tag and is asserted by inclusion instead.
    const byCategory = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed?q=Smartphones')
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(byCategory.body.map((d: { title: string }) => d.title)).toContain(title);
  });

  it('matches q case-insensitively', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const title = `Recherche CASSE ${tag.toUpperCase()}`;
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag.toLowerCase()}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([title]);
  });

  /**
   * The important one. Search must narrow what the feed already permits and
   * must never widen it: not your own demandes, not soft-deleted ones, not
   * non-OPEN ones. A q clause written as a sibling of those filters ANDs
   * correctly; written as part of their OR it would leak.
   */
  it('never widens visibility: q matches nothing it was not already allowed to see', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const mine = `Recherche ${tag} la mienne`;
    const cancelled = `Recherche ${tag} annulee`;
    const deleted = `Recherche ${tag} supprimee`;
    const visible = `Recherche ${tag} visible`;

    // Authored BY the viewer, so it must never appear in the viewer's own feed.
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', viewer.cookie)
      .send(body({ title: mine }))
      .expect(201);

    for (const title of [cancelled, deleted, visible]) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title }))
        .expect(201);
    }
    await prisma.demande.updateMany({
      where: { title: cancelled },
      data: { status: 'CANCELLED' },
    });
    await prisma.demande.updateMany({
      where: { title: deleted },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([visible]);
  });

  it('rejects a malformed q with the French envelope', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${'a'.repeat(121)}`)
      .set('Cookie', viewer.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.q).toBe('Recherche trop longue.');
  });

  it('ignores an empty q rather than matching nothing', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const title = `Recherche vide ${tag}`;
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title }))
      .expect(201);

    // A cleared search field sends q=, which trims to ''. Falsy, so no clause
    // is added and the full feed comes back rather than nothing.
    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed?q=')
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toContain(title);
  });

  /**
   * A demande may attach to any node, parent or leaf, so filtering by a parent
   * that did not include its children would make the filter look broken:
   * « Électronique » would return nothing while « Smartphones » returned rows.
   */
  it('matches a demande filed on a child when filtering by its parent category', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const parent = await prisma.category.findFirstOrThrow({ where: { slug: 'electronique' } });
    const other = await prisma.category.findFirstOrThrow({ where: { slug: 'mobilite' } });

    const tag = Math.random().toString(36).slice(2, 8);
    const child = `Categorie ${tag} enfant`;
    const elsewhere = `Categorie ${tag} ailleurs`;

    // categoryId defaults to the 'smartphone' child via body().
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: child }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: elsewhere, categoryId: other.id }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}&categoryId=${parent.id}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([child]);
  });

  it('matches a demande filed on a leaf when filtering by that leaf', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const leaf = await prisma.category.findFirstOrThrow({ where: { slug: 'smartphone' } });

    const tag = Math.random().toString(36).slice(2, 8);
    const title = `Categorie ${tag} feuille`;
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}&categoryId=${leaf.id}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([title]);
  });

  it('returns an empty feed for a well-formed categoryId that matches nothing', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    // A valid uuid naming no category is not an error, it is zero results.
    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed?categoryId=11111111-1111-4111-8111-111111111111')
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('rejects a categoryId that is not a uuid with the French envelope', async () => {
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/demandes/feed?categoryId=smartphone')
      .set('Cookie', viewer.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.categoryId).toBe('Catégorie invalide.');
  });

  /**
   * The piece D regression guard. An absent sort must keep the nearest-first
   * ordering, so this asserts the same thing the existing
   * "orders the feed nearest first" test does, but through the new code path.
   */
  it('preserves nearest-first ordering when sort is absent', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const near = `Tri ${tag} Lyon`;
    const far = `Tri ${tag} Lille`;

    for (const [title, postalCode] of [
      [near, '69003'],
      [far, '59000'],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title, postalCode }))
        .expect(201);
    }

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', viewer.cookie)
      .send({ postalCode: '69003' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([near, far]);
  });

  it('orders newest first on sort=recentes even when the réparateur is located', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const near = `Tri ${tag} Lyon`;
    const far = `Tri ${tag} Lille`;

    // If far were created first, newest-first would put near before far, which
    // is also the proximity order. So create near first: the two orders differ.
    for (const [title, postalCode] of [
      [near, '69003'],
      [far, '59000'],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title, postalCode }))
        .expect(201);
    }

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', viewer.cookie)
      .send({ postalCode: '69003' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}&sort=recentes`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    // far is newest. Proximity would have said near first, so this pins that
    // an explicit sort overrides the located default.
    expect(res.body.map((d: { title: string }) => d.title)).toEqual([far, near]);
  });

  /**
   * An OFFERS-mode demande has no budget by construction. Sorting nulls first
   * would present "no budget stated" as "cheapest", which is a lie about price.
   */
  it('sorts by price ascending on sort=prix, with no budget last', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const cheap = `Tri ${tag} pas cher`;
    const dear = `Tri ${tag} cher`;
    const noBudget = `Tri ${tag} sans budget`;

    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: dear, mode: 'BUDGET', budgetCents: 25000 }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: noBudget, mode: 'OFFERS' }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', author.cookie)
      .send(body({ title: cheap, mode: 'BUDGET', budgetCents: 5000 }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}&sort=prix`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([cheap, dear, noBudget]);
  });

  /**
   * Spec §6.3: an explicit sort=distance from an unlocated réparateur degrades
   * to the base recency ordering rather than shuffling, because every
   * distanceKm is null and the comparator returns 0 throughout.
   */
  it('degrades sort=distance to recency when the réparateur has no coordinates', async () => {
    const viewer = await signUpRepairer(app);
    const author = await signUp(app);
    createdEmails.push(viewer.email, author.email);

    const tag = Math.random().toString(36).slice(2, 8);
    const first = `Tri ${tag} premiere`;
    const second = `Tri ${tag} seconde`;

    for (const title of [first, second]) {
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', author.cookie)
        .send(body({ title }))
        .expect(201);
    }

    // viewer is a réparateur who has never set a postal code.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/feed?q=${tag}&sort=distance`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    expect(res.body.map((d: { title: string }) => d.title)).toEqual([second, first]);
  });
});
