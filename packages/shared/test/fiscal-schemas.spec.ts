import { describe, expect, it } from 'vitest';
import {
  FRENCH_NIF_REGEX,
  validateFrenchNif,
  isAdultBirthDate,
  isRealCalendarDate,
  fiscalDeclarationInputSchema,
  fiscalPreFillResponseSchema,
} from '../src/fiscal.schemas.js';

describe('fiscal schemas and validation (CMP-D2)', () => {
  describe('FRENCH_NIF_REGEX and validateFrenchNif', () => {
    it('accepts valid 13-digit DGFiP NIF starting with 0, 1, 2, or 3', () => {
      expect(validateFrenchNif('0123456789012')).toBe(true);
      expect(validateFrenchNif('1987654321098')).toBe(true);
      expect(validateFrenchNif('2000000000000')).toBe(true);
      expect(validateFrenchNif('3999999999999')).toBe(true);
      expect(FRENCH_NIF_REGEX.test('0123456789012')).toBe(true);
    });

    it('rejects NIF not starting with 0, 1, 2, or 3', () => {
      expect(validateFrenchNif('4123456789012')).toBe(false);
      expect(validateFrenchNif('9123456789012')).toBe(false);
    });

    it('rejects NIF that does not have exactly 13 digits', () => {
      expect(validateFrenchNif('012345678901')).toBe(false); // 12 digits
      expect(validateFrenchNif('01234567890123')).toBe(false); // 14 digits
      expect(validateFrenchNif('')).toBe(false);
    });

    it('rejects NIF containing letters or whitespace', () => {
      expect(validateFrenchNif('012345678901A')).toBe(false);
      expect(validateFrenchNif('012 345 678 901')).toBe(false);
    });
  });

  describe('isAdultBirthDate', () => {
    it('returns true for birth dates indicating 18 years or older', () => {
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      expect(isAdultBirthDate(twentyYearsAgo.toISOString())).toBe(true);
    });

    it('returns false for birth dates indicating younger than 18', () => {
      const sixteenYearsAgo = new Date();
      sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16);
      expect(isAdultBirthDate(sixteenYearsAgo.toISOString())).toBe(false);
    });

    it('returns false for invalid date strings', () => {
      expect(isAdultBirthDate('invalid-date')).toBe(false);
    });
  });

  describe('fiscalDeclarationInputSchema', () => {
    const validBaseAddress = {
      addressLine: '12 rue de la Paix',
      postalCode: '75002',
      city: 'Paris',
      country: 'FR',
      attestation: true as const,
    };

    it('validates a standard declaration with NIF', () => {
      const input = {
        ...validBaseAddress,
        hasNoNif: false,
        nif: '0123456789012',
      };
      const parsed = fiscalDeclarationInputSchema.parse(input);
      expect(parsed.nif).toBe('0123456789012');
      expect(parsed.hasNoNif).toBe(false);
      expect(parsed.attestation).toBe(true);
    });

    it('fails when attestation is missing or false', () => {
      expect(() =>
        fiscalDeclarationInputSchema.parse({
          ...validBaseAddress,
          hasNoNif: false,
          nif: '0123456789012',
          attestation: false,
        }),
      ).toThrow();
    });

    it('fails when hasNoNif is false and NIF is missing or invalid', () => {
      expect(() =>
        fiscalDeclarationInputSchema.parse({
          ...validBaseAddress,
          hasNoNif: false,
          nif: '',
        }),
      ).toThrow();

      expect(() =>
        fiscalDeclarationInputSchema.parse({
          ...validBaseAddress,
          hasNoNif: false,
          nif: '5123456789012', // Starts with 5
        }),
      ).toThrow();
    });

    it('validates a declaration without NIF when birth place is provided', () => {
      const input = {
        ...validBaseAddress,
        hasNoNif: true,
        birthCity: 'Lyon',
        birthCountry: 'FR',
      };
      const parsed = fiscalDeclarationInputSchema.parse(input);
      expect(parsed.hasNoNif).toBe(true);
      expect(parsed.birthCity).toBe('Lyon');
      expect(parsed.birthCountry).toBe('FR');
    });

    it('fails when hasNoNif is true and birth place is missing', () => {
      expect(() =>
        fiscalDeclarationInputSchema.parse({
          ...validBaseAddress,
          hasNoNif: true,
          birthCity: '',
          birthCountry: 'FR',
        }),
      ).toThrow();

      expect(() =>
        fiscalDeclarationInputSchema.parse({
          ...validBaseAddress,
          hasNoNif: true,
        }),
      ).toThrow();
    });

    it('validates birthDate if provided and enforces 18+ and format', () => {
      const input = {
        ...validBaseAddress,
        hasNoNif: false,
        nif: '1234567890123',
        birthDate: '1990-05-15',
      };
      const parsed = fiscalDeclarationInputSchema.parse(input);
      expect(parsed.birthDate).toBe('1990-05-15');

      const invalidFormat = {
        ...validBaseAddress,
        hasNoNif: false,
        nif: '1234567890123',
        birthDate: '15/05/1990',
      };
      expect(() => fiscalDeclarationInputSchema.parse(invalidFormat)).toThrow();

      const minorInput = {
        ...validBaseAddress,
        hasNoNif: false,
        nif: '1234567890123',
        birthDate: '2020-01-01',
      };
      expect(() => fiscalDeclarationInputSchema.parse(minorInput)).toThrow();
    });
  });

  describe('RU-27 review: a French address and a date that exists', () => {
    const base = {
      addressLine: '12 rue de la Paix',
      postalCode: '75002',
      city: 'Paris',
      hasNoNif: false,
      nif: '0123456789012',
      attestation: true as const,
    };

    it('refuses a country other than FR: the brief asks for « adresse française complète »', () => {
      expect(() => fiscalDeclarationInputSchema.parse({ ...base, country: 'DE' })).toThrow();
    });

    it('defaults the country to FR when it is not sent', () => {
      expect(fiscalDeclarationInputSchema.parse(base).country).toBe('FR');
    });

    it('refuses a date of birth that never existed (31 February rolls over to March in a Date)', () => {
      expect(() => fiscalDeclarationInputSchema.parse({ ...base, birthDate: '1990-02-31' })).toThrow();
      expect(() => fiscalDeclarationInputSchema.parse({ ...base, birthDate: '1990-13-01' })).toThrow();
    });

    it('accepts a real date, including 29 February of a leap year', () => {
      expect(fiscalDeclarationInputSchema.parse({ ...base, birthDate: '1988-02-29' }).birthDate).toBe('1988-02-29');
    });

    it('isRealCalendarDate', () => {
      expect(isRealCalendarDate('2000-02-29')).toBe(true);
      expect(isRealCalendarDate('1900-02-29')).toBe(false);
      expect(isRealCalendarDate('1990-04-31')).toBe(false);
    });
  });

  describe('fiscalPreFillResponseSchema', () => {
    it('validates a pre-fill response payload', () => {
      const payload = {
        legalName: 'Jean Dupont',
        firstName: 'Jean',
        lastName: 'Dupont',
        birthDate: '1985-04-12T00:00:00.000Z',
        isBirthDateLocked: true,
        declaration: {
          taxResidence: 'FR',
          addressLine: '12 rue de la Paix',
          postalCode: '75002',
          city: 'Paris',
          country: 'FR',
          nif: '0123456789012',
          hasNoNif: false,
          birthCity: null,
          birthCountry: null,
          submittedAt: new Date().toISOString(),
        },
      };
      const parsed = fiscalPreFillResponseSchema.parse(payload);
      expect(parsed.legalName).toBe('Jean Dupont');
      expect(parsed.declaration?.nif).toBe('0123456789012');
    });
  });
});
