import { describe, expect, it, vi } from 'vitest';
import { assertIdentityVerified } from '../src/verification/gate.js';

/**
 * V7 A3 (2026-10-28). The client's Android account `@hamed` is a self-declared professional at
 * level IDENTITY with no business verification, so the offer gate refuses him, which is the
 * client's own rule (`CLIENT_FEEDBACK_V2.md` §2, `DEC7-06`: « Réparateur professionnel →
 * vérification d'identité + vérification SIRET »). The defect is the sentence: it said « Vérifiez
 * votre identité », and his identity IS verified. The rule stays; the refusal now names the step
 * he is actually missing.
 */

const IDENTITY_FR = 'Vérifiez votre identité pour envoyer une offre.';
const BUSINESS_FR = 'Faites vérifier votre entreprise dans « Mon entreprise » pour envoyer une offre.';
// The client's own « Vérification en cours » message, V2 §2.
const PENDING_FR =
  'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.';
const REDO_FR = "Votre vérification d'entreprise est à refaire : ouvrez « Mon entreprise » pour en voir le motif.";

function prismaFor(level: string, kind: 'PRO' | 'INDIVIDUAL' | null, business: { status: string } | null) {
  return {
    profile: { findFirst: vi.fn().mockResolvedValue({ verificationLevel: level }) },
    repairerProfile: { findUnique: vi.fn().mockResolvedValue(kind ? { kind } : null) },
    businessVerification: { findUnique: vi.fn().mockResolvedValue(business) },
  };
}

async function refusal(level: string, kind: 'PRO' | 'INDIVIDUAL' | null, business: { status: string } | null) {
  const err = await assertIdentityVerified(prismaFor(level, kind, business) as never, 'u1', 'offer').then(
    () => null,
    (e: unknown) => e,
  );
  expect((err as { code?: string } | null)?.code).toBe('FORBIDDEN');
  return (err as Error).message;
}

describe('V7 A3: the offer gate names the missing step', () => {
  it('a PRO at IDENTITY with no business verification is sent to Mon entreprise', async () => {
    expect(await refusal('IDENTITY', 'PRO', null)).toBe(BUSINESS_FR);
  });

  it('a PRO at IDENTITY whose business is pending gets the client\'s « Vérification en cours »', async () => {
    expect(await refusal('IDENTITY', 'PRO', { status: 'PENDING' })).toBe(PENDING_FR);
  });

  it.each(['REJECTED', 'DOCUMENTS_REQUIRED'])('a PRO at IDENTITY whose business is %s is told to redo it', async (status) => {
    expect(await refusal('IDENTITY', 'PRO', { status })).toBe(REDO_FR);
  });

  it('a PRO whose identity is NOT verified still gets the identity sentence (identity comes first)', async () => {
    expect(await refusal('BASIC', 'PRO', { status: 'PENDING' })).toBe(IDENTITY_FR);
  });

  it.each([['INDIVIDUAL'], [null]] as const)('a %s below IDENTITY still gets the identity sentence', async (kind) => {
    expect(await refusal('BASIC', kind, null)).toBe(IDENTITY_FR);
  });

  it('a PRO at BUSINESS passes, and the business row is never read', async () => {
    const prisma = prismaFor('BUSINESS', 'PRO', null);
    await expect(assertIdentityVerified(prisma as never, 'u1', 'offer')).resolves.toBeUndefined();
    expect(prisma.businessVerification.findUnique).not.toHaveBeenCalled();
  });
});
