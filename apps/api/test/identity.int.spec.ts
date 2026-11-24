import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeIdentityGateway, identityGateway } from '../src/identity/gateway.js';
import { promoteToBasicIfEligible } from '../src/verification/promote-basic.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('identity verification', () => {
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

  /** A plain signup with no mode enabled, for the tests about who may verify. */
  const newClient = async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, cookie };
  };

  /**
   * Makes the account ELIGIBLE for POST /identity/session: both contact columns written
   * straight to the row (the OTP endpoints are `verification-*.int.spec.ts`'s subject), then
   * the real writer of level 1, so the profile sits at BASIC.
   *
   * 🛑 Since `CF-D1` (2026-09-04) start() asks the LEVEL, not the two columns - BASIC is
   * e-mail OR phone and promote-basic.ts is its one owner - so writing the columns alone no
   * longer makes anyone eligible. This helper used to say it « leaves the profile at NONE,
   * which several tests below rely on »; the one test that did now expects BASIC.
   */
  const confirmContact = async (userId: string) => {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, phoneVerifiedAt: new Date() },
    });
    await promoteToBasicIfEligible(prisma, userId);
  };

  /** A réparateur who may start a session: mode on, both contacts confirmed, profile at BASIC. */
  const eligibleRepairer = async () => {
    const r = await newRepairer();
    await confirmContact(r.id);
    return r;
  };

  const enable = () => {
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect';
    process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = 'whsec_test_identity';
    process.env.PUBLIC_API_URL = 'https://api.example.test';
  };

  const startSession = (cookie: string) =>
    request(app.getHttpServer()).post('/api/v1/identity/session').set('Cookie', cookie);

  const getStatus = (cookie: string) =>
    request(app.getHttpServer()).get('/api/v1/identity/status').set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // FAIL FAST rather than run. `apps/api/.env` is gitignored, so a STRIPE_DRIVER of
    // 'stripe' in it would make this suite create REAL Stripe Identity sessions on the
    // client's account - each one BILLED, and none of them cleaned up. A loud failure
    // here is much cheaper than that.
    expect(identityGateway()).toBeInstanceOf(FakeIdentityGateway);
  });

  afterEach(() => {
    delete process.env.CONNECT_ENABLED;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
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
    it('refuses to start a session with 422 and a French message', async () => {
      const r = await newRepairer();
      const res = await startSession(r.cookie).expect(422);
      expect(res.body.error.message).toBe(
        "La vérification d'identité n'est pas encore disponible.",
      );
    });

    it('creates no IdentityVerification row', async () => {
      const r = await newRepairer();
      await startSession(r.cookie).expect(422);
      expect(await prisma.identityVerification.findUnique({ where: { userId: r.id } })).toBeNull();
    });

    /**
     * 🛑 `toEqual`, NOT `objectContaining`, AND THE EXACT SHAPE IS THE CONTRACT. This is the only
     * test anywhere that asserts all seven fields of `IdentityStatusResponse` at the HTTP boundary,
     * so a field silently added or dropped in `status()` shows up here and nowhere else.
     *
     * It asserted three fields until 2026-09-02 and was left stale by the slice that took the
     * response to seven - which nothing could have caught, because `test:unit` excludes
     * `*.int.spec.ts` and this suite writes to the PRODUCTION database, so it is run by no gate.
     * A reader comparing this file to `status()` would have "restored" the three-field shape.
     * If you add a field to the response, this line is the one to update.
     *
     * The two booleans are asserted at their NOT-STARTED values on purpose: available, because
     * nothing has been signalled, and not recommended, because there is no failure to remedy.
     */
    it('still reports status, so the app renders nothing rather than failing', async () => {
      const r = await newRepairer();
      const res = await getStatus(r.cookie).expect(200);
      expect(res.body).toEqual({
        status: null,
        verifiedAt: null,
        lastErrorCode: null,
        redactionStatus: null,
        erasureRequestedAt: null,
        documentOnlyAvailable: true,
        documentOnlyRecommended: false,
      });
    });
  });

  describe('starting a session', () => {
    it('creates exactly one row and returns a hosted URL', async () => {
      enable();
      const r = await eligibleRepairer();

      const res = await startSession(r.cookie).expect(201);
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(0);

      const rows = await prisma.identityVerification.findMany({ where: { userId: r.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeSessionId).toMatch(/^vs_/);
      expect(rows[0]!.status).toBe('REQUIRES_INPUT');
      expect(rows[0]!.verifiedAt).toBeNull();
    });

    it('reuses the row on a second call rather than creating a second session', async () => {
      enable();
      const r = await eligibleRepairer();

      await startSession(r.cookie).expect(201);
      const first = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });

      await startSession(r.cookie).expect(201);
      const rows = await prisma.identityVerification.findMany({ where: { userId: r.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeSessionId).toBe(first.stripeSessionId);
    });

    it('refuses to start a new session once the user is already verified', async () => {
      enable();
      const r = await eligibleRepairer();
      await startSession(r.cookie).expect(201);
      await prisma.identityVerification.update({
        where: { userId: r.id },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
      });

      const res = await startSession(r.cookie).expect(422);
      expect(res.body.error.message).toBe('Votre identité est déjà vérifiée.');
    });

    /**
     * I2. A PROCESSING session has a NULL hosted URL, so before this it fell through
     * and created a SECOND session - billed a second time, with the upsert repointing
     * `stripeSessionId` away from the first, so the first's own `verified` webhook then
     * found no row and returned quietly. Two charges, and a réparateur who passed the
     * check left permanently unverified.
     */
    it('refuses a second session while one is PROCESSING, rather than billing twice', async () => {
      enable();
      const r = await eligibleRepairer();
      await startSession(r.cookie).expect(201);
      const first = await prisma.identityVerification.findUniqueOrThrow({
        where: { userId: r.id },
      });
      // Exactly the state Stripe puts the session in when the document is submitted:
      // status PROCESSING and no URL to send anybody back to.
      fake().markProcessing(first.stripeSessionId);
      await prisma.identityVerification.update({
        where: { userId: r.id },
        data: { status: 'PROCESSING' },
      });

      const res = await startSession(r.cookie).expect(422);
      expect(res.body.error.message).toBe('Vérification en cours.');

      // And the row still names the FIRST session, so its webhook can still find it.
      const after = await prisma.identityVerification.findUniqueOrThrow({
        where: { userId: r.id },
      });
      expect(after.stripeSessionId).toBe(first.stripeSessionId);
    });

    /**
     * I2, the case the row-status check alone does NOT catch, and the one the real
     * journey actually produces. The row is written only by the webhook, so a
     * réparateur who submits his document and taps « Reprendre » a second later has a
     * row still at REQUIRES_INPUT while Stripe already says `processing`. The refusal
     * must therefore read Stripe's live status too.
     */
    it('refuses on Stripe live status even while the row is still stale at REQUIRES_INPUT', async () => {
      enable();
      const r = await eligibleRepairer();
      await startSession(r.cookie).expect(201);
      const first = await prisma.identityVerification.findUniqueOrThrow({
        where: { userId: r.id },
      });
      // Stripe moves on; the webhook has NOT landed, so the row is untouched.
      fake().markProcessing(first.stripeSessionId);
      expect(first.status).toBe('REQUIRES_INPUT');

      const res = await startSession(r.cookie).expect(422);
      expect(res.body.error.message).toBe('Vérification en cours.');

      // No second session was created, and the row still names the first one - which
      // is what lets the first session's `verified` webhook find it.
      const rows = await prisma.identityVerification.findMany({ where: { userId: r.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stripeSessionId).toBe(first.stripeSessionId);
    });

    /**
     * C1. Refusing on the account's LEVEL rather than on `repairerEnabled`. Identity is
     * a fact about a person, not about a mode. 🛑 Since `CF-D1` (2026-09-04) the level is
     * what start() reads, not the two contact columns: BASIC is e-mail OR phone, and the
     * rule has one owner, promote-basic.ts. This file is excluded from `test:unit` and was
     * NOT run for that change - edited by reading; `identity-variant.spec.ts` is the
     * gate-run cover.
     */
    it('refuses a user at NONE, whose e-mail and phone are both unconfirmed', async () => {
      enable();
      const c = await newClient();

      const res = await startSession(c.cookie).expect(403);
      expect(res.body.error.message).toBe(
        'Confirmez votre e-mail ou votre téléphone avant de vérifier votre identité.',
      );
      expect(await prisma.identityVerification.findUnique({ where: { userId: c.id } })).toBeNull();
    });

    // CF4-01: PROMOTE BEFORE REFUSING. Both contacts confirmed but the promotion hook
    // never ran, so the profile still sits at NONE - start() must promote, then admit.
    it('promotes a NONE account whose contacts are confirmed, then starts the session', async () => {
      enable();
      const c = await newClient();
      await prisma.user.update({
        where: { id: c.id },
        data: { emailVerified: true, phoneVerifiedAt: new Date() },
      });
      expect(await levelOf(c.id)).toBe('NONE');

      const res = await startSession(c.cookie).expect(201);
      expect(typeof res.body.url).toBe('string');
      expect(await levelOf(c.id)).toBe('BASIC');
    });

    it('admits a réparateur at BASIC whose e-mail is confirmed but whose phone is not', async () => {
      enable();
      const r = await newRepairer();
      await prisma.user.update({ where: { id: r.id }, data: { emailVerified: true } });
      await promoteToBasicIfEligible(prisma, r.id);

      // This used to assert a 403 with the AND message. One verified contact is BASIC now.
      await startSession(r.cookie).expect(201);
    });

    /**
     * THE DEADLOCK IS GONE. This is the test that pins it, and it is the branch's
     * primary journey.
     *
     * Before C1, `POST /identity/session` demanded `repairerEnabled` while the former
     * `assertIdentityVerified(…, 'become')` (removed in CF4-01) refused to grant that mode until the user
     * was verified - so with IDENTITY_GATE_ENABLED on, a client at BASIC could not
     * become a réparateur because he was not verified, and could not verify because he
     * was not a réparateur. A user with both contact details confirmed and NO réparateur
     * mode must still be able to start, so identity never depends on the mode again.
     */
    it('lets a NON-réparateur with confirmed contact details start, so the become-verify deadlock cannot return', async () => {
      enable();
      process.env.IDENTITY_GATE_ENABLED = 'true';
      try {
        const c = await newClient();
        await confirmContact(c.id);
        // The mode is off, and stays off (CF4-01: he could now enable it unverified,
        // but identity must not depend on it either way).
        const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: c.id } });
        expect(profile.repairerEnabled).toBe(false);

        const res = await startSession(c.cookie).expect(201);
        expect(typeof res.body.url).toBe('string');
        expect(res.body.url.length).toBeGreaterThan(0);

        const row = await prisma.identityVerification.findUniqueOrThrow({
          where: { userId: c.id },
        });
        expect(row.status).toBe('REQUIRES_INPUT');
      } finally {
        delete process.env.IDENTITY_GATE_ENABLED;
      }
    });
  });

  describe('the return redirect carries no trust', () => {
    it('sends the browser back into the app and grants nothing', async () => {
      enable();
      const r = await eligibleRepairer();
      await startSession(r.cookie).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/identity/return')
        .expect(302);
      expect(res.headers.location).toBe('revime://identite/retour');

      const row = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('REQUIRES_INPUT');
      expect(row.verifiedAt).toBeNull();

      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: r.id } });
      // Unchanged from what confirmContact granted: the redirect must not lift it to IDENTITY.
      expect(profile.verificationLevel).toBe('BASIC');
    });
  });

  /**
   * A really-signed payload. The signature check is never faked - it is the only
   * thing protecting the one route that grants a verification level - so the test
   * signs for real with the same secret the service reads.
   */
  const postEvent = (body: Record<string, unknown>) => {
    // Recorded HERE, so no delivery in this file can escape the cleanup regardless of
    // how its id was built. The service claims `identity:<event id>`, so that is the
    // row's primary key and that is what gets deleted.
    claimKeys.push(`identity:${String(body.id)}`);
    const payload = JSON.stringify(body);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_IDENTITY_WEBHOOK_SECRET!,
    });
    return request(app.getHttpServer())
      .post('/api/v1/stripe/identity/webhook')
      .set('stripe-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
  };

  const sessionEvent = (id: string, type: string, sessionId: string) => ({
    id,
    type,
    data: { object: { id: sessionId, object: 'identity.verification_session' } },
  });

  const fake = () => identityGateway() as FakeIdentityGateway;

  /** A réparateur at BASIC with a started session - the precondition for level 2. */
  const startedRepairer = async () => {
    // Contact details FIRST: they are now the route's precondition, so confirming them
    // after the call would fail inside the helper rather than on any assertion.
    const r = await eligibleRepairer();
    await startSession(r.cookie).expect(201);
    await prisma.profile.update({
      where: { userId: r.id },
      data: { verificationLevel: 'BASIC', verifiedAt: new Date() },
    });
    const row = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
    return { ...r, sessionId: row.stripeSessionId };
  };

  const levelOf = async (userId: string) =>
    (await prisma.profile.findUniqueOrThrow({ where: { userId } })).verificationLevel;

  describe('the webhook is the only thing that grants a level', () => {
    it('grants IDENTITY on a verified session', async () => {
      enable();
      const r = await startedRepairer();
      fake().markVerified(r.sessionId);

      await postEvent(
        sessionEvent(`evt_${r.sessionId}_v`, 'identity.verification_session.verified', r.sessionId),
      ).expect(200);

      const row = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('VERIFIED');
      expect(row.verifiedAt).not.toBeNull();
      expect(await levelOf(r.id)).toBe('IDENTITY');
    });

    it('is a no-op on redelivery of the same event id', async () => {
      enable();
      const r = await startedRepairer();
      fake().markVerified(r.sessionId);
      const evt = sessionEvent(
        `evt_${r.sessionId}_dup`,
        'identity.verification_session.verified',
        r.sessionId,
      );

      await postEvent(evt).expect(200);
      const first = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
      await postEvent(evt).expect(200);
      const second = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });

      expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
      // The claim key is namespaced per endpoint, so the bare event id is NOT the
      // primary key. Asserting on the bare id would silently pass on zero rows.
      expect(
        await prisma.stripeEvent.findMany({ where: { id: `identity:${evt.id}` } }),
      ).toHaveLength(1);
    });

    it('records a failed check with its error code and grants nothing', async () => {
      enable();
      const r = await startedRepairer();
      fake().markRequiresInput(r.sessionId, 'document_unverified_other');

      await postEvent(
        sessionEvent(
          `evt_${r.sessionId}_ri`,
          'identity.verification_session.requires_input',
          r.sessionId,
        ),
      ).expect(200);

      const row = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('REQUIRES_INPUT');
      expect(row.lastErrorCode).toBe('document_unverified_other');
      expect(row.verifiedAt).toBeNull();
      expect(await levelOf(r.id)).toBe('BASIC');
    });

    it('never clears verifiedAt once stamped', async () => {
      enable();
      const r = await startedRepairer();
      fake().markVerified(r.sessionId);
      await postEvent(
        sessionEvent(`evt_${r.sessionId}_v2`, 'identity.verification_session.verified', r.sessionId),
      ).expect(200);

      fake().markCanceled(r.sessionId);
      await postEvent(
        sessionEvent(`evt_${r.sessionId}_c`, 'identity.verification_session.canceled', r.sessionId),
      ).expect(200);

      const row = await prisma.identityVerification.findUniqueOrThrow({ where: { userId: r.id } });
      expect(row.status).toBe('CANCELED');
      // The evidence survives the status. And the LEVEL survives too: a verified
      // document is a fact about a past moment, not a subscription.
      expect(row.verifiedAt).not.toBeNull();
      expect(await levelOf(r.id)).toBe('IDENTITY');
    });

    it('ignores a session we do not know', async () => {
      enable();
      await postEvent(
        sessionEvent('evt_vs_fake_unknown_i', 'identity.verification_session.verified', 'vs_not_ours'),
      ).expect(200);
    });

    /**
     * I4. The mirror of connect.int.spec.ts's claim-release test, and Identity is the
     * side that matters most: it is the ONLY thing that grants `IDENTITY`, which drives
     * the « Réparateur vérifié » badge. If a failed handler kept its claim, Stripe's
     * retry would be discarded as a duplicate and a réparateur with a genuinely
     * verified session would stay unpromoted permanently.
     */
    it('releases its event claim when the handler fails, so Stripe can retry', async () => {
      enable();
      const r = await startedRepairer();
      fake().markVerified(r.sessionId);
      const evt = sessionEvent(
        `evt_${r.sessionId}_retry`,
        'identity.verification_session.verified',
        r.sessionId,
      );
      const key = `identity:${evt.id}`;

      // First delivery: the gateway rejects, so the handler throws.
      fake().failNextRetrieveOnce();
      await postEvent(evt).expect(500);

      // The claim must be GONE. If it survives, this verification is lost for good.
      expect(await prisma.stripeEvent.findMany({ where: { id: key } })).toHaveLength(0);
      // And nothing was granted on the failed delivery.
      const during = await prisma.identityVerification.findUniqueOrThrow({
        where: { userId: r.id },
      });
      expect(during.verifiedAt).toBeNull();
      expect(await levelOf(r.id)).toBe('BASIC');

      // The retry: the SAME event id, and it must be processed rather than skipped.
      await postEvent(evt).expect(200);
      const row = await prisma.identityVerification.findUniqueOrThrow({
        where: { userId: r.id },
      });
      expect(row.status).toBe('VERIFIED');
      expect(row.verifiedAt).not.toBeNull();
      expect(await levelOf(r.id)).toBe('IDENTITY');
      expect(await prisma.stripeEvent.findMany({ where: { id: key } })).toHaveLength(1);
    });

    it('refuses a missing signature', async () => {
      enable();
      const res = await request(app.getHttpServer())
        .post('/api/v1/stripe/identity/webhook')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Signature manquante.');
    });

    it('reports a missing secret as OUR fault, not as a bad signature', async () => {
      process.env.CONNECT_ENABLED = 'true';
      process.env.PUBLIC_API_URL = 'https://api.example.test';
      // Deliberately no STRIPE_IDENTITY_WEBHOOK_SECRET.
      const res = await request(app.getHttpServer())
        .post('/api/v1/stripe/identity/webhook')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Configuration de paiement incomplète.');
    });
  });
});
