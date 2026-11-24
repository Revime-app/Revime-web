import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/identity/identity.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeIdentityGateway, identityGateway, __resetIdentityGateway } from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * CF4-39 (sub-project M, spec §4.3 and §4.5). `start()` after an operator's decision, and the
 * decision on `status()`. Harness and env block copied from `identity-variant.spec.ts`.
 *
 * Review Focus 3: a refused user's row still reads VERIFIED (the session Stripe verified), so the
 * installed build's « Commencer » must reach a FRESH session, not « déjà vérifiée ». A
 * fraud-signalled user still cannot pick document-only.
 */

const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';
const ALREADY_VERIFIED = 'Votre identité est déjà vérifiée.';
const IN_PROGRESS = 'Vérification en cours.';
const SELFIE_REQUIRED = 'La vérification avec reconnaissance faciale est nécessaire pour votre compte.';

type Decision = 'ACCEPTED' | 'REFUSED' | 'DOCUMENTS_REQUESTED' | null;
type Row = {
  stripeSessionId: string;
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  variant: 'DOCUMENT_AND_SELFIE' | 'DOCUMENT_ONLY';
  selfieFraudSignalAt: Date | null;
  decision: Decision;
} | null;

const CLEARED = {
  decision: null,
  decisionMotif: null,
  decisionNote: null,
  decidedAt: null,
  decidedByUserId: null,
};

function harness(existing: Row = null) {
  const upsert = vi.fn().mockResolvedValue({});
  const prisma = {
    profile: {
      findFirst: vi.fn().mockResolvedValue({ verificationLevel: 'BASIC' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    identityVerification: { findUnique: vi.fn().mockResolvedValue(existing), upsert },
  };
  const service = new IdentityService(prisma as unknown as PrismaService, { emit: vi.fn() } as never);
  const gateway = identityGateway() as FakeIdentityGateway;
  return { service, upsert, gateway, prisma };
}

const row = (over: Partial<NonNullable<Row>>): Row => ({
  stripeSessionId: 'vs_old',
  status: 'VERIFIED',
  variant: 'DOCUMENT_AND_SELFIE',
  selfieFraudSignalAt: null,
  decision: null,
  ...over,
});

const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppException);
  return (e as AppException).message;
};

beforeEach(() => {
  __resetIdentityGateway();
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'https://api.example.test';
  delete process.env.STRIPE_DRIVER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe('IdentityService.start after an operator decision', () => {
  it.each(['REFUSED', 'DOCUMENTS_REQUESTED'] as const)(
    'a %s row reading VERIFIED gets a fresh session, no resume, no cancel, decision cleared',
    async (decision) => {
      const { service, upsert, gateway } = harness(row({ status: 'VERIFIED', decision }));
      const retrieve = vi.spyOn(gateway, 'retrieveSession');

      const res = await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });

      expect(res.url).toMatch(/fake_identity=/);
      expect(gateway.createCalls).toHaveLength(1);
      expect(retrieve).not.toHaveBeenCalled();
      expect(gateway.cancelCalls).toEqual([]);
      expect(upsert.mock.calls[0]![0].update).toMatchObject(CLEARED);
    },
  );

  it('a refused row on a variant change also skips the live re-check and the cancel', async () => {
    const { service, gateway } = harness(row({ status: 'VERIFIED', decision: 'REFUSED' }));
    const retrieve = vi.spyOn(gateway, 'retrieveSession');

    await service.start(USER, { variant: 'DOCUMENT_ONLY' });

    expect(gateway.createCalls[0]!.variant).toBe('DOCUMENT_ONLY');
    expect(retrieve).not.toHaveBeenCalled();
    expect(gateway.cancelCalls).toEqual([]);
  });

  it('a refused fraud-signalled user still cannot pick document-only', async () => {
    const { service, gateway } = harness(
      row({ status: 'VERIFIED', decision: 'REFUSED', selfieFraudSignalAt: new Date() }),
    );
    expect(await refusal(service.start(USER, { variant: 'DOCUMENT_ONLY' }))).toBe(SELFIE_REQUIRED);
    expect(gateway.createCalls).toHaveLength(0);
  });

  it('a refused row whose session is PROCESSING is still refused « en cours »', async () => {
    const { service } = harness(row({ status: 'PROCESSING', decision: 'REFUSED' }));
    expect(await refusal(service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' }))).toBe(IN_PROGRESS);
  });

  it('an ACCEPTED row is refused « déjà vérifiée », whatever the session status', async () => {
    const { service, gateway } = harness(row({ status: 'REQUIRES_INPUT', decision: 'ACCEPTED' }));
    const retrieve = vi.spyOn(gateway, 'retrieveSession');
    expect(await refusal(service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' }))).toBe(ALREADY_VERIFIED);
    expect(retrieve).not.toHaveBeenCalled();
    expect(gateway.createCalls).toHaveLength(0);
  });

  it('a plain VERIFIED row with no decision is still refused', async () => {
    const { service } = harness(row({ status: 'VERIFIED', decision: null }));
    expect(await refusal(service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' }))).toBe(ALREADY_VERIFIED);
  });

  it('a PROCESSING row with no decision is still refused', async () => {
    const { service } = harness(row({ status: 'PROCESSING', decision: null }));
    expect(await refusal(service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' }))).toBe(IN_PROGRESS);
  });

  it('an ordinary new session also clears the five decision fields', async () => {
    const { service, upsert } = harness(null);
    await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });
    expect(upsert.mock.calls[0]![0].update).toMatchObject(CLEARED);
  });

  it('selects the decision on the existing row', async () => {
    const { service, prisma } = harness(null);
    await service.start(USER, { variant: 'DOCUMENT_AND_SELFIE' });
    expect(prisma.identityVerification.findUnique.mock.calls[0]![0].select).toMatchObject({ decision: true });
  });
});

describe('IdentityService.status reports the decision', () => {
  const statusRow = (over: Record<string, unknown>) => ({
    status: 'VERIFIED',
    verifiedAt: new Date('2026-09-01T10:00:00Z'),
    lastErrorCode: null,
    redactionStatus: null,
    erasureRequestedAt: null,
    selfieFraudSignalAt: null,
    decision: null,
    decisionMotif: null,
    decisionNote: null,
    ...over,
  });

  it('a refusal carries its motif as the reason', async () => {
    const { service, prisma } = harness(null);
    prisma.identityVerification.findUnique.mockResolvedValue(
      statusRow({ decision: 'REFUSED', decisionMotif: 'EXPIRED' }),
    );
    const res = await service.status(USER);
    expect(res.decision).toBe('REFUSED');
    expect(res.decisionReason).toBe('Document expiré');
  });

  it('a documents request carries « Autre : <note> »', async () => {
    const { service, prisma } = harness(null);
    prisma.identityVerification.findUnique.mockResolvedValue(
      statusRow({ decision: 'DOCUMENTS_REQUESTED', decisionMotif: 'OTHER', decisionNote: 'Photo coupée' }),
    );
    const res = await service.status(USER);
    expect(res.decision).toBe('DOCUMENTS_REQUESTED');
    expect(res.decisionReason).toBe('Autre : Photo coupée');
  });

  it('ACCEPTED is reported as no decision', async () => {
    const { service, prisma } = harness(null);
    prisma.identityVerification.findUnique.mockResolvedValue(
      statusRow({ decision: 'ACCEPTED', decisionNote: 'vu' }),
    );
    const res = await service.status(USER);
    expect(res.decision).toBeNull();
    expect(res.decisionReason).toBeNull();
  });

  it('no row → both null', async () => {
    const { service } = harness(null);
    const res = await service.status(USER);
    expect(res.decision).toBeNull();
    expect(res.decisionReason).toBeNull();
  });

  it('selects the three decision columns', async () => {
    const { service, prisma } = harness(null);
    await service.status(USER);
    expect(prisma.identityVerification.findUnique.mock.calls[0]![0].select).toMatchObject({
      decision: true,
      decisionMotif: true,
      decisionNote: true,
    });
  });
});
