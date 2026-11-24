import { describe, expect, it, vi } from 'vitest';
import { isFiscalComplete, repairerFiscalComplete } from '../src/fiscal/fiscal-gate.js';

const facts = (over: Partial<Parameters<typeof isFiscalComplete>[0]> = {}) => ({
  kind: 'INDIVIDUAL' as const,
  fiscalCompletedAt: null,
  verificationLevel: 'IDENTITY' as const,
  businessStatus: null,
  ...over,
});

describe('isFiscalComplete, the one definition of « informations fiscales complètes » (CMP-D3)', () => {
  it('an individual is complete only once the declaration was submitted', () => {
    expect(isFiscalComplete(facts())).toBe(false);
    expect(isFiscalComplete(facts({ fiscalCompletedAt: new Date() }))).toBe(true);
  });

  it('a PRO is complete with an approved business verification, with or without the stamp', () => {
    expect(isFiscalComplete(facts({ kind: 'PRO', businessStatus: 'APPROVED' }))).toBe(true);
    expect(isFiscalComplete(facts({ kind: 'PRO', verificationLevel: 'BUSINESS' }))).toBe(true);
  });

  it('a PRO whose business check is pending or refused is NOT complete', () => {
    expect(isFiscalComplete(facts({ kind: 'PRO', businessStatus: 'PENDING' }))).toBe(false);
    expect(isFiscalComplete(facts({ kind: 'PRO', businessStatus: 'REJECTED' }))).toBe(false);
  });

  it('an INDIVIDUAL never gets the PRO shortcut, even with a BUSINESS level on the account', () => {
    expect(isFiscalComplete(facts({ verificationLevel: 'BUSINESS', businessStatus: 'APPROVED' }))).toBe(false);
  });

  it('missing facts mean incomplete, never complete', () => {
    expect(
      isFiscalComplete({ kind: undefined, fiscalCompletedAt: undefined, verificationLevel: undefined, businessStatus: undefined }),
    ).toBe(false);
  });
});

describe('repairerFiscalComplete', () => {
  const prismaReturning = (row: unknown) =>
    ({ repairerProfile: { findUnique: vi.fn().mockResolvedValue(row) } }) as never;

  it('is false when there is no réparateur profile', async () => {
    expect(await repairerFiscalComplete(prismaReturning(null), 'u1')).toBe(false);
  });

  it('reads the profile, the verification level and the business status together', async () => {
    const row = {
      kind: 'PRO',
      fiscalCompletedAt: null,
      user: { profile: { verificationLevel: 'BUSINESS' }, businessVerification: { status: 'APPROVED' } },
    };
    expect(await repairerFiscalComplete(prismaReturning(row), 'u1')).toBe(true);
  });

  it('tolerates a user with no profile or business verification rows', async () => {
    const row = { kind: 'INDIVIDUAL', fiscalCompletedAt: null, user: { profile: null, businessVerification: null } };
    expect(await repairerFiscalComplete(prismaReturning(row), 'u1')).toBe(false);
  });
});
