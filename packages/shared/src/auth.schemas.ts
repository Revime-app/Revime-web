import { z } from 'zod';
import { frPhoneSchema } from './phone.schemas.js';
import { usernameSchema } from './username.schemas.js';

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom.'),
  lastName: z.string().trim().min(1, 'Indiquez votre nom.'),
  /**
   * The public identifier. Sits beside the legal names on purpose: this is the
   * ONE place in the app that explains CF-05 to a user, because the field's
   * helper text is what tells them their real name stays private.
   */
  username: usernameSchema,
  email: z.string().email('Adresse e-mail invalide.'),
  phone: frPhoneSchema,
  password: z.string().min(8, 'Au moins 8 caractères.'),
  /**
   * Pre-launch Item 2. Mandatory CGU acceptance.
   * Must be explicitly accepted (boolean true) before account creation proceeds.
   */
  cguAccepted: z.literal(true, {
    message: 'Veuillez accepter les Conditions Générales d\'Utilisation pour continuer.',
  }),
  /**
   * V9 B1 (`DEC9-04` (2)): the privacy box, required like the CGU one. Older builds do not send it;
   * the API accepts its absence (`auth.ts`), only `false` is refused.
   */
  privacyAccepted: z.literal(true, {
    message: 'Vous devez accepter la Politique de confidentialité.',
  }),
  /**
   * Pre-launch Item 3. Optional marketing opt-in consent (email / SMS).
   */
  marketingConsent: z.boolean().optional().default(false),
});

export const signInSchema = z.object({
  email: z.string().email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Adresse e-mail invalide.'),
});
