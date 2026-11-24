import { z } from 'zod';
import { frPhoneSchema } from './phone.schemas.js';

/**
 * Lives in shared rather than beside the controller because the mobile screen
 * validates the same phone before spending a request, and the French message the
 * user sees must be the same one the server would have returned.
 */
export const startPhoneVerificationSchema = z.object({ phone: frPhoneSchema });
export type StartPhoneVerificationInput = z.infer<typeof startPhoneVerificationSchema>;

export const checkPhoneVerificationSchema = z.object({
  phone: frPhoneSchema,
  // `.trim()` runs before the regex, so a pasted code with a trailing space is
  // accepted rather than rejected as seven characters.
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres.' }),
});
export type CheckPhoneVerificationInput = z.infer<typeof checkPhoneVerificationSchema>;

/**
 * The cooldown, returned on the HAPPY path. The client therefore renders its
 * countdown from a success response and never has to parse an error to learn how
 * long to wait, and the number cannot drift from the server's own constant.
 */
export type StartPhoneVerificationResponse = { retryAfterSeconds: number };

/**
 * One copy, imported by both writers. The roadmap already carries the triplicated
 * French mobile message as a deferred minor; this avoids widening that.
 */
export const PHONE_ALREADY_TAKEN_FR = 'Ce numéro de téléphone est déjà utilisé.';
