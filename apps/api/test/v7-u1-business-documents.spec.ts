import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessService } from '../src/business/business.service.js';
import { AdminVerificationsService } from '../src/admin/admin-verifications.service.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';

/**
 * V7 A4 (2026-10-28). The client's 13 KB PNG was refused by Supabase with a 400 at 20:58:57 UTC on
 * 2026-10-27 because business documents went to the `attachments` bucket, whose allowed MIME types
 * are `['application/pdf']`, while the app and `signDocumentUpload` offer JPEG and PNG. `DEC7-07`:
 * a dedicated `business-documents` bucket (PDF, JPEG, PNG, 10 MB); `attachments` keeps its PDF-only
 * rule for conversation attachments. The three PDFs already stored stay where they are, so the
 * dashboard falls back to `attachments` for a path the new bucket does not hold.
 */

const NEW_BUCKET = 'business-documents';
const LEGACY_BUCKET = 'attachments';

let fake: FakeStorageGateway;

/** The fake signs `https://fake.storage.local/<bucket>/<path>`; the PATH also starts with `business-documents/`, so a substring check cannot tell the buckets apart. */
const bucketOf = (url: string | undefined) => new URL(url ?? 'https://x/').pathname.split('/')[1];

beforeEach(() => {
  delete process.env.STORAGE_DRIVER;
  delete process.env.BUSINESS_DOCUMENT_BUCKET;
  __resetStorageGateway();
  fake = storageGateway() as FakeStorageGateway;
});

afterEach(() => __resetStorageGateway());

describe('V7 A4: business documents are signed in their own bucket', () => {
  const service = new BusinessService({
    profile: { findFirst: vi.fn().mockResolvedValue({ verificationLevel: 'IDENTITY' }) },
  } as never);

  it.each(['image/png', 'image/jpeg', 'application/pdf'] as const)('signs a %s upload in business-documents', async (mimeType) => {
    const res = await service.signDocumentUpload('u1', { filename: 'kbis.png', mimeType, sizeBytes: 13_000 });
    expect(res.path).toMatch(/^business-documents\/u1\/.+-kbis\.png$/);
    expect(bucketOf(res.uploadUrl)).toBe(NEW_BUCKET);
  });
});

describe('V7 A4: the dashboard reads the document from either bucket', () => {
  function adminFor(registrationProofPath: string, insuranceProofPath: string | null) {
    const row = {
      userId: 'u1',
      status: 'PENDING',
      siren: '980491005',
      siret: null,
      denomination: 'ATELIER',
      legalForm: 'SAS',
      establishmentAddress: '10 Rue de la Paix 75002 Paris',
      vatNumber: null,
      dirigeantName: 'Jean Dupont',
      registrationProofPath,
      registrationProofName: 'kbis.png',
      registrationProofSizeBytes: 13_000,
      insuranceProofPath,
      insuranceProofName: insuranceProofPath ? 'rc.pdf' : null,
      insuranceProofSizeBytes: insuranceProofPath ? 2_000 : null,
      decisionMotif: null,
      decisionNote: null,
      decidedAt: null,
      decidedByUserId: null,
      submittedAt: new Date('2026-10-27T20:58:57.000Z'),
      verifiedAt: null,
      user: { name: 'Jean', email: 'j@example.test', firstName: 'Jean', lastName: 'Dupont', image: null, profile: null },
    };
    const prisma = {
      businessVerification: { findUnique: vi.fn().mockResolvedValue(row) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    return new AdminVerificationsService(prisma as never, { emit: vi.fn() } as never);
  }

  it('signs a new upload from business-documents', async () => {
    fake.seed('business-documents/u1/a-kbis.png', undefined, NEW_BUCKET);
    const details = await adminFor('business-documents/u1/a-kbis.png', null).getBusinessDetails('u1');
    expect(bucketOf(details.business?.registrationProof.url)).toBe(NEW_BUCKET);
  });

  it('falls back to attachments for a document stored before the bucket existed', async () => {
    fake.seed('business-documents/u1/old-kbis.pdf', undefined, LEGACY_BUCKET);
    fake.seed('business-documents/u1/new-rc.pdf', undefined, NEW_BUCKET);
    const details = await adminFor('business-documents/u1/old-kbis.pdf', 'business-documents/u1/new-rc.pdf').getBusinessDetails('u1');
    expect(bucketOf(details.business?.registrationProof.url)).toBe(LEGACY_BUCKET);
    expect(bucketOf(details.business?.insuranceProof?.url)).toBe(NEW_BUCKET);
  });

  it('returns an empty url when neither bucket holds the object', async () => {
    const details = await adminFor('business-documents/u1/missing.png', null).getBusinessDetails('u1');
    expect(details.business?.registrationProof.url).toBe('');
  });
});
