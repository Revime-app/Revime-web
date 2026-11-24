import { z } from 'zod';

/**
 * DGFiP French Tax Identification Number (NIF) format:
 * Exactly 13 digits, starting with 0, 1, 2, or 3.
 */
export const FRENCH_NIF_REGEX = /^[0-3]\d{12}$/;

export function validateFrenchNif(nif: string): boolean {
  if (!nif || typeof nif !== 'string') return false;
  return FRENCH_NIF_REGEX.test(nif.trim());
}

/**
 * Checks whether the given date of birth corresponds to an individual aged at least minAgeYears (18+).
 */
export function isAdultBirthDate(birthDate: string | Date, minAgeYears = 18): boolean {
  if (!birthDate) return false;
  const d = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  if (isNaN(d.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age >= minAgeYears;
}

/**
 * True for a date that exists. `new Date('1990-02-31')` does not fail, it rolls over to 3 March, so
 * the format check alone let a date of birth that never existed into a tax declaration.
 */
export function isRealCalendarDate(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === isoDate;
}

export const fiscalDeclarationInputSchema = z
  .object({
    addressLine: z.string().trim().min(3, "L'adresse est requise (au moins 3 caractères)").max(200),
    postalCode: z.string().trim().regex(/^\d{5}$/, 'Code postal invalide (5 chiffres requis)'),
    city: z.string().trim().min(1, 'La ville est requise').max(100),
    // The brief asks for « adresse française complète » and the 5-digit postal code below is a French
    // one, so the country is not a free field: a German address with a French-looking code would be
    // stored as a French tax residence.
    country: z.literal('FR', { message: 'Seule une adresse en France est acceptée.' }).default('FR'),
    hasNoNif: z.boolean().default(false),
    nif: z.string().trim().optional().nullable(),
    birthCity: z.string().trim().max(100).optional().nullable(),
    birthCountry: z.string().trim().max(100).optional().nullable(),
    birthDate: z.string().trim().optional().nullable(),
    attestation: z.literal(true, {
      message: "Vous devez attester sur l'honneur l'exactitude des informations fournies.",
    }),
  })
  .superRefine((val, ctx) => {
    if (!val.hasNoNif) {
      if (!val.nif || !validateFrenchNif(val.nif)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nif'],
          message: 'Le numéro fiscal (NIF) doit comporter 13 chiffres et commencer par 0, 1, 2 ou 3.',
        });
      }
    } else {
      if (!val.birthCity || val.birthCity.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthCity'],
          message: 'La ville de naissance est obligatoire lorsque vous ne possédez pas de NIF.',
        });
      }
      if (!val.birthCountry || val.birthCountry.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthCountry'],
          message: 'Le pays de naissance est obligatoire lorsque vous ne possédez pas de NIF.',
        });
      }
    }

    if (val.birthDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val.birthDate) || !isRealCalendarDate(val.birthDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthDate'],
          message: 'La date de naissance doit être au format AAAA-MM-JJ (ex. 1990-05-15).',
        });
      } else if (!isAdultBirthDate(val.birthDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthDate'],
          message: 'Vous devez être majeur (18 ans ou plus) pour déclarer votre activité de réparateur.',
        });
      }
    }
  });

export type FiscalDeclarationInput = z.infer<typeof fiscalDeclarationInputSchema>;

export const fiscalPreFillResponseSchema = z.object({
  legalName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthDate: z.string().nullable(),
  isBirthDateLocked: z.boolean(),
  declaration: z
    .object({
      taxResidence: z.string(),
      addressLine: z.string(),
      postalCode: z.string(),
      city: z.string(),
      country: z.string(),
      nif: z.string().nullable(),
      hasNoNif: z.boolean(),
      birthCity: z.string().nullable(),
      birthCountry: z.string().nullable(),
      submittedAt: z.string(),
    })
    .nullable(),
});

export type FiscalPreFillResponse = z.infer<typeof fiscalPreFillResponseSchema>;
