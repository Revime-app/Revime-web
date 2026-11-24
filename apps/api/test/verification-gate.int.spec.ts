import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('verification gates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];

  const publish = (cookie: string) =>
    request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', cookie)
      .send({
        categoryId,
        title: 'Test portail verification',
        description: 'Description suffisamment longue pour passer la validation du schéma.',
        parts: 'UNKNOWN',
        mode: 'OFFERS',
        locationLabel: 'Lyon',
        postalCode: '69003',
      });

  const newUser = async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, cookie };
  };

  const setLevel = (userId: string, verificationLevel: 'BASIC' | 'IDENTITY' | 'BUSINESS') =>
    prisma.profile.update({
      where: { userId },
      data: { verificationLevel, verifiedAt: new Date() },
    });

  /** Enabling réparateur mode. CF4-01: no longer identity-gated; the offer is. */
  const becomeRepairer = (cookie: string) =>
    request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ repairerEnabled: true, activeMode: 'REPAIRER' });

  const sendOffer = (demandeId: string, cookie: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/demandes/${demandeId}/offers`)
      .set('Cookie', cookie)
      .send({
        priceCents: 8900,
        delayHours: 48,
        // CF-31: « Aucune ». This file's réparateurs sit at NONE or BASIC by design -
        // that is what it tests - so any garantie would 403 for a reason that has
        // nothing to do with the gate under test, masking it.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        acceptsParcel: false,
      });

  /** A published demande to bid on, authored by someone who is not the bidder. */
  const aDemandeToBidOn = async (): Promise<string> => {
    const author = await newUser();
    const created = await publish(author.cookie).expect(201);
    return created.body.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow({
      where: { active: true, parentId: { not: null } },
    });
    categoryId = category.id;
  });

  afterEach(() => {
    delete process.env.VERIFICATION_GATE_ENABLED;
    delete process.env.IDENTITY_GATE_ENABLED;
  });

  afterAll(async () => {
    delete process.env.VERIFICATION_GATE_ENABLED;
    delete process.env.IDENTITY_GATE_ENABLED;
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('lets an unverified account publish while the flag is off', async () => {
    // THE production configuration. The flag ships false because the client's
    // installed build has no verification screen, so this is the path that is
    // actually live and it must be the one that is proven.
    delete process.env.VERIFICATION_GATE_ENABLED;
    const { cookie } = await newUser();

    await publish(cookie).expect(201);
  });

  it('treats any value other than the literal "true" as off', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'false';
    const { cookie } = await newUser();
    await publish(cookie).expect(201);

    process.env.VERIFICATION_GATE_ENABLED = '1';
    const { cookie: second } = await newUser();
    await publish(second).expect(201);
  });

  it('reports the gate state on /users/me, so the app never has to guess it', async () => {
    const { cookie } = await newUser();
    const me = () =>
      request(app.getHttpServer()).get('/api/v1/users/me').set('Cookie', cookie).expect(200);

    delete process.env.VERIFICATION_GATE_ENABLED;
    expect((await me()).body.verificationRequired).toBe(false);

    process.env.VERIFICATION_GATE_ENABLED = 'true';
    expect((await me()).body.verificationRequired).toBe(true);

    // The app gates its own UI on this field rather than on the level, because the
    // gate ships off: a client gating on level alone would refuse to publish while
    // the server was still accepting it.
    process.env.VERIFICATION_GATE_ENABLED = 'false';
    expect((await me()).body.verificationRequired).toBe(false);
  });

  it('reports the two channel flags separately, so the screen can show which half is left', async () => {
    const { id, cookie } = await newUser();

    const before = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(before.body.emailVerified).toBe(false);
    expect(before.body.phoneVerified).toBe(false);

    await prisma.user.update({
      where: { id },
      data: { emailVerified: true, phoneVerifiedAt: new Date() },
    });

    const after = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(after.body.emailVerified).toBe(true);
    // A boolean, not the timestamp: the app cares whether, not when.
    expect(after.body.phoneVerified).toBe(true);
  });

  it('refuses publishing at level NONE while the flag is on', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';
    const { cookie } = await newUser();

    const res = await publish(cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe(
      'Confirmez votre e-mail ou votre téléphone pour publier une demande.',
    );
  });

  it('allows publishing at level BASIC while the flag is on', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';
    const { id, cookie } = await newUser();
    await setLevel(id, 'BASIC');

    await publish(cookie).expect(201);
  });

  it('allows publishing at IDENTITY, so the gate is a floor and not an equality', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';
    const { id, cookie } = await newUser();
    await setLevel(id, 'IDENTITY');

    await publish(cookie).expect(201);
  });

  it('refuses sending an offer at level NONE while the flag is on', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';

    // An author who can publish, so the demande exists to bid on.
    const author = await newUser();
    await setLevel(author.id, 'BASIC');
    const created = await publish(author.cookie).expect(201);

    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', cookie)
      .send({
        priceCents: 8900,
        delayHours: 48,
        // CF-31: « Aucune ». This file's réparateurs sit at NONE or BASIC by design -
        // that is what it tests - so any garantie would 403 for a reason that has
        // nothing to do with the gate under test, masking it.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        acceptsParcel: false,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      'Confirmez votre e-mail ou votre téléphone pour envoyer une offre.',
    );
  });

  it('allows sending an offer at BASIC while the flag is on', async () => {
    process.env.VERIFICATION_GATE_ENABLED = 'true';

    const author = await newUser();
    await setLevel(author.id, 'BASIC');
    const created = await publish(author.cookie).expect(201);

    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);
    const repairer = await prisma.user.findUniqueOrThrow({ where: { email } });
    await setLevel(repairer.id, 'BASIC');

    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${created.body.id}/offers`)
      .set('Cookie', cookie)
      .send({
        priceCents: 8900,
        delayHours: 48,
        // CF-31: « Aucune ». This file's réparateurs sit at NONE or BASIC by design -
        // that is what it tests - so any garantie would 403 for a reason that has
        // nothing to do with the gate under test, masking it.
        warrantyLabel: 'Aucune',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        acceptsParcel: false,
      })
      .expect(201);
  });

  /**
   * The client's own words are the authority here: « pour devenir réparateur […]
   * il devra obligatoirement passer au niveau 2 ». Publishing stays at BASIC.
   *
   * CF4-01: the gate now guards ACTING as a réparateur (sending an offer), not
   * enabling the mode - an unverified account must reach the verification screen
   * from réparateur mode. The offer gate covers the door concern.
   */
  describe('the IDENTITY gate on réparateur mode', () => {
    const OFFER_FR = 'Vérifiez votre identité pour envoyer une offre.';

    it('lets an account with no identity become a réparateur while the flag is off', async () => {
      // THE production configuration, and therefore the path that must be proven:
      // no grant path to IDENTITY exists yet, so an enforcing gate would lock out
      // every réparateur including the client.
      delete process.env.IDENTITY_GATE_ENABLED;
      const { cookie } = await newUser();

      await becomeRepairer(cookie).expect(200);
    });

    it('treats any value other than the literal "true" as off', async () => {
      process.env.IDENTITY_GATE_ENABLED = 'false';
      const { cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);

      process.env.IDENTITY_GATE_ENABLED = '1';
      const { cookie: second } = await newUser();
      await becomeRepairer(second).expect(200);
    });

    it('reports identityRequired on /users/me, so the app never has to guess it', async () => {
      const { cookie } = await newUser();
      const me = () =>
        request(app.getHttpServer()).get('/api/v1/users/me').set('Cookie', cookie).expect(200);

      delete process.env.IDENTITY_GATE_ENABLED;
      expect((await me()).body.identityRequired).toBe(false);

      process.env.IDENTITY_GATE_ENABLED = 'true';
      expect((await me()).body.identityRequired).toBe(true);

      process.env.IDENTITY_GATE_ENABLED = 'false';
      expect((await me()).body.identityRequired).toBe(false);
    });

    it('reports the two gates independently, since they are flipped on different days', async () => {
      // One waits on an EAS build, the other on a grant path. A single flag would
      // force them to move together.
      const { cookie } = await newUser();
      process.env.VERIFICATION_GATE_ENABLED = 'true';
      delete process.env.IDENTITY_GATE_ENABLED;

      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.verificationRequired).toBe(true);
      expect(res.body.identityRequired).toBe(false);
    });

    // CF4-01: the mode is no longer gated - enabling it unverified succeeds, and the
    // OFFER is what the identity gate refuses.
    it('lets an account at BASIC become a réparateur while the flag is on, then refuses its offer', async () => {
      process.env.IDENTITY_GATE_ENABLED = 'true';
      const demandeId = await aDemandeToBidOn();
      const { id, cookie } = await newUser();
      await setLevel(id, 'BASIC');

      await becomeRepairer(cookie).expect(200);
      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
      expect(profile.repairerEnabled).toBe(true);

      const res = await sendOffer(demandeId, cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe(OFFER_FR);
    });

    it('lets an account at IDENTITY become a réparateur while the flag is on', async () => {
      process.env.IDENTITY_GATE_ENABLED = 'true';
      const { id, cookie } = await newUser();
      await setLevel(id, 'IDENTITY');

      await becomeRepairer(cookie).expect(200);
    });

    it('refuses an offer from a réparateur who was already enabled at BASIC', async () => {
      // The load-bearing test. Gating only the door would grandfather in every
      // réparateur who exists today - the client's own account is repairerEnabled
      // at NONE - so the rule would be stated and never enforced.
      const demandeId = await aDemandeToBidOn();
      const { id, cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);
      await setLevel(id, 'BASIC');

      process.env.IDENTITY_GATE_ENABLED = 'true';
      const res = await sendOffer(demandeId, cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe(OFFER_FR);
    });

    it('lets a réparateur at IDENTITY send an offer while the flag is on', async () => {
      const demandeId = await aDemandeToBidOn();
      const { id, cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);
      await setLevel(id, 'IDENTITY');

      process.env.IDENTITY_GATE_ENABLED = 'true';
      await sendOffer(demandeId, cookie).expect(201);
    });

    it('lets a réparateur at BUSINESS send an offer, so the gate is a floor and not an equality', async () => {
      const demandeId = await aDemandeToBidOn();
      const { id, cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);
      await setLevel(id, 'BUSINESS');

      process.env.IDENTITY_GATE_ENABLED = 'true';
      await sendOffer(demandeId, cookie).expect(201);
    });

    it('still lets an already-enabled réparateur switch modes while the flag is on', async () => {
      // Gating activeMode would trap whoever is in réparateur mode when the flag
      // is flipped, with no way back to client mode.
      const { cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);

      process.env.IDENTITY_GATE_ENABLED = 'true';
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/modes')
        .set('Cookie', cookie)
        .send({ activeMode: 'CLIENT' })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/modes')
        .set('Cookie', cookie)
        .send({ activeMode: 'REPAIRER' })
        .expect(200);
    });

    it('names e-mail or phone first when both gates are on, since that is the nearer step', async () => {
      const demandeId = await aDemandeToBidOn();
      const { cookie } = await newUser();
      await becomeRepairer(cookie).expect(200);

      process.env.VERIFICATION_GATE_ENABLED = 'true';
      process.env.IDENTITY_GATE_ENABLED = 'true';
      const res = await sendOffer(demandeId, cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe(
        'Confirmez votre e-mail ou votre téléphone pour envoyer une offre.',
      );
    });
  });
});
