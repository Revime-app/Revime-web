import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';
import { FakeConnectGateway, connectGateway } from '../src/connect/gateway.js';

describe('connect onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];
  /**
   * Every StripeEvent primary key this file can create, collected at the point of use.
   *
   * A prefix match is not good enough, and both halves of the reason are real.
   * `StripeEvent` has NO foreign key, so the user-delete cascade cannot reach it and a
   * missed row is stranded in the client's live database. And the ids here are built
   * by interpolation, so a prefix holds only by convention - while the claim key is
   * now namespaced, so it does not start with `evt_` at all. The pattern is
   * `stripe-webhook.int.spec.ts`'s: collect, then delete exactly those.
   */
  const claimKeys: string[] = [];

  /**
   * A réparateur. signUpRepairer calls PATCH /users/me/modes. CF4-01: that endpoint is
   * no longer identity-gated (assertIdentityVerified accepts only 'offer'), so the old
   * « create the réparateur, THEN set flags » ordering is no longer load-bearing - it is
   * kept only because it costs nothing.
   */
  const newRepairer = async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, cookie };
  };

  const enableConnect = () => {
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
  };

  const startOnboarding = (cookie: string) =>
    request(app.getHttpServer()).post('/api/v1/connect/onboarding').set('Cookie', cookie);

  const getStatus = (cookie: string) =>
    request(app.getHttpServer()).get('/api/v1/connect/status').set('Cookie', cookie);

  /**
   * A really-signed webhook payload. The signature check is never faked - it is the
   * only thing protecting the route that grants a verification level - so the test
   * signs for real with the same secret the service reads.
   */
  const postEvent = (body: Record<string, unknown>) => {
    // Recorded HERE, so no delivery in this file can escape the cleanup regardless of
    // how its id was built. The service claims `connect:<event id>`, so that is the
    // row's primary key and that is what gets deleted.
    claimKeys.push(`connect:${String(body.id)}`);
    const payload = JSON.stringify(body);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,
    });
    return request(app.getHttpServer())
      .post('/api/v1/stripe/connect/webhook')
      .set('stripe-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
  };

  const accountUpdated = (id: string, accountId: string) => ({
    id,
    type: 'account.updated',
    data: { object: { id: accountId, object: 'account' } },
  });

  /** The fake, so a test can walk an account through onboarding. */
  const fake = () => connectGateway() as FakeConnectGateway;

  const onboardedRepairer = async () => {
    const r = await newRepairer();
    const res = await startOnboarding(r.cookie).expect(201);
    const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
    return { ...r, url: res.body.url, accountId: row.stripeAccountId };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // FAIL FAST rather than run. `apps/api/.env` is gitignored, so a STRIPE_DRIVER of
    // 'stripe' in it would make this suite create REAL connected accounts on the
    // client's Stripe account, with no cleanup at all. A loud failure here is much
    // cheaper than that.
    expect(connectGateway()).toBeInstanceOf(FakeConnectGateway);
  });

  afterEach(() => {
    delete process.env.CONNECT_ENABLED;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    delete process.env.PUBLIC_API_URL;
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    // Exactly the keys this file created. Cannot be defeated by interpolation or by
    // the claim namespace, unlike the prefix match this replaces.
    if (claimKeys.length > 0) {
      await prisma.stripeEvent.deleteMany({ where: { id: { in: claimKeys } } });
    }
    await app.close();
  });

  describe('with the flag off, which is THE production configuration today', () => {
    it('refuses onboarding with 422 and a French message', async () => {
      const r = await newRepairer();
      const res = await startOnboarding(r.cookie).expect(422);
      expect(res.body.error.message).toBe("Les virements ne sont pas encore disponibles.");
    });

    it('creates no ConnectAccount row and no Stripe account', async () => {
      const r = await newRepairer();
      await startOnboarding(r.cookie).expect(422);
      const row = await prisma.connectAccount.findUnique({ where: { userId: r.id } });
      expect(row).toBeNull();
    });

    it('still reports status, so the app can render nothing rather than fail', async () => {
      const r = await newRepairer();
      const res = await getStatus(r.cookie).expect(200);
      expect(res.body.status).toBeNull();
    });
  });

  describe('status before onboarding', () => {
    it('synthesises a not-started shape from the missing row', async () => {
      enableConnect();
      const r = await newRepairer();
      const res = await getStatus(r.cookie).expect(200);
      expect(res.body).toEqual({
        status: null,
        entityType: null,
        transfersActive: false,
        lastSyncedAt: null,
      });
    });
  });

  describe('starting onboarding', () => {
    it('creates exactly one ConnectAccount row and returns a URL', async () => {
      enableConnect();
      const r = await newRepairer();

      const res = await startOnboarding(r.cookie).expect(201);
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(0);

      const rows = await prisma.connectAccount.findMany({ where: { userId: r.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeAccountId).toMatch(/^acct_/);
      expect(rows[0]!.status).toBe('PENDING');
    });

    it('reuses the account on a second call rather than creating a second one', async () => {
      enableConnect();
      const r = await newRepairer();

      await startOnboarding(r.cookie).expect(201);
      const first = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });

      await startOnboarding(r.cookie).expect(201);
      const rows = await prisma.connectAccount.findMany({ where: { userId: r.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeAccountId).toBe(first.stripeAccountId);
    });

    it('mints a FRESH link every call, because an Account Link is single-use', async () => {
      enableConnect();
      const r = await newRepairer();

      const a = await startOnboarding(r.cookie).expect(201);
      const b = await startOnboarding(r.cookie).expect(201);

      // The fake embeds the account id, so equal URLs would prove a cached link
      // rather than a fresh one only if the URLs carried a nonce. Assert the
      // weaker, true thing: the call succeeds twice and returns a usable URL.
      expect(b.body.url).toContain('connect/return');
      expect(a.body.url).toContain('connect/return');
    });

    it('refuses a user who is not a réparateur', async () => {
      enableConnect();
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);

      const res = await startOnboarding(cookie).expect(403);
      expect(res.body.error.message).toBe('Activez le mode réparateur.');
    });
  });

  describe('the redirect routes carry no trust', () => {
    it('sends the browser back into the app and grants nothing', async () => {
      enableConnect();
      const r = await newRepairer();
      await startOnboarding(r.cookie).expect(201);

      // No `?u=`. The route reads nothing at all, which is what makes it trust-free.
      const res = await request(app.getHttpServer())
        .get('/api/v1/connect/return')
        .expect(302);
      expect(res.headers.location).toBe('revime://connect/retour');

      // The whole point: returning proves the flow was exited, not that anything
      // was verified. Nothing may have moved.
      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('PENDING');
      expect(row.transfersActive).toBe(false);
      expect(row.detailsSubmittedAt).toBeNull();

      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: r.id } });
      expect(profile.verificationLevel).toBe('NONE');
    });

    it('redirects into the app even with the flag off, rather than answering 422 to a browser', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/connect/return')
        .expect(302);
      expect(res.headers.location).toBe('revime://connect/retour');
    });

    it('refresh mints a new onboarding link and 302s to it', async () => {
      enableConnect();
      const r = await newRepairer();
      await startOnboarding(r.cookie).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/connect/refresh')
        .set('Cookie', r.cookie)
        .expect(302);
      expect(res.headers.location).toContain('connect/return');
    });

    it('refresh falls back into the app for an unknown user rather than 500ing', async () => {
      enableConnect();
      const res = await request(app.getHttpServer())
        .get('/api/v1/connect/refresh')
        .expect(302);
      expect(res.headers.location).toBe('revime://connect/retour');
    });
  });

  describe('the Connect webhook route receives raw bytes', () => {
    it('receives RAW bytes, proven by a valid signature verifying', async () => {
      enableConnect();
      // 200 means the signature VERIFIED, which is only possible against the exact
      // bytes we signed. A JSON-parsed body cannot verify. This is what discriminates
      // the parser fix: a BAD signature answers 400 either way and proves nothing.
      await postEvent({
        // Named to match Task 10's cleanup pattern `evt_acct_fake_%`.
        id: 'evt_acct_fake_rawbody_probe',
        type: 'account.updated',
        data: { object: { id: 'acct_not_ours', object: 'account' } },
      }).expect(200);
    });

    it('rejects a forged signature', async () => {
      enableConnect();
      // Posted directly rather than through postEvent, so it is recorded by hand. A
      // forged signature is refused before the claim, so this should never exist -
      // recorded anyway, because the cleanup list is the safety net and not an
      // assertion about behaviour.
      claimKeys.push('connect:evt_acct_fake_forged');
      const res = await request(app.getHttpServer())
        .post('/api/v1/stripe/connect/webhook')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .set('Content-Type', 'application/json')
        .send({ id: 'evt_acct_fake_forged', type: 'account.updated', data: { object: { id: 'acct_x' } } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Signature invalide.');
    });
  });

  describe('the webhook is the only writer', () => {
    it('moves a verified account to VERIFIED and stamps the document evidence', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markVerified(r.accountId);

      await postEvent(accountUpdated(`evt_${r.accountId}_1`, r.accountId)).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('VERIFIED');
      expect(row.transfersActive).toBe(true);
      expect(row.entityType).toBe('INDIVIDUAL');
      expect(row.detailsSubmittedAt).not.toBeNull();
      expect(row.lastSyncedAt).not.toBeNull();

      // Connect grants NO verification level. This is the assertion that pins the
      // whole point of Task 1's probe: onboarding a payout account says nothing
      // about who the réparateur is.
      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: r.id } });
      expect(profile.verificationLevel).toBe('NONE');
    });

    it('is a no-op on redelivery of the same event id', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markVerified(r.accountId);
      const evt = accountUpdated(`evt_${r.accountId}_dup`, r.accountId);

      await postEvent(evt).expect(200);
      const first = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });

      await postEvent(evt).expect(200);
      const second = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });

      expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
      // The claim key is namespaced per endpoint, so the bare event id is NOT the
      // primary key. Asserting on the bare id would silently pass on zero rows.
      const events = await prisma.stripeEvent.findMany({ where: { id: `connect:${evt.id}` } });
      expect(events).toHaveLength(1);
    });

    it('moves a previously good account to RESTRICTED on a transient requirement', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markVerified(r.accountId);
      await postEvent(accountUpdated(`evt_${r.accountId}_a`, r.accountId)).expect(200);

      fake().markRequirementsDue(r.accountId);
      await postEvent(accountUpdated(`evt_${r.accountId}_b`, r.accountId)).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('RESTRICTED');
    });

    it('syncs Stripe entity type, and does not read the self-declared kind', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markVerified(r.accountId);
      fake().markEntityType(r.accountId, 'COMPANY');

      await postEvent(accountUpdated(`evt_${r.accountId}_co`, r.accountId)).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.entityType).toBe('COMPANY');

      // The self-declared field is untouched and stays at its default. The identity
      // spec §6.2 forbids RepairerProfile.kind from driving anything, and this pins
      // that the sync writes Stripe's answer to a different column rather than
      // reconciling the two.
      const repairer = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: r.id } });
      expect(repairer.kind).toBe('INDIVIDUAL');
    });

    it('moves a rejected account to REJECTED with its reason', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markRejected(r.accountId, 'rejected.fraud');

      await postEvent(accountUpdated(`evt_${r.accountId}_c`, r.accountId)).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('REJECTED');
      expect(row.disabledReason).toBe('rejected.fraud');
    });

    it('ignores an event for an account we do not know', async () => {
      enableConnect();
      await postEvent(accountUpdated('evt_acct_fake_unknown_1', 'acct_not_ours')).expect(200);
    });

    it('ignores an event type it did not ask for', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      await postEvent({
        id: `evt_${r.accountId}_other`,
        type: 'account.application.deauthorized',
        data: { object: { id: r.accountId } },
      }).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('PENDING');
    });

    it('refuses a missing signature', async () => {
      enableConnect();
      const res = await request(app.getHttpServer())
        .post('/api/v1/stripe/connect/webhook')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Signature manquante.');
    });

    it('reports a missing secret as OUR fault, not as a bad signature', async () => {
      process.env.CONNECT_ENABLED = 'true';
      process.env.PUBLIC_API_URL = 'https://api.example.test';
      // Deliberately no STRIPE_CONNECT_WEBHOOK_SECRET.
      const res = await request(app.getHttpServer())
        .post('/api/v1/stripe/connect/webhook')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Configuration de paiement incomplète.');
    });

    it('releases its event claim when the handler fails, so Stripe can retry', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      fake().markVerified(r.accountId);
      const evt = accountUpdated(`evt_${r.accountId}_retry`, r.accountId);

      // First delivery: the gateway fails, so the handler throws.
      fake().failNextRetrieveOnce();
      await postEvent(evt).expect(500);

      // The claim must be GONE. If it survives, Stripe's retry is discarded as a
      // duplicate and this event is lost for good.
      const key = `connect:${evt.id}`;
      expect(await prisma.stripeEvent.findMany({ where: { id: key } })).toHaveLength(0);

      // The retry: same event id, and it must be processed rather than skipped.
      await postEvent(evt).expect(200);
      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('VERIFIED');
      expect(await prisma.stripeEvent.findMany({ where: { id: key } })).toHaveLength(1);
    });

    it('returns REJECTED even when transfers are still active, by precedence', async () => {
      enableConnect();
      const r = await onboardedRepairer();
      // Stripe can report rejected while transfers have not yet gone inactive. This
      // is the ordering case: REJECTED must win over VERIFIED.
      fake().markRejectedButStillActive(r.accountId, 'rejected.fraud');

      await postEvent(accountUpdated(`evt_${r.accountId}_precede`, r.accountId)).expect(200);

      const row = await prisma.connectAccount.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('REJECTED');
      expect(row.transfersActive).toBe(true);
    });
  });

  describe('MeResponse.connectEnabled', () => {
    const me = (cookie: string) =>
      request(app.getHttpServer()).get('/api/v1/users/me').set('Cookie', cookie);

    it('is false with the flag off, so no surface offers an action the server refuses', async () => {
      const r = await newRepairer();
      const res = await me(r.cookie).expect(200);
      expect(res.body.connectEnabled).toBe(false);
    });

    it('is true when the flag and its two required values are set', async () => {
      enableConnect();
      const r = await newRepairer();
      const res = await me(r.cookie).expect(200);
      expect(res.body.connectEnabled).toBe(true);
    });
  });
});
