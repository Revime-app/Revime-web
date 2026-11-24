import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('offers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];

  const offerBody = (over: Record<string, unknown> = {}) => ({
    priceCents: 8900,
    delayHours: 24,
    // CF-31, 2026-08-25: « Aucune », NOT « 6 mois ». `signUpRepairer` lands at NONE and
    // `assertWarrantyAllowed` refuses any garantie below BUSINESS, so a real warranty
    // here 403s every one of this file's 48 offer POSTs. The rule has its own cases at
    // the bottom of this file, which is where a real warranty belongs. Do not restore one.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'HOME',
    acceptsParcel: false,
    comment: "Écran d'origine + batterie neuve.",
    ...over,
  });

  const demandeBody = () => ({
    categoryId,
    brand: 'Apple',
    model: 'iPhone 13',
    title: 'Écran iPhone 13 fissuré',
    description: "L'écran est fissuré en haut à droite et la batterie tient mal.",
    mode: 'OFFERS',
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
  });

  /** A client with one OPEN demande. Returns the demande id and the client cookie. */
  async function aDemande(): Promise<{ id: string; cookie: string }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send(demandeBody())
      .expect(201);
    return { id: res.body.id, cookie: client.cookie };
  }

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

  it('rejects an anonymous offer', async () => {
    const demande = await aDemande();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .send(offerBody());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a user who has not enabled réparateur mode', async () => {
    const demande = await aDemande();
    const client = await signUp(app);
    createdEmails.push(client.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', client.cookie)
      .send(offerBody());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Activez le mode réparateur pour proposer une offre.');
  });

  it('never touches réparateur geography, which the profile endpoint owns', async () => {
    const demande = await aDemande();
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: repairer.email } });

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    // Before piece D this same call wrote postalCode, lat and lng. The single
    // writer is PATCH /users/me/repairer and nothing else.
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.postalCode).toBeNull();
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
    expect(row.serviceAreaLabel).toBeNull();
  });

  it('creates an offer and returns the presented shape', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    expect(res.body).toMatchObject({
      priceCents: 8900,
      delayHours: 24,
      // CF-31: what `offerBody()` sends, which is « Aucune » for a NONE réparateur.
      warrantyLabel: 'Aucune',
      travel: 'HOME',
      verifiedBadge: null,
    });
    expect(res.body.id).toBeTypeOf('string');
    // Piece 1 deliberately ADDED this field: it is what the offer card's « Contacter »
    // addresses a conversation to, and `OfferDto.repairerUserId`'s own comment argues
    // why an opaque uuid behind the session guard is safe. This assertion required its
    // ABSENCE and was left stale when piece 1 widened the DTO, so it had been failing
    // on `main` ever since -- neither piece 1 nor piece 2 re-ran this file. Inverted
    // rather than deleted, so a future change that drops the field fails here.
    expect(res.body.repairerUserId).toBeTypeOf('string');
    expect(res.body.repairerName).toBeTypeOf('string');
    // Strict check: `verifiedBadge` must fail CLOSED. If the réparateur's Profile
    // is null (or its verificationLevel is missing), the trust signal must default
    // to no badge, never to one.
    expect(res.body.verifiedBadge).toBeNull();
    // The boolean it replaced must be gone rather than shipped alongside it: two
    // sources for one trust signal can disagree, and the badge is the one the
    // client sees.
    expect(res.body).not.toHaveProperty('verified');
  });

  it('an offer from a réparateur with no history carries null rating and zero counts', async () => {
    // Spec §7: rating is null and NOT 0, because a zero renders as a catastrophic
    // rating rather than an absent one. This is the state of every réparateur in
    // production on the day this ships, so it is the case that must be right.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].rating).toBeNull();
    expect(res.body[0].reviewCount).toBe(0);
    expect(res.body[0].repairCount).toBe(0);
  });

  it('refuses a second live offer with 409, not a 500 from the constraint', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 7500 }));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Vous avez déjà proposé une offre sur cette demande.');
  });

  it('refuses an offer on your own demande', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', client.cookie)
      .send({ repairerEnabled: true })
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send(demandeBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', client.cookie)
      .send(offerBody());

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Vous ne pouvez pas proposer une offre sur votre demande.');
  });

  it('404s on a demande that does not exist', async () => {
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/demandes/11111111-1111-4111-8111-111111111111/offers')
      .set('Cookie', pro.cookie)
      .send(offerBody());
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
  });

  it('withdraw then re-offer leaves two rows, and the withdrawn one keeps its price', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${first.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    // The client asked for the trail, so the re-offer is a NEW row and the old
    // one keeps the price it was withdrawn at. Reviving would overwrite both.
    expect(again.body.id).not.toBe(first.body.id);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: pro.email } });
    const rows = await prisma.offer.findMany({
      where: { demandeId: demande.id, repairerUserId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: first.body.id, priceCents: 8900, status: 'WITHDRAWN' });
    expect(rows[1]).toMatchObject({ id: again.body.id, priceCents: 7500, status: 'SENT' });
  });

  it('shows the author both the withdrawn offer and its replacement', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${first.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const statusByPrice = Object.fromEntries(
      res.body.map((o: { priceCents: number; status: string }) => [o.priceCents, o.status]),
    );
    expect(statusByPrice).toEqual({ 8900: 'WITHDRAWN', 7500: 'SENT' });
  });

  it('lets a réparateur offer again after their live offer is soft-deleted', async () => {
    // The only test of the deletedAt term in the partial index predicate.
    // Without that term the soft-deleted row keeps occupying the live slot and a
    // moderation removal becomes an invisible lifetime ban on this demande.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);

    await prisma.offer.update({
      where: { id: first.body.id },
      data: { deletedAt: new Date() },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    // The author sees only the replacement: soft-deleted rows stay hidden.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].priceCents).toBe(7500);
  });

  it('keeps every revision when a réparateur adjusts price three times', async () => {
    // Guards an off-by-one where only the first revision survives.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    for (const priceCents of [8900, 7500, 6500]) {
      const offer = await request(app.getHttpServer())
        .post(`/api/v1/demandes/${demande.id}/offers`)
        .set('Cookie', pro.cookie)
        .send(offerBody({ priceCents }))
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/offers/${offer.body.id}`)
        .set('Cookie', pro.cookie)
        .expect(204);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ priceCents: 6000 }))
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: pro.email } });
    const rows = await prisma.offer.findMany({
      where: { demandeId: demande.id, repairerUserId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.priceCents)).toEqual([8900, 7500, 6500, 6000]);
    expect(rows.filter((r) => r.status === 'SENT')).toHaveLength(1);
  });

  it('refuses to withdraw someone else offer, with 404 rather than 403', async () => {
    const demande = await aDemande();
    const mine = await signUpRepairer(app);
    const other = await signUpRepairer(app);
    createdEmails.push(mine.email, other.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', mine.cookie)
      .send(offerBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/offers/${created.body.id}`)
      .set('Cookie', other.cookie);

    // 404, so offer ids are not enumerable.
    expect(res.status).toBe(404);
  });

  it('refuses to withdraw an offer on a soft-deleted demande', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    // Soft-delete the demande
    await prisma.demande.update({
      where: { id: demande.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/offers/${created.body.id}`)
      .set('Cookie', pro.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
  });

  it('lists only your own offers, newest first, with the demande title', async () => {
    const a = await aDemande();
    const b = await aDemande();
    const mine = await signUpRepairer(app);
    const other = await signUpRepairer(app);
    createdEmails.push(mine.email, other.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${a.id}/offers`)
      .set('Cookie', other.cookie)
      .send(offerBody({ priceCents: 1000 }))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${a.id}/offers`)
      .set('Cookie', mine.cookie)
      .send(offerBody({ priceCents: 2000 }))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${b.id}/offers`)
      .set('Cookie', mine.cookie)
      .send(offerBody({ priceCents: 3000 }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/offers/mine')
      .set('Cookie', mine.cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0].priceCents).toBe(3000);
    expect(res.body.map((o: { priceCents: number }) => o.priceCents)).not.toContain(1000);
    expect(res.body[0].demandeTitle).toBe('Écran iPhone 13 fissuré');
    expect(res.body[0].status).toBe('SENT');
  });

  it('keeps a withdrawn offer in your own list, marked WITHDRAWN', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${created.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/api/v1/offers/mine')
      .set('Cookie', pro.cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('WITHDRAWN');
  });

  it('returns every SENT offer to the demande author, with distance', async () => {
    const demande = await aDemande();
    const a = await signUpRepairer(app);
    const b = await signUpRepairer(app);
    createdEmails.push(a.email, b.email);

    // Give each réparateur their geography through the owning endpoint.
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', a.cookie)
      .send({ postalCode: '69003' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .set('Cookie', b.cookie)
      .send({ postalCode: '75001' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', a.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', b.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    // Both réparateurs geocoded, and the demande is in Lyon, so the Paris one
    // must be materially further away.
    const lyon = res.body.find((o: { priceCents: number }) => o.priceCents === 8900);
    const paris = res.body.find((o: { priceCents: number }) => o.priceCents === 7500);
    expect(lyon.distanceKm).toBeLessThan(50);
    expect(paris.distanceKm).toBeGreaterThan(300);
    // Stale for the same reason as the assertion in « creates an offer and returns the
    // presented shape ». See the comment there.
    expect(res.body[0].repairerUserId).toBeTypeOf('string');
  });

  it('keeps a withdrawn offer in the author view, marked WITHDRAWN', async () => {
    // The client asked for the trail: a réparateur changing price withdraws and
    // re-offers, so the old offer stays visible as « Offre retirée » rather
    // than vanishing.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${created.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(created.body.id);
    expect(res.body[0].status).toBe('WITHDRAWN');
  });

  it('marks a live offer SENT alongside a withdrawn one', async () => {
    const demande = await aDemande();
    const quitter = await signUpRepairer(app);
    const stayer = await signUpRepairer(app);
    createdEmails.push(quitter.email, stayer.email);

    const gone = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', quitter.cookie)
      .send(offerBody({ priceCents: 5000 }))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', stayer.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${gone.body.id}`)
      .set('Cookie', quitter.cookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);
    expect(res.body).toHaveLength(2);
    const statusByPrice = Object.fromEntries(
      res.body.map((o: { priceCents: number; status: string }) => [o.priceCents, o.status]),
    );
    expect(statusByPrice).toEqual({ 5000: 'WITHDRAWN', 8900: 'SENT' });
  });

  it('still omits a soft-deleted offer from the author view', async () => {
    // The two filters are independent and only one of them was dropped.
    // WITHDRAWN is the réparateur's own act and stays visible; deletedAt is a
    // moderation removal and must not reappear as history.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);
    await prisma.offer.update({
      where: { id: created.body.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);
    expect(res.body).toHaveLength(0);
  });

  it('BLIND BIDDING: a réparateur bidding on a demande cannot read the offers on it', async () => {
    const demande = await aDemande();
    const a = await signUpRepairer(app);
    const b = await signUpRepairer(app);
    createdEmails.push(a.email, b.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', a.cookie)
      .send(offerBody({ priceCents: 8900 }))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', b.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    // b is a legitimate participant on this demande and still must not see a's
    // price. If they could, the comparison becomes a race to a number.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', b.cookie);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('8900');
  });

  it('hides another client demande offers behind a 404', async () => {
    const demande = await aDemande();
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', stranger.cookie);
    expect(res.status).toBe(404);
  });

  it.each([
    ['NONE', null],
    ['BASIC', null],
    ['IDENTITY', 'IDENTITY'],
    ['BUSINESS', 'BUSINESS'],
  ] as const)('a réparateur at level %s reports verifiedBadge=%s', async (level, expected) => {
    // aDemande() returns { id, cookie }, where cookie is the demande author's:
    // listForDemande is author-only, so that is the session that can read it.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: pro.email } });
    await prisma.profile.update({
      where: { userId: user.id },
      data: { verificationLevel: level },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].verifiedBadge).toBe(expected);
  });

  it('never derives « Professionnel vérifié » from the self-declared kind', async () => {
    // Spec §6.2. `RepairerProfile.kind` is what the réparateur ticked about
    // himself; the badge is what someone checked. A PRO at NONE therefore gets
    // no badge, which is the fabricated-badge route this project has a
    // client-accepted rule against.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: pro.email } });
    await prisma.repairerProfile.update({
      where: { userId: user.id },
      data: { kind: 'PRO' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body[0].verifiedBadge).toBeNull();
  });

  // CF-31 - « La garantie doit être réservée aux professionnels. Un réparateur
  // particulier ne doit donc pas pouvoir proposer une garantie professionnelle. »
  //
  // 🛑 These four cases have NEVER BEEN RUN. `test:unit` excludes every `*.int.spec.ts`
  // and this repo has no test database - `npm run test -w @revime/api` writes to
  // PRODUCTION - so they are written to be correct-by-reading and to run for whoever
  // next has a safe database. The rule's own logic is covered by a gate that DOES run:
  // `offer-schemas.spec.ts` unit-tests `mayOfferWarranty`, `warrantyLabelFor` and
  // `hasWarranty`, and `offers.service.ts` composes those rather than restating them.
  it('refuses a garantie from a réparateur who is not a verified professional', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      // `signUpRepairer` lands at NONE, which is where every live account sits.
      .send(offerBody({ warrantyLabel: '12 mois' }))
      .expect(403);

    expect(res.body.error.message).toBe(
      'La garantie est réservée aux professionnels avec une entreprise vérifiée.',
    );
  });

  it('accepts « Aucune » from the same réparateur, so the refusal is the garantie and not the offer', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ warrantyLabel: 'Aucune' }))
      .expect(201);

    expect(res.body.warrantyLabel).toBe('Aucune');
  });

  it('accepts a garantie once the réparateur is BUSINESS', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: pro.email } });
    // Written directly rather than through promoteToBusinessIfEligible, which needs a
    // verified BusinessVerification row. `business.int.spec.ts` covers the real grant
    // path end to end; this case is about what the level then permits.
    await prisma.profile.update({
      where: { userId: user.id },
      data: { verificationLevel: 'BUSINESS' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody({ warrantyLabel: '12 mois' }))
      .expect(201);

    expect(res.body.warrantyLabel).toBe('12 mois');
  });

  it('suppresses a garantie already stored against a non-professional, on READ', async () => {
    // The half that makes the rule true of rows that already exist. 44 of the 47 offers
    // in production carry a garantie written before the rule, because the offer form
    // defaulted to « 3 mois » - so a write-only rule would leave a client comparing
    // « Garantie 3 mois » from a particulier. Nothing is migrated; presentation refuses.
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    // Bypasses the service deliberately: this reproduces a LEGACY row, which is exactly
    // a value the create path would no longer let in.
    await prisma.offer.update({
      where: { id: created.body.id },
      data: { warrantyLabel: '12 mois' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', demande.cookie)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].warrantyLabel).toBe('Aucune');
  });

  it('refuses to withdraw an offer that is already withdrawn', async () => {
    const demande = await aDemande();
    const pro = await signUpRepairer(app);
    createdEmails.push(pro.email);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', pro.cookie)
      .send(offerBody())
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offer.body.id}`)
      .set('Cookie', pro.cookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offer.body.id}`)
      .set('Cookie', pro.cookie);

    // 422 rather than 404: the réparateur is looking at this offer in their own
    // list, so "Ressource introuvable" would be untrue.
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Cette offre ne peut plus être retirée.');
  });

  it('refuses to withdraw an offer while a payment is in flight on it', async () => {
    const demande = await aDemande();
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    const client = await prisma.demande.findUniqueOrThrow({
      where: { id: demande.id },
      select: { authorUserId: true },
    });
    const repairerRow = await prisma.user.findUniqueOrThrow({
      where: { email: repairer.email },
      select: { id: true },
    });

    // Written directly rather than through the checkout route, so this test
    // proves the withdraw guard alone and does not depend on Task 6.
    await prisma.commande.create({
      data: {
        demandeId: demande.id,
        offerId: offer.body.id,
        clientUserId: client.authorUserId,
        repairerUserId: repairerRow.id,
        delivery: 'WORKSHOP',
        repairCents: 8900,
        shippingCents: 0,
        protectionCents: 691,
        totalCents: 9591,
        status: 'PENDING_PAYMENT',
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offer.body.id}`)
      .set('Cookie', repairer.cookie);

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Cette offre ne peut plus être retirée.');

    const after = await prisma.offer.findUniqueOrThrow({ where: { id: offer.body.id } });
    expect(after.status).toBe('SENT');
  });

  it('allows withdrawal again once the payment attempt is abandoned', async () => {
    const demande = await aDemande();
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    const client = await prisma.demande.findUniqueOrThrow({
      where: { id: demande.id },
      select: { authorUserId: true },
    });
    const repairerRow = await prisma.user.findUniqueOrThrow({
      where: { email: repairer.email },
      select: { id: true },
    });

    await prisma.commande.create({
      data: {
        demandeId: demande.id,
        offerId: offer.body.id,
        clientUserId: client.authorUserId,
        repairerUserId: repairerRow.id,
        delivery: 'WORKSHOP',
        repairCents: 8900,
        shippingCents: 0,
        protectionCents: 691,
        totalCents: 9591,
        status: 'ABANDONED',
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offer.body.id}`)
      .set('Cookie', repairer.cookie)
      .expect(204);
  });

  it('raises OFFER_RECEIVED for the demande author, snapshotting the price and the name', async () => {
    const demande = await aDemande();
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody({ priceCents: 6500 }))
      .expect(201);

    const row = await prisma.notification.findFirstOrThrow({
      where: { demandeId: demande.id, type: 'OFFER_RECEIVED' },
    });

    // Addressed to the CLIENT in CLIENT mode: the author receives this wearing the client
    // hat whatever mode his app happens to be in.
    expect(row.mode).toBe('CLIENT');
    expect(row.amountCents).toBe(6500);
    expect(row.subject).toBe('Écran iPhone 13 fissuré');
    expect(row.actorName).toBeTruthy();
    expect(row.readAt).toBeNull();
  });
});
