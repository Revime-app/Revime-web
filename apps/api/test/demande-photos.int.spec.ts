import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';
import { __resetSignLimit } from '../src/storage/sign-limit.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

/**
 * Demande photos, end to end against the API.
 *
 * 🛑 THIS SPEC WRITES THE PRODUCTION DATABASE. `DATABASE_URL` points at production and there is
 * no staging, so `createdEmails` plus the `afterAll` cascade is not tidiness - it is the only
 * thing that keeps test users out of the client's live app. If `afterAll` does not run, rows
 * leak.
 *
 * Storage is the in-memory FAKE throughout. `apps/api/.env` carries `STORAGE_DRIVER=fake`,
 * which counts as CONFIGURED while still selecting `FakeStorageGateway` - so the route is
 * genuinely exercised and no network is touched. Each test re-asserts it in `beforeEach`
 * because one case deliberately unsets it to prove the route fails closed, and a leaked unset
 * would then silently 500 every test after it.
 */
describe('demande photos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let cookie: string;
  let userId: string;
  const createdEmails: string[] = [];

  const DRAFT = '5f2b9c1e-8a4d-4f6b-9c2e-1a3b5d7f9e0c';
  const OBJ = '7a1c3e5d-9b2f-4a6c-8d0e-2f4a6c8e0b1d';
  /** Tracked so afterAll can remove them; the user cascade covers it, but being explicit
   *  means a run interrupted before afterAll leaves less behind in the client's live app. */
  const createdDemandeIds: string[] = [];

  /**
   * Configuring storage is per-test rather than global, because `isStorageConfigured()` is
   * itself under test: one case asserts the route fails closed when it is NOT configured, and a
   * global setup would make that case unreachable.
   */
  const configureStorage = (): void => {
    // `fake`, NOT `supabase`. Ruling F: `supabase` would make the factory select the REAL
    // gateway, and the first run of this spec proved it - a placeholder host gave
    // `getaddrinfo ENOTFOUND example.supabase.co` and five 500s. `fake` counts as configured
    // and still selects the in-memory gateway, so the route is exercised and no network is
    // touched. No URL or key is needed, and setting them here would be misleading.
    process.env.STORAGE_DRIVER = 'fake';
    __resetStorageGateway();
  };

  const unconfigureStorage = (): void => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    __resetStorageGateway();
  };

  const sign = (contentType = 'image/jpeg') =>
    request(app.getHttpServer())
      .post('/api/v1/demandes/photos/sign')
      .set('Cookie', cookie)
      .send({ draftId: DRAFT, contentType });


  /** Signs, then simulates the client's PUT so the object really exists in the fake. */
  const signAndUpload = async (contentType = 'image/jpeg'): Promise<string> => {
    const res = await sign(contentType).expect(201);
    const gw = storageGateway();
    if (!(gw instanceof FakeStorageGateway)) throw new Error('expected the fake gateway');
    gw.seed(res.body.path);
    return res.body.path;
  };

  const demandeBody = (over: Record<string, unknown> = {}) => ({
    categoryId,
    brand: 'Apple',
    model: 'iPhone 13',
    title: 'Ecran fissure a remplacer',
    description: "L'ecran est fissure sur toute la diagonale et le tactile repond mal.",
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

    const signedUp = await signUp(app);
    cookie = signedUp.cookie;
    createdEmails.push(signedUp.email);
    const user = await prisma.user.findFirstOrThrow({ where: { email: signedUp.email } });
    userId = user.id;
  });

  afterAll(async () => {
    unconfigureStorage();
    await prisma.demandePhoto.deleteMany({ where: { demandeId: { in: createdDemandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: createdDemandeIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  beforeEach(() => {
    __resetSignLimit();
    configureStorage();
  });

  describe('POST /demandes/photos/sign', () => {
    /**
     * POSITIVE CONTROL, and it is not optional. This API derives its error envelope from the
     * HTTP status, so a request to a route that does NOT EXIST renders byte-identically to a
     * service refusing something. Asserting only the 400 and 401 cases below would pass against
     * zero implementation. This is the test that fails if the route is deleted.
     */
    it('POSITIVE CONTROL: an authenticated client gets a path under its own prefix', async () => {
      const res = await sign().expect(201);

      // A whole-string regex, not `startsWith`: the prefix is the security boundary, and
      // `startsWith` would also accept extra path segments after the object name.
      expect(res.body.path).toMatch(
        new RegExp(`^demandes/${userId}/${DRAFT}/[0-9a-f-]{36}\\.jpg$`),
      );
      expect(res.body.uploadUrl).toContain(res.body.path);
    });

    it('gives png its own extension', async () => {
      const res = await sign('image/png').expect(201);
      expect(res.body.path.endsWith('.png')).toBe(true);
    });

    it('returns a DIFFERENT path each call, so two photos cannot collide', async () => {
      const a = await sign().expect(201);
      const b = await sign().expect(201);
      expect(a.body.path).not.toBe(b.body.path);
    });

    /**
     * The client cannot influence the path. Sending a `path` of its own is ignored rather than
     * honoured, which is the guarantee that a signed URL can never point outside the caller's
     * prefix.
     */
    it('IGNORES a path the client tries to supply', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes/photos/sign')
        .set('Cookie', cookie)
        .send({ draftId: DRAFT, contentType: 'image/jpeg', path: 'demandes/someone-else/x/y.jpg' })
        .expect(201);
      expect(res.body.path).not.toContain('someone-else');
      expect(res.body.path.startsWith(`demandes/${userId}/`)).toBe(true);
    });

    it('refuses an unauthenticated caller', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes/photos/sign')
        .send({ draftId: DRAFT, contentType: 'image/jpeg' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    /**
     * 400, not 422. Ruling G, observed rather than predicted: `ZodValidationPipe` answers
     * VALIDATION_FAILED/400 for a schema failure, while 422 is this API's code for a SERVICE
     * level refusal - the publish checks in a later task genuinely do throw 422. Both statuses
     * appear in this suite, each for its own reason.
     */
    it('refuses a content type the bucket does not allow', async () => {
      const res = await sign('image/heic').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toBeTruthy();
    });

    it('refuses a draftId that is not a uuid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/demandes/photos/sign')
        .set('Cookie', cookie)
        .send({ draftId: 'not-a-uuid', contentType: 'image/jpeg' })
        .expect(400);
    });

    /**
     * Fails CLOSED. Without credentials the gateway is the fake, and a client that PUT its bytes
     * to a fake URL would believe the photo was stored. A 500 here is the correct answer.
     */
    it('fails closed when storage is not configured', async () => {
      unconfigureStorage();
      const res = await sign();
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL');
    });

    it('rate limits after SIGN_RATE_PER_HOUR and answers 429', async () => {
      // 60 is the cap; the 61st must be refused. Sequential on purpose - the limiter is a
      // per-user counter and firing these in parallel would not prove ordering.
      for (let i = 0; i < 60; i++) {
        await sign().expect(201);
      }
      const res = await sign();
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('POST /demandes with photoPaths', () => {
    /**
     * POSITIVE CONTROL. Submitted deliberately OUT of signing order, so this proves sortOrder
     * follows the submitted ARRAY rather than whatever order the objects were created in.
     */
    it('POSITIVE CONTROL: creates the rows in submitted order', async () => {
      const first = await signAndUpload('image/jpeg');
      const second = await signAndUpload('image/png');

      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: [second, first] }))
        .expect(201);
      createdDemandeIds.push(res.body.id);

      expect(res.body.photoUrls).toHaveLength(2);
      const rows = await prisma.demandePhoto.findMany({
        where: { demandeId: res.body.id },
        orderBy: { sortOrder: 'asc' },
      });
      expect(rows.map((r) => r.storagePath)).toEqual([second, first]);
      expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
    });

    /** Exactly what all ten pre-existing integration specs send. `.default([])` is why. */
    it('accepts a body with NO photoPaths at all', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody())
        .expect(201);
      createdDemandeIds.push(res.body.id);
      expect(res.body.photoUrls).toEqual([]);
    });

    /**
     * 🛑 THE MOST IMPORTANT TEST IN THIS FILE, and its first version did not work.
     *
     * The foreign object is SEEDED into the bucket on purpose, so the existence check passes
     * and the prefix check is the ONLY thing that can refuse this path. Without the seed, a
     * deliberate break that removed the prefix check still produced 422 -- from the existence
     * check instead, because the object was not there -- and the test passed while proving
     * nothing. Measured: break 2 of Task 5 passed against a neutered prefix check.
     *
     * The message is asserted EXACTLY for the same reason: 'Photo invalide.' is the shape
     * refusal and 'Photo introuvable.' is the existence refusal, so a truthy-only assertion
     * cannot tell which check fired.
     */
    it('REFUSES a path under another user prefix', async () => {
      const foreign = `demandes/99999999-9999-4999-8999-999999999999/${DRAFT}/${OBJ}.jpg`;
      const gw = storageGateway();
      if (!(gw instanceof FakeStorageGateway)) throw new Error('expected the fake gateway');
      gw.seed(foreign);

      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: [foreign] }))
        .expect(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.fields.photoPaths).toBe('Photo invalide.');
    });

    /** The check the fake used to make un-provable, before it stopped pre-creating objects. */
    it('REFUSES a path that was signed but never uploaded', async () => {
      const ghost = (await sign().expect(201)).body.path;
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: [ghost] }))
        .expect(422);
      expect(res.body.error.fields.photoPaths).toBe('Photo introuvable.');
    });

    /**
     * The exact message pins this to the UNIQUENESS check. Asserting only 422 would let a
     * miscoded prefix or count check satisfy it -- the same defect break 2 exposed on the
     * foreign-prefix test, generalised here by Task 5's review.
     */
    it('REFUSES duplicates', async () => {
      const p = await signAndUpload();
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: [p, p] }))
        .expect(422);
      expect(res.body.error.fields.photoPaths).toBe('Cette photo est en double.');
    });

    it('REFUSES eleven paths', async () => {
      const paths = [];
      for (let i = 0; i < 11; i++) paths.push(await signAndUpload());
      await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: paths }))
        .expect(400); // the Zod cap fires before the service check
    });

    /**
     * Atomicity: a refused path must leave NO demande behind, not one without photos.
     *
     * The message is asserted too, because `/etc/passwd` would fail BOTH the shape check and
     * the existence check. Without pinning it, neutering the shape check would let existence
     * refuse it, the count would still be unchanged, and this test would pass while proving
     * nothing about which validation ran.
     */
    it('writes NO demande at all when a path is refused', async () => {
      const before = await prisma.demande.count({ where: { authorUserId: userId } });
      const res = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: ['/etc/passwd'] }))
        .expect(422);
      expect(res.body.error.fields.photoPaths).toBe('Photo invalide.');
      expect(await prisma.demande.count({ where: { authorUserId: userId } })).toBe(before);
    });
  });

  describe('signed read urls', () => {
    let demandeId: string;
    let bareId: string;
    let firstPath: string;
    /** Every object this describe needs present in the bucket. See the beforeEach below. */
    const seeded: string[] = [];

    beforeAll(async () => {
      // Built once for this describe. beforeEach has already configured the fake gateway, but
      // beforeAll runs BEFORE it, so configure explicitly here rather than relying on order.
      configureStorage();
      firstPath = await signAndUpload('image/jpeg');
      const second = await signAndUpload('image/png');
      seeded.push(firstPath, second);

      const withPhotos = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody({ photoPaths: [firstPath, second] }))
        .expect(201);
      demandeId = withPhotos.body.id;
      createdDemandeIds.push(demandeId);

      const bare = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', cookie)
        .send(demandeBody())
        .expect(201);
      bareId = bare.body.id;
      createdDemandeIds.push(bareId);
    });

    /**
     * 🛑 RE-SEED AFTER THE OUTER beforeEach. That one calls `__resetStorageGateway()`, which
     * builds a NEW FakeStorageGateway and therefore throws away every object seeded in
     * `beforeAll` - so without this the bucket is empty by the time any test runs and every
     * `photoUrls` comes back `[]`. Measured: it cost three failing tests on the first run.
     *
     * The demande ROWS survive because they are real database rows; only the in-memory storage
     * is reset, which is exactly the asymmetry that makes this easy to miss.
     *
     * This works because vitest runs hooks OUTER-TO-INNER, so the outer reset happens first and
     * this re-seed lands after it. That ordering is the load-bearing assumption: if these hooks
     * were ever reordered, or the outer reset moved into a beforeAll, every test here would
     * quietly return an empty `photoUrls` rather than failing loudly.
     */
    beforeEach(() => {
      const gw = storageGateway();
      if (!(gw instanceof FakeStorageGateway)) throw new Error('expected the fake gateway');
      for (const path of seeded) gw.seed(path);
    });

    it('POSITIVE CONTROL: GET /demandes/:id returns a signed url per photo, in order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/demandes/${demandeId}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.photoUrls).toHaveLength(2);
      for (const u of res.body.photoUrls) expect(u).toMatch(/^https?:\/\//);
      // A signed URL, not the raw path -- the distinction the private bucket makes load-bearing.
      expect(res.body.photoUrls[0]).not.toBe(firstPath);
      expect(res.body.photoUrls[0]).toContain(firstPath);
    });

    it('returns an empty array for a demande with no photos', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/demandes/${bareId}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body.photoUrls).toEqual([]);
    });

    it('GET /demandes/mine carries the FIRST photo only, as photoUrl', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/demandes/mine')
        .set('Cookie', cookie)
        .expect(200);

      const row = res.body.find((r: { id: string }) => r.id === demandeId);
      expect(typeof row.photoUrl).toBe('string');
      expect(row.photoUrl).toContain(firstPath);
      // Singular, not an array: the list thumbnail shows one photo.
      expect(row).not.toHaveProperty('photoUrls');
    });

    it('reports photoUrl null for a demande with no photos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/demandes/mine')
        .set('Cookie', cookie)
        .expect(200);
      const row = res.body.find((r: { id: string }) => r.id === bareId);
      expect(row.photoUrl).toBeNull();
    });

    /**
     * OMITS rather than fabricates. A DemandePhoto row whose object has gone contributes
     * nothing, instead of yielding a raw path that renders as a broken image forever.
     */
    it('omits a url rather than fabricating one when the object is gone', async () => {
      await prisma.demandePhoto.create({
        data: { demandeId, storagePath: `demandes/${userId}/${DRAFT}/gone.jpg`, sortOrder: 9 },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/demandes/${demandeId}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body.photoUrls).toHaveLength(2);
    });
  });
});
