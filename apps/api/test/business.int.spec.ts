import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  FakeRegistryGateway,
  registryGateway,
  type RegistryCompany,
} from '../src/business/gateway.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

const SIREN = '980491005';
const SIRET = '98049100500016';

const sampleCompany = (over: Partial<RegistryCompany> = {}): RegistryCompany => ({
  siren: SIREN,
  siret: SIRET,
  denomination: 'ATELIER FIXTURE',
  legalFormCode: '1000',
  establishmentAddress: '12 RUE DE LA FIXTURE 16000 ANGOULEME',
  etatAdministratif: 'A',
  diffusible: true,
  dirigeants: [{ nom: 'FIXTURE', prenoms: 'CAMILLE', qualite: null }],
  ...over,
});

describe('business verification (CF5-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: FakeRegistryGateway;
  const createdEmails: string[] = [];

  const signUpload = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/business/sign-document-upload')
      .set('Cookie', cookie)
      .send(body);

  const lookup = (cookie: string, identifier: string) =>
    request(app.getHttpServer())
      .post('/api/v1/business/lookup')
      .set('Cookie', cookie)
      .send({ identifier });

  const submit = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/business/submit')
      .set('Cookie', cookie)
      .send(body);

  const status = (cookie: string) =>
    request(app.getHttpServer()).get('/api/v1/business/status').set('Cookie', cookie);

  /** A réparateur at a chosen level with first/last name. */
  const repairerAt = async (
    level: 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS',
    nameOpts: { firstName?: string; lastName?: string } = {
      firstName: 'Jean',
      lastName: 'Dupont',
    },
  ) => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: nameOpts.firstName,
        lastName: nameOpts.lastName,
      },
    });
    await prisma.profile.update({
      where: { userId: user.id },
      data: { verificationLevel: level, verifiedAt: new Date() },
    });
    return { id: user.id, cookie, user };
  };

  const levelOf = async (userId: string) =>
    (await prisma.profile.findUniqueOrThrow({ where: { userId } })).verificationLevel;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fake = registryGateway() as FakeRegistryGateway;
    expect(fake).toBeInstanceOf(FakeRegistryGateway);
  });

  afterEach(() => {
    fake.reset();
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
  });

  describe('authentication & eligibility guards', () => {
    it('refuses unauthenticated callers on all business routes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/business/sign-document-upload')
        .send({ filename: 'kbis.pdf', mimeType: 'application/pdf', sizeBytes: 1024 })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/business/lookup')
        .send({ identifier: SIRET })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/business/submit')
        .send({
          identifier: SIRET,
          denomination: 'TEST',
          legalForm: 'SAS',
          establishmentAddress: '10 Rue de Paris 75001 Paris',
          registrationProof: { path: 'business-documents/u/doc.pdf', name: 'doc.pdf', sizeBytes: 100 },
        })
        .expect(401);

      await request(app.getHttpServer()).get('/api/v1/business/status').expect(401);
    });

    it('refuses signDocumentUpload below IDENTITY with 403 IDENTITY_FIRST', async () => {
      const { cookie } = await repairerAt('BASIC');
      const res = await signUpload(cookie, {
        filename: 'kbis.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }).expect(403);

      expect(res.body.error.message).toBe(
        'Vérifiez votre identité avant de vérifier votre entreprise.',
      );
    });

    it('refuses submit below IDENTITY with 403 IDENTITY_FIRST', async () => {
      const { cookie } = await repairerAt('NONE');
      const res = await submit(cookie, {
        identifier: SIRET,
        denomination: 'TEST',
        legalForm: 'SAS',
        establishmentAddress: '10 Rue de Paris 75001 Paris',
        registrationProof: { path: 'business-documents/u/doc.pdf', name: 'doc.pdf', sizeBytes: 100 },
      }).expect(403);

      expect(res.body.error.message).toBe(
        'Vérifiez votre identité avant de vérifier votre entreprise.',
      );
    });
  });

  describe('POST /business/sign-document-upload', () => {
    it('generates a signed upload URL for valid document parameters', async () => {
      const { id, cookie } = await repairerAt('IDENTITY');
      const res = await signUpload(cookie, {
        filename: 'kbis 2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      }).expect(201);

      expect(res.body.path).toMatch(new RegExp(`^business-documents/${id}/[a-f0-9-]+-kbis_2026\\.pdf$`));
      expect(res.body.uploadUrl).toBeDefined();
    });

    it('accepts image/jpeg and image/png', async () => {
      const { cookie } = await repairerAt('IDENTITY');

      const jpegRes = await signUpload(cookie, {
        filename: 'assurance.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }).expect(201);
      expect(jpegRes.body.uploadUrl).toBeDefined();

      const pngRes = await signUpload(cookie, {
        filename: 'assurance.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }).expect(201);
      expect(pngRes.body.uploadUrl).toBeDefined();
    });

    it('rejects unsupported mime types with 400', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      await signUpload(cookie, {
        filename: 'bad.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 1024,
      }).expect(400);
    });

    it('rejects files exceeding 10MB with 400', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      await signUpload(cookie, {
        filename: 'heavy.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
      }).expect(400);
    });
  });

  describe('POST /business/lookup', () => {
    it('returns company details for a valid active registered company', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      fake.register(sampleCompany());

      const res = await lookup(cookie, SIRET).expect(201);

      expect(res.body).toEqual({
        found: true,
        company: {
          siren: SIREN,
          siret: SIRET,
          denomination: 'ATELIER FIXTURE',
          legalForm: '1000',
          address: '12 RUE DE LA FIXTURE 16000 ANGOULEME',
        },
      });
    });

    it('returns { found: false } for an unregistered company without throwing', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      const res = await lookup(cookie, SIRET).expect(201);
      expect(res.body).toEqual({ found: false });
    });

    it('returns { found: false } for a closed/ceased company', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      fake.register(sampleCompany({ etatAdministratif: 'C' }));

      const res = await lookup(cookie, SIRET).expect(201);
      expect(res.body).toEqual({ found: false });
    });

    it('returns { found: false } when registry lookup fails/errors', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      fake.register(sampleCompany());
      fake.failNextLookupOnce();

      const res = await lookup(cookie, SIRET).expect(201);
      expect(res.body).toEqual({ found: false });
    });
  });

  describe('POST /business/submit', () => {
    it('successfully submits verification, locks dirigeantName to verified identity, and sets status to PENDING', async () => {
      const { id, cookie } = await repairerAt('IDENTITY', {
        firstName: 'Camille',
        lastName: 'Fixture',
      });

      const payload = {
        identifier: SIRET,
        denomination: 'Atelier Fixture SAS',
        legalForm: 'SAS',
        establishmentAddress: '12 Rue de la Fixture 16000 Angoulême',
        vatNumber: 'FR12345678901',
        registrationProof: {
          path: `business-documents/${id}/kbis.pdf`,
          name: 'kbis.pdf',
          sizeBytes: 2048,
        },
        insuranceProof: {
          path: `business-documents/${id}/assurance.pdf`,
          name: 'assurance.pdf',
          sizeBytes: 4096,
        },
      };

      const res = await submit(cookie, payload).expect(201);

      expect(res.body.verified).toBe(false);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.canEdit).toBe(false);
      expect(res.body.company).toMatchObject({
        siren: SIREN,
        siret: SIRET,
        denomination: 'Atelier Fixture SAS',
        legalForm: 'SAS',
        establishmentAddress: '12 Rue de la Fixture 16000 Angoulême',
        vatNumber: 'FR12345678901',
        dirigeantName: 'Camille Fixture',
        registrationProofName: 'kbis.pdf',
        insuranceProofName: 'assurance.pdf',
      });

      // Verify database record
      const dbRow = await prisma.businessVerification.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(dbRow.status).toBe('PENDING');
      expect(dbRow.siren).toBe(SIREN);
      expect(dbRow.siret).toBe(SIRET);
      expect(dbRow.denomination).toBe('Atelier Fixture SAS');
      expect(dbRow.legalForm).toBe('SAS');
      expect(dbRow.establishmentAddress).toBe('12 Rue de la Fixture 16000 Angoulême');
      expect(dbRow.vatNumber).toBe('FR12345678901');
      expect(dbRow.dirigeantName).toBe('Camille Fixture');
      expect(dbRow.registrationProofPath).toBe(`business-documents/${id}/kbis.pdf`);
      expect(dbRow.insuranceProofPath).toBe(`business-documents/${id}/assurance.pdf`);
      expect(dbRow.decisionMotif).toBeNull();
      expect(dbRow.decisionNote).toBeNull();
      expect(dbRow.decidedAt).toBeNull();
    });

    it('falls back to User.name when firstName/lastName are absent', async () => {
      const { id, cookie, user } = await repairerAt('IDENTITY', {
        firstName: undefined,
        lastName: undefined,
      });

      const payload = {
        identifier: SIREN,
        denomination: 'Atelier Individuel',
        legalForm: 'Micro-entreprise / Auto-entrepreneur',
        establishmentAddress: '12 Rue de la Paix 75002 Paris',
        registrationProof: {
          path: `business-documents/${id}/kbis.pdf`,
          name: 'kbis.pdf',
          sizeBytes: 2048,
        },
      };

      const res = await submit(cookie, payload).expect(201);
      expect(res.body.company?.dirigeantName).toBe(user.name);
    });

    it('demotes a BUSINESS profile back to IDENTITY on re-submission (revoking badge until re-approved)', async () => {
      const { id, cookie } = await repairerAt('BUSINESS');
      expect(await levelOf(id)).toBe('BUSINESS');

      const payload = {
        identifier: SIRET,
        denomination: 'Atelier Modifié',
        legalForm: 'SARL',
        establishmentAddress: '15 Boulevard Haussmann 75009 Paris',
        registrationProof: {
          path: `business-documents/${id}/kbis_new.pdf`,
          name: 'kbis_new.pdf',
          sizeBytes: 2048,
        },
      };

      const res = await submit(cookie, payload).expect(201);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.verified).toBe(false);
      // Profile demoted to IDENTITY
      expect(await levelOf(id)).toBe('IDENTITY');

      const dbRow = await prisma.businessVerification.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(dbRow.status).toBe('PENDING');
      expect(dbRow.denomination).toBe('Atelier Modifié');
    });

    it('resets decision fields when re-submitting after REJECTED or DOCUMENTS_REQUIRED', async () => {
      const { id, cookie } = await repairerAt('IDENTITY');

      // Pre-seed a rejected verification
      await prisma.businessVerification.create({
        data: {
          userId: id,
          status: 'REJECTED',
          siren: SIREN,
          denomination: 'Old Denomination',
          legalForm: 'SAS',
          establishmentAddress: 'Old Address',
          dirigeantName: 'Old Name',
          registrationProofPath: 'old/path.pdf',
          registrationProofName: 'old.pdf',
          registrationProofSizeBytes: 100,
          decisionMotif: 'DOCUMENT_ILLEGIBLE',
          decisionNote: 'Le KBIS est flou.',
          decidedAt: new Date(),
          decidedByUserId: 'admin-1',
        },
      });

      const payload = {
        identifier: SIREN,
        denomination: 'New Denomination',
        legalForm: 'SASU',
        establishmentAddress: 'New Address 75001 Paris',
        registrationProof: {
          path: `business-documents/${id}/kbis_clean.pdf`,
          name: 'kbis_clean.pdf',
          sizeBytes: 1500,
        },
      };

      const res = await submit(cookie, payload).expect(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.decision).toBeNull();

      const updated = await prisma.businessVerification.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(updated.status).toBe('PENDING');
      expect(updated.decisionMotif).toBeNull();
      expect(updated.decisionNote).toBeNull();
      expect(updated.decidedAt).toBeNull();
      expect(updated.decidedByUserId).toBeNull();
    });
  });

  describe('GET /business/status', () => {
    it('returns empty state when no verification exists', async () => {
      const { cookie } = await repairerAt('IDENTITY');
      const res = await status(cookie).expect(200);

      expect(res.body).toEqual({
        verified: false,
        status: null,
        canEdit: true,
        company: null,
        decision: null,
      });
    });

    it('formats APPROVED status response correctly with canEdit=false', async () => {
      const { id, cookie } = await repairerAt('BUSINESS');
      const now = new Date();

      await prisma.businessVerification.create({
        data: {
          userId: id,
          status: 'APPROVED',
          siren: SIREN,
          siret: SIRET,
          denomination: 'ATELIER PRO',
          legalForm: 'SAS',
          establishmentAddress: '10 Rue de Lyon 69001 Lyon',
          vatNumber: 'FR99887766554',
          dirigeantName: 'Jean Dupont',
          registrationProofPath: 'path/kbis.pdf',
          registrationProofName: 'kbis.pdf',
          registrationProofSizeBytes: 1024,
          insuranceProofPath: 'path/assurance.pdf',
          insuranceProofName: 'assurance.pdf',
          insuranceProofSizeBytes: 2048,
          submittedAt: now,
          verifiedAt: now,
        },
      });

      const res = await status(cookie).expect(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.canEdit).toBe(false);
      expect(res.body.company.siren).toBe(SIREN);
      expect(res.body.company.siret).toBe(SIRET);
      expect(res.body.company.vatNumber).toBe('FR99887766554');
      expect(res.body.company.insuranceProofName).toBe('assurance.pdf');
      expect(res.body.decision).toBeNull();
    });

    it('formats REJECTED status response correctly with decision and canEdit=true', async () => {
      const { id, cookie } = await repairerAt('IDENTITY');
      const decidedAt = new Date();

      await prisma.businessVerification.create({
        data: {
          userId: id,
          status: 'REJECTED',
          siren: SIREN,
          denomination: 'ATELIER REJETE',
          legalForm: 'SARL',
          establishmentAddress: '5 Place Bellecour 69002 Lyon',
          dirigeantName: 'Jean Dupont',
          registrationProofPath: 'path/kbis.pdf',
          registrationProofName: 'kbis.pdf',
          registrationProofSizeBytes: 1024,
          decisionMotif: 'DIRIGEANT_MISMATCH',
          decisionNote: 'Le nom ne correspond pas.',
          decidedAt,
          decidedByUserId: 'admin-id',
        },
      });

      const res = await status(cookie).expect(200);
      expect(res.body.verified).toBe(false);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.canEdit).toBe(true);
      expect(res.body.decision).toEqual({
        motif: 'DIRIGEANT_MISMATCH',
        note: 'Le nom ne correspond pas.',
        decidedAt: decidedAt.toISOString(),
      });
    });

    it('formats DOCUMENTS_REQUIRED status with canEdit=true', async () => {
      const { id, cookie } = await repairerAt('IDENTITY');
      const decidedAt = new Date();

      await prisma.businessVerification.create({
        data: {
          userId: id,
          status: 'DOCUMENTS_REQUIRED',
          siren: SIREN,
          denomination: 'ATELIER DOCS REQUIRED',
          legalForm: 'SARL',
          establishmentAddress: '5 Place Bellecour 69002 Lyon',
          dirigeantName: 'Jean Dupont',
          registrationProofPath: 'path/kbis.pdf',
          registrationProofName: 'kbis.pdf',
          registrationProofSizeBytes: 1024,
          decisionMotif: 'DOCUMENT_EXPIRED',
          decisionNote: 'KBIS datant de plus de 3 mois.',
          decidedAt,
        },
      });

      const res = await status(cookie).expect(200);
      expect(res.body.verified).toBe(false);
      expect(res.body.status).toBe('DOCUMENTS_REQUIRED');
      expect(res.body.canEdit).toBe(true);
      expect(res.body.decision).toEqual({
        motif: 'DOCUMENT_EXPIRED',
        note: 'KBIS datant de plus de 3 mois.',
        decidedAt: decidedAt.toISOString(),
      });
    });
  });
});
