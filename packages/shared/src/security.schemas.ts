import { z } from 'zod';

/**
 * V7 A11 (U2b). The app's device id, sent on every Better Auth request. A random string the app keeps
 * in its secure store, so it survives sign-out (the auth client wipes its cookies then). The server
 * stores only its hash. Builds without it get no « Nouvelle connexion » e-mail.
 */
export const DEVICE_ID_HEADER = 'x-revime-device';
/**
 * What the e-mail calls the device, e.g. « iPhone - application Revime ». Display only. 🛑 The app
 * must send printable ASCII (V7 `FND7-072`: « · » broke every Android login); iOS builds 40 and 41
 * still send « iPhone · application Revime », which the server keeps accepting.
 */
export const DEVICE_LABEL_HEADER = 'x-revime-device-label';

/** The answer to a sensitive action when the session has not confirmed the password in the last 10 minutes. */
export const STEP_UP_REQUIRED_MESSAGE_FR = 'Confirmez votre identité pour continuer.';

/**
 * How the account confirms, as installed builds (44, APK `a754d6d0`) read it: its password, or a code by
 * e-mail when it has none. Kept unchanged for them; the V9 U3 sheet reads `providers` and `hasPassword`.
 */
export type StepUpMethod = 'PASSWORD' | 'EMAIL_CODE';

/** V9 U3 (`DEC9-09`). A sign-in provider the account is linked to. */
export type StepUpProvider = 'APPLE' | 'GOOGLE';
/** What the sheet offers. */
export type StepUpChoice = 'PASSWORD' | 'APPLE' | 'GOOGLE' | 'EMAIL_CODE';
/** Deletion always goes through the provider when one is usable (`DEC9-09` (4)); the IBAN setup does not. */
export type StepUpPurpose = 'DELETE' | 'SENSITIVE';

export type StepUpMethodResponse = { method: StepUpMethod; providers: StepUpProvider[]; hasPassword: boolean };

/**
 * V9 U3 (`DEC9-09` (1) to (4), `DEC9-10` (1)). The password first, then the usable providers; Apple is
 * usable only where the device can sign in with it (iOS). For a deletion, a usable provider replaces the
 * password. The e-mailed code only for an account with no password and no provider.
 */
export function stepUpChoices(input: {
  providers: StepUpProvider[];
  hasPassword: boolean;
  purpose: StepUpPurpose;
  appleAvailable: boolean;
}): StepUpChoice[] {
  const { providers, hasPassword, purpose, appleAvailable } = input;
  if (providers.length === 0) return [hasPassword ? 'PASSWORD' : 'EMAIL_CODE'];
  const usable = providers.filter((p) => p !== 'APPLE' || appleAvailable);
  if (purpose === 'DELETE' && usable.length > 0) return usable;
  return [...(hasPassword ? (['PASSWORD'] as const) : []), ...usable];
}

/**
 * V9 U3. What the server needs before deleting an account (switch `STEP_UP_PROVIDER_ENFORCED` on): the
 * usual step-up when no provider is linked, a provider confirmation otherwise, except an Apple-only link
 * with a password, which may use the password (Android has no Apple sign-in, `DEC9-10` (1)).
 */
export function deletionRule(input: { providers: StepUpProvider[]; hasPassword: boolean }): 'STEP_UP' | 'PROVIDER' | 'PROVIDER_OR_PASSWORD' {
  if (input.providers.length === 0) return 'STEP_UP';
  const appleOnly = input.providers.every((p) => p === 'APPLE');
  return appleOnly && input.hasPassword ? 'PROVIDER_OR_PASSWORD' : 'PROVIDER';
}

const PROVIDER_LABEL: Record<StepUpProvider, 'Apple' | 'Google'> = { APPLE: 'Apple', GOOGLE: 'Google' };

/** V9 U3 sheet copy. `DEC9-09` (8) verbatim; the rest is plan copy for the owner to confirm. */
export const STEP_UP_COPY = {
  title: 'Confirmez votre identité',
  providerLabel: (p: StepUpProvider) => PROVIDER_LABEL[p],
  providerSubtitle: (p: StepUpProvider) => `Pour votre sécurité, reconnectez-vous avec ${PROVIDER_LABEL[p]} avant de continuer.`,
  passwordOrProviderSubtitle: (p: StepUpProvider) =>
    `Pour votre sécurité, saisissez votre mot de passe ou reconnectez-vous avec ${PROVIDER_LABEL[p]} avant de continuer.`,
  appleMismatch: 'Ce compte Apple ne correspond pas à votre compte Revime.',
  googleNotConfirmed: 'La confirmation avec Google n’a pas abouti. Utilisez le compte Google de votre compte Revime.',
  codeRefused: 'Ce compte se confirme avec Apple ou Google.',
  noChoice: 'Cette confirmation se fait avec Apple, depuis un iPhone.',
} as const;

/** V9 U3. The native Apple sheet's answer; the code lets the server revoke at deletion. */
export const stepUpAppleSchema = z.object({
  identityToken: z.string().min(1).max(8192),
  authorizationCode: z.string().min(1).max(2048).optional(),
});
export type StepUpAppleInput = z.infer<typeof stepUpAppleSchema>;

/** V9 U3. The nonce the app passes to `linkSocial` as `additionalData.stepUpNonce`. */
export type GoogleStepUpStartResponse = { ok: true; nonce: string };

export const stepUpPasswordSchema = z.object({
  password: z.string({ message: 'Saisissez votre mot de passe.' }).min(1, 'Saisissez votre mot de passe.').max(128),
});
export type StepUpPasswordInput = z.infer<typeof stepUpPasswordSchema>;

export const stepUpCodeSchema = z.object({
  code: z.string({ message: 'Saisissez le code reçu par e-mail.' }).regex(/^\d{6}$/, 'Le code compte 6 chiffres.'),
});
export type StepUpCodeInput = z.infer<typeof stepUpCodeSchema>;
