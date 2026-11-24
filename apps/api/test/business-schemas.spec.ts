import { describe, expect, it } from 'vitest';
import {
  COMPANY_IDENTIFIER_INVALID_FR,
  companyIdentifierSchema,
  isLuhnValid,
  normaliseCompanyIdentifier,
} from '@revime/shared';

describe('company identifier', () => {
  it('strips the spaces and dots a SIRET is written with in France', () => {
    expect(normaliseCompanyIdentifier('980 491 005 00016')).toBe('98049100500016');
    expect(normaliseCompanyIdentifier('401.304.589')).toBe('401304589');
  });

  it('accepts every real SIREN read back from the registry on 2026-08-19', () => {
    // 356000000 is La Poste, the documented edge case, and it satisfies Luhn like
    // the rest. Measured, not assumed.
    for (const siren of ['356000000', '120027016', '980491005', '401304589']) {
      expect(isLuhnValid(siren)).toBe(true);
    }
  });

  it("rejects the bogus number the registry's fuzzy search answers a row for", () => {
    // q=123456789 returned a result on 2026-08-19. This local check is what stops
    // garbage costing a network call and a ledger row.
    expect(isLuhnValid('123456789')).toBe(false);
    expect(companyIdentifierSchema.safeParse('123456789').success).toBe(false);
  });

  it('accepts a 14-digit SIRET and deliberately does not Luhn all fourteen', () => {
    expect(companyIdentifierSchema.parse('98049100500016')).toBe('98049100500016');
    // Leading nine valid, trailing five unchecked on purpose: La Poste's SIRETs are
    // documented as following a different rule, that documentation was not verified,
    // and refusing a real company on an unverified rule is the worse error.
    expect(companyIdentifierSchema.parse('98049100599999')).toBe('98049100599999');
  });

  it('refuses a length that is neither 9 nor 14, in French', () => {
    const res = companyIdentifierSchema.safeParse('9804910050');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]!.message).toBe(COMPANY_IDENTIFIER_INVALID_FR);
    }
  });

  it('normalises before measuring length, so a spaced SIRET is accepted', () => {
    expect(companyIdentifierSchema.parse('980 491 005 00016')).toBe('98049100500016');
  });
});
