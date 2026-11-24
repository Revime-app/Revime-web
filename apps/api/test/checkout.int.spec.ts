import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  __resetPaymentsGateway,
  FakePaymentsGateway,
  paymentsGateway,
} from '../src/payments/gateway.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';
import { protectionCentsFor, type ShippingQuoteDto } from '@revime/shared';
import { FakeShippingGateway, __registerBoxtalGateway, __resetShippingGateway, type LegOffer } from '../src/shipping/gateway.js';

describe('checkout', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];
  const saved: Record<string, string | undefined> = {};

  const offerBody = (over: Record<string, unknown> = {}) => ({
    priceCents: 8900,
    delayHours: 24,
    // CF-31: « Aucune ». These réparateurs are at NONE and a garantie is refused below
    // BUSINESS - see `offers.service.ts`'s `assertWarrantyAllowed`.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    // Default true: this file's tests exercise PARCEL checkout.
    acceptsParcel: true,
    ...over,
  });

  /** A client demande with one SENT offer on it. */
  async function anOfferedDemande(): Promise<{
    demandeId: string;
    offerId: string;
    clientCookie: string;
    repairerCookie: string;
  }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const demande = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send({
        categoryId,
        title: 'Écran iPhone 13 fissuré',
        description:
          "L'écran est fissuré en haut à droite et la batterie tient mal.",
        mode: 'OFFERS',
        locationLabel: 'Lyon 3e',
        postalCode: '69003',
      })
      .expect(201);

    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.body.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    return {
      demandeId: demande.body.id,
      offerId: offer.body.id,
      clientCookie: client.cookie,
      repairerCookie: repairer.cookie,
    };
  }

  async function anOfferWith(over: Record<string, unknown>): Promise<{
    offerId: string;
    clientCookie: string;
  }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const demande = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send({
        categoryId,
        title: 'Écran iPhone 13 fissuré',
        description:
          "L'écran est fissuré en haut à droite et la batterie tient mal.",
        mode: 'OFFERS',
        locationLabel: 'Lyon 3e',
        postalCode: '69003',
      })
      .expect(201);

    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.body.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody(over))
      .expect(201);

    return {
      offerId: offer.body.id,
      clientCookie: client.cookie,
    };
  }

  beforeAll(async () => {
    for (const k of [
      'PAYMENTS_ENABLED',
      'STRIPE_WEBHOOK_SECRET',
      'PUBLIC_API_URL',
      'STRIPE_DRIVER',
      'STRIPE_SECRET_KEY',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_p1';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    delete process.env.STRIPE_DRIVER; // fake gateway
    delete process.env.STRIPE_SECRET_KEY; // fake gateway needs no key
    __resetPaymentsGateway();

    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow({
      where: { slug: 'smartphone' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    __resetPaymentsGateway();
  });

  it('rejects an anonymous checkout', async () => {
    const { offerId } = await anOfferedDemande();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .send({ delivery: 'WORKSHOP' });
    expect(res.status).toBe(401);
  });

  it('creates a PENDING_PAYMENT commande with the snapshotted breakdown', async () => {
    const { offerId, clientCookie, demandeId } = await anOfferedDemande();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'PARCEL' })
      .expect(201);

    expect(res.body.url).toContain('fake_session=');
    const row = await prisma.commande.findUniqueOrThrow({
      where: { id: res.body.commandeId },
    });
    expect(row.status).toBe('PENDING_PAYMENT');
    expect(row.delivery).toBe('PARCEL');
    expect(row.repairCents).toBe(8900);
    expect(row.shippingCents).toBe(1900);
    expect(row.protectionCents).toBe(protectionCentsFor(8900));
    expect(row.totalCents).toBe(8900 + 1900 + protectionCentsFor(8900));
    expect(row.demandeId).toBe(demandeId);
    expect(row.paidAt).toBeNull();
  });

  it('leaves the demande OPEN and the offer SENT until payment lands', async () => {
    const { offerId, clientCookie, demandeId } = await anOfferedDemande();
    await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    expect(
      (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } }))
        .status,
    ).toBe('OPEN');
    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerId } })).status,
    ).toBe('SENT');
  });

  it('returns the same session when the client taps Payer twice on the same offer', async () => {
    const { offerId, clientCookie } = await anOfferedDemande();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    expect(second.body.commandeId).toBe(first.body.commandeId);
    expect(second.body.url).toBe(first.body.url);
    expect(await prisma.commande.count({ where: { offerId } })).toBe(1);
  });

  it('reaps its own expired session rather than leaving the client stuck behind it', async () => {
    const { offerId, clientCookie } = await anOfferedDemande();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    const stale = await prisma.commande.findUniqueOrThrow({
      where: { id: first.body.commandeId },
    });
    (paymentsGateway() as FakePaymentsGateway).markExpired(
      stale.stripeSessionId!,
    );

    const second = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    expect(second.body.commandeId).not.toBe(first.body.commandeId);
    expect(
      (
        await prisma.commande.findUniqueOrThrow({
          where: { id: first.body.commandeId },
        })
      ).status,
    ).toBe('ABANDONED');
  });

  it('refuses a second offer on a demande that already has a payment in flight', async () => {
    const { demandeId, offerId, clientCookie } = await anOfferedDemande();
    const other = await signUpRepairer(app);
    createdEmails.push(other.email);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demandeId}/offers`)
      .set('Cookie', other.cookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${second.body.id}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      'Un paiement est déjà en cours pour cette demande.',
    );
  });

  it('404s for a user who did not author the demande, so offer ids are not enumerable', async () => {
    const { offerId } = await anOfferedDemande();
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', stranger.cookie)
      .send({ delivery: 'HOME' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('422s on a withdrawn offer, which is findable but not payable', async () => {
    const { offerId, clientCookie, repairerCookie } = await anOfferedDemande();
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${offerId}`)
      .set('Cookie', repairerCookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("Cette offre n'est plus disponible.");
  });

  it('rejects an unknown delivery mode in French', async () => {
    const { offerId, clientCookie } = await anOfferedDemande();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'DRONE' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses cleanly when payments are switched off', async () => {
    const { offerId, clientCookie } = await anOfferedDemande();
    process.env.PAYMENTS_ENABLED = 'false';
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'HOME' });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe(
        "Le paiement n'est pas encore disponible.",
      );
      expect(await prisma.commande.count({ where: { offerId } })).toBe(0);
    } finally {
      process.env.PAYMENTS_ENABLED = 'true';
    }
  });

  it('reports paymentsEnabled: true in MeResponse when payments are on', async () => {
    const { clientCookie } = await anOfferedDemande();
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body.paymentsEnabled).toBe(true);
  });

  it('reports paymentsEnabled: false in MeResponse when PAYMENTS_ENABLED is off', async () => {
    const { clientCookie } = await anOfferedDemande();
    process.env.PAYMENTS_ENABLED = 'false';
    try {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', clientCookie)
        .expect(200);

      expect(res.body.paymentsEnabled).toBe(false);
    } finally {
      process.env.PAYMENTS_ENABLED = 'true';
    }
  });

  it('refuses a completed session rather than reaping it, so the client cannot pay twice', async () => {
    const { offerId, clientCookie, demandeId } = await anOfferedDemande();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' })
      .expect(201);

    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: first.body.commandeId },
    });
    (paymentsGateway() as FakePaymentsGateway).markComplete(
      commande.stripeSessionId!,
      {
        paymentIntentId: 'pi_fake_123',
        chargeId: 'ch_fake_456',
      },
    );

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'HOME' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Ce paiement a déjà été effectué.');
    expect(
      (
        await prisma.commande.findUniqueOrThrow({
          where: { id: first.body.commandeId },
        })
      ).status,
    ).toBe('PENDING_PAYMENT');
    expect(await prisma.commande.count({ where: { demandeId } })).toBe(1);
  });

  it('creates a fresh commande when the delivery mode changes, with the new shipping fee', async () => {
    const { offerId, clientCookie } = await anOfferedDemande();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'PARCEL' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'WORKSHOP' })
      .expect(201);

    expect(second.body.commandeId).not.toBe(first.body.commandeId);
    const newRow = await prisma.commande.findUniqueOrThrow({
      where: { id: second.body.commandeId },
    });
    expect(newRow.delivery).toBe('WORKSHOP');
    expect(newRow.shippingCents).toBe(0);
    expect(newRow.totalCents).toBe(8900 + protectionCentsFor(8900));
    expect(
      (
        await prisma.commande.findUniqueOrThrow({
          where: { id: first.body.commandeId },
        })
      ).status,
    ).toBe('ABANDONED');
  });

  it('never opens two payable sessions on one demande, however the concurrency lands', async () => {
    const { offerId, clientCookie, demandeId } = await anOfferedDemande();

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'HOME' }),
      request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'HOME' }),
    ]);

    // The one invariant that must hold in EVERY ordering: a demande never has two
    // payment attempts open at once, because each one is a chargeable Stripe session.
    expect(await prisma.commande.count({ where: { demandeId } })).toBe(1);

    // At least one caller must get somewhere; a double 422 would mean the client
    // cannot pay at all.
    const created = [res1, res2].filter((r) => r.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);

    if (created.length === 2) {
      // Both succeeded, which is correct only if the second REUSED the first's
      // session rather than opening a second one. Same commande, same URL.
      expect(created[0]!.body.commandeId).toBe(created[1]!.body.commandeId);
      expect(created[0]!.body.url).toBe(created[1]!.body.url);
    } else {
      // One lost the insert race. It must be told a payment is already under way,
      // and the winner must still be payable.
      const loser = [res1, res2].find((r) => r.status !== 201);
      expect(loser?.status).toBe(422);
      expect(loser?.body.error.message).toBe(
        'Un paiement est déjà en cours pour cette demande.',
      );
    }

    const only = await prisma.commande.findFirstOrThrow({
      where: { demandeId },
    });
    expect(only.status).toBe('PENDING_PAYMENT');
    expect(only.stripeSessionId).not.toBeNull();
  });

  describe('colis needs the réparateur to have agreed', () => {
    it('refuses PARCEL against an offer that does not accept it', async () => {
      const { offerId, clientCookie } = await anOfferWith({ acceptsParcel: false });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL' });
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Ce réparateur n'accepte pas l'envoi par colis.");
      // And NO session was created. The status alone would pass if the guard ran
      // after computeAmounts and the row already existed.
      expect(await prisma.commande.count({ where: { offerId } })).toBe(0);
    });

    it('allows PARCEL once he has', async () => {
      const { offerId, clientCookie } = await anOfferWith({ acceptsParcel: true });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL' })
        .expect(201);
      const row = await prisma.commande.findUniqueOrThrow({ where: { id: res.body.commandeId } });
      expect(row.shippingCents).toBe(1900);
      expect(row.totalCents).toBe(row.repairCents + 1900 + protectionCentsFor(row.repairCents));
    });

    it('still allows a local mode on an offer that refuses parcels', async () => {
      const { offerId, clientCookie } = await anOfferWith({ acceptsParcel: false });
      await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'WORKSHOP' })
        .expect(201);
    });
  });

  /**
   * Livraison Boxtal (spec §7.1, §7.2). Extended by reading on 2026-09-05 for Livraison Boxtal;
   * not run, because this suite writes to the production database. The quote route also reaches
   * BAN through GeocodeService for the two postal codes, one more reason it is read, not run.
   */
  describe('Livraison Boxtal quote', () => {
    const fake = new FakeShippingGateway();
    const quoteIds: string[] = [];
    const savedShipping: Record<string, string | undefined> = {};
    const SHIPPING_ENV: Record<string, string> = {
      SHIPPING_DRIVER: 'boxtal',
      BOXTAL_V1_ACCESS_KEY: 'k',
      BOXTAL_V1_SECRET_KEY: 's',
      BOXTAL_V3_ACCESS_KEY: 'k',
      BOXTAL_V3_SECRET_KEY: 's',
      BOXTAL_WEBHOOK_SECRET: 'w',
      STORAGE_DRIVER: 'fake',
    };
    const relay = (over: Partial<LegOffer>): LegOffer => ({
      carrierCode: 'MONR',
      serviceCode: 'CpourToi',
      carrierLabel: 'Mondial Relay',
      serviceLabel: 'Points Relais',
      costExclTaxCents: 314,
      costInclTaxCents: 378,
      insuranceInclTaxCents: 734,
      collectionType: 'DROPOFF_POINT',
      deliveryType: 'PICKUP_POINT',
      estimatedDeliveryDate: '2026-09-10',
      ...over,
    });
    const PARCEL = { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 };

    beforeAll(() => {
      for (const [k, v] of Object.entries(SHIPPING_ENV)) {
        savedShipping[k] = process.env[k];
        process.env[k] = v;
      }
      // Relay offers ONLY, so the HOME option is ABSENT from the quote and « wrong option » is a
      // real case rather than a typo. 378 + 372 = 750 → 780 grossed up; both legs insure at 734 →
      // 1468 → 1520, the same arithmetic `shipping-quotes.spec.ts` pins.
      fake.seedOffers('OUTBOUND', [relay({})]);
      fake.seedOffers('RETURN', [relay({ carrierCode: 'CHRP', serviceCode: 'ChronoShoptoShop', carrierLabel: 'Chronopost', costInclTaxCents: 372 })]);
      __registerBoxtalGateway(() => fake);
      __resetShippingGateway();
    });

    afterAll(async () => {
      // ShippingQuote has no cascade from User, and Commande.shippingQuoteId points at it: detach
      // the FK first, then delete the quotes. Users and their commandes go in the outer afterAll.
      await prisma.commande.updateMany({ where: { shippingQuoteId: { in: quoteIds } }, data: { shippingQuoteId: null } });
      await prisma.shippingQuote.deleteMany({ where: { id: { in: quoteIds } } });
      for (const [k, v] of Object.entries(savedShipping)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      __resetShippingGateway();
    });

    /** An offered demande whose réparateur has a postal code (sign-up sets none), plus its quote. */
    async function aQuotedOffer(): Promise<{ offerId: string; clientCookie: string; quoteId: string; quote: ShippingQuoteDto }> {
      const { offerId, clientCookie } = await anOfferedDemande();
      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, select: { repairerUserId: true } });
      await prisma.repairerProfile.update({ where: { userId: offer.repairerUserId }, data: { postalCode: '75011' } });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/shipping-quote`)
        .set('Cookie', clientCookie)
        .send({ parcel: PARCEL })
        .expect(200);
      quoteIds.push(res.body.id);
      return { offerId, clientCookie, quoteId: res.body.id, quote: res.body as ShippingQuoteDto };
    }

    it('quotes the relay option with its insured variant, and no HOME option when Boxtal has none', async () => {
      const { quote } = await aQuotedOffer();
      expect(quote.options.RELAY?.shippingCents).toBe(780);
      expect(quote.options.RELAY?.insured?.insuranceCents).toBe(1520);
      expect(quote.options.RELAY?.carrierLabels).toEqual({ OUTBOUND: 'Mondial Relay', RETURN: 'Chronopost' });
      expect(quote.options.HOME).toBeUndefined();
      expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('checks out the insured relay pair: the row carries the quoted amounts and the quote id', async () => {
      const { offerId, clientCookie, quoteId } = await aQuotedOffer();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL', quoteId, parcelOption: 'RELAY', insured: true })
        .expect(201);
      const row = await prisma.commande.findUniqueOrThrow({ where: { id: res.body.commandeId } });
      expect(row.shippingCents).toBe(780);
      expect(row.insuranceCents).toBe(1520);
      expect(row.totalCents).toBe(row.repairCents + 780 + protectionCentsFor(row.repairCents) + 1520);
      expect(row.shippingQuoteId).toBe(quoteId);
      expect(row.parcelOption).toBe('RELAY');
      expect(row.parcelValueCents).toBe(30_000);
    });

    it('refuses an option the quote does not carry, in French, and creates no session', async () => {
      const { offerId, clientCookie, quoteId } = await aQuotedOffer();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL', quoteId, parcelOption: 'HOME', insured: false });
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette option de livraison n'est pas disponible.");
      expect(await prisma.commande.count({ where: { offerId } })).toBe(0);
    });

    it('refuses a parcel checkout without a quote while the Boxtal driver is on', async () => {
      const { offerId, clientCookie } = await aQuotedOffer();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL' });
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe('Devis de livraison requis.');
    });

    it('a second checkout that drops the insurance expires the first session and opens a new row', async () => {
      const { offerId, clientCookie, quoteId } = await aQuotedOffer();
      const first = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL', quoteId, parcelOption: 'RELAY', insured: true })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerId}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL', quoteId, parcelOption: 'RELAY', insured: false })
        .expect(201);
      expect(second.body.commandeId).not.toBe(first.body.commandeId);
      const fresh = await prisma.commande.findUniqueOrThrow({ where: { id: second.body.commandeId } });
      expect(fresh.insuranceCents).toBe(0);
      expect(fresh.totalCents).toBe(fresh.repairCents + 780 + protectionCentsFor(fresh.repairCents));
      const old = await prisma.commande.findUniqueOrThrow({ where: { id: first.body.commandeId } });
      expect(old.status).toBe('ABANDONED');
      // The fake payments gateway expired the first session for real, not just the row.
      const gw = paymentsGateway() as FakePaymentsGateway;
      expect((await gw.retrieveCheckoutSession(old.stripeSessionId!)).status).toBe('expired');
    });
  });
});
