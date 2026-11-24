/**
 * French messages for Better Auth's error codes.
 *
 * Better Auth ships its own messages in English. Rendering `error.message` from
 * an auth call therefore drops English into an otherwise entirely French
 * product: that is how "Invalid email or password" reached the admin login
 * screen, sitting behind a French fallback that could never fire because
 * `message` is always populated.
 *
 * Resolve the machine-readable `error.code` through this map instead, and never
 * fall back to `error.message`. The keys are Better Auth's BASE_ERROR_CODES
 * (`@better-auth/core/error`), and the coverage test asserts every one of them
 * is mapped, so an upgrade that introduces a new code fails the suite rather
 * than leaking English to a user.
 *
 * Codes a user should never be able to reach on their own (internal failures,
 * callback-URL and origin misconfiguration) deliberately share the generic
 * sentence: they carry no actionable meaning, and naming the mechanism would
 * only expose plumbing.
 */
export const AUTH_ERROR_FALLBACK_FR = 'Une erreur est survenue. Veuillez réessayer.';

export const AUTH_ERROR_MESSAGES_FR: Record<string, string> = {
  // Credentials and account lookup.
  INVALID_EMAIL_OR_PASSWORD: 'Adresse e-mail ou mot de passe incorrect.',
  INVALID_PASSWORD: 'Mot de passe incorrect.',
  INVALID_EMAIL: 'Adresse e-mail invalide.',
  USER_NOT_FOUND: 'Aucun compte ne correspond à cette adresse e-mail.',
  INVALID_USER: 'Aucun compte ne correspond à cette adresse e-mail.',
  USER_EMAIL_NOT_FOUND: "Aucune adresse e-mail n'est associée à ce compte.",
  ACCOUNT_NOT_FOUND: 'Compte introuvable.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Aucun mot de passe n'est associé à ce compte.",

  // Sign-up.
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cette adresse e-mail.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'Un compte existe déjà avec cette adresse e-mail. Utilisez une autre adresse.',
  PASSWORD_TOO_SHORT: 'Le mot de passe est trop court.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long.',
  // Ours, not Better Auth's: thrown by the create.before hook in auth.ts when a
  // phone is malformed or already taken. Mapped here so the mobile client
  // resolves it the same way it resolves every Better Auth code.
  INVALID_PHONE: 'Indiquez un numéro de mobile français (06 ou 07).',
  PHONE_ALREADY_EXISTS: 'Ce numéro de téléphone est déjà utilisé.',
  // Ours, not Better Auth's: thrown by normalise-username.ts on both the create
  // and update hooks. Mapped here for the same reason the phone codes are - the
  // mobile client resolves a CODE and never a message, so an unmapped code
  // degrades silently to the generic sentence.
  INVALID_USERNAME: 'Entre 3 et 20 caractères : lettres, chiffres et _ uniquement.',
  USERNAME_ALREADY_EXISTS: "Ce nom d'utilisateur est déjà pris.",
  CGU_REQUIRED: "Vous devez accepter les Conditions Générales d'Utilisation pour créer un compte.",

  // Password state.
  USER_ALREADY_HAS_PASSWORD: 'Un mot de passe est déjà défini pour ce compte.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini pour ce compte.',

  // Email verification.
  EMAIL_NOT_VERIFIED: "Votre adresse e-mail n'est pas encore vérifiée.",
  EMAIL_ALREADY_VERIFIED: 'Votre adresse e-mail est déjà vérifiée.',
  EMAIL_MISMATCH: 'Adresse e-mail incorrecte.',
  EMAIL_CAN_NOT_BE_UPDATED: 'Cette adresse e-mail ne peut pas être modifiée.',
  CHANGE_EMAIL_DISABLED: "La modification de l'adresse e-mail est indisponible.",
  VERIFICATION_EMAIL_NOT_ENABLED: AUTH_ERROR_FALLBACK_FR,

  // Reset and verification links.
  INVALID_TOKEN: "Ce lien n'est plus valide. Demandez un nouveau lien.",
  TOKEN_EXPIRED: 'Ce lien a expiré. Demandez un nouveau lien.',
  FAILED_TO_CREATE_VERIFICATION: AUTH_ERROR_FALLBACK_FR,

  // Sessions.
  SESSION_EXPIRED: 'Votre session a expiré. Reconnectez-vous.',
  SESSION_NOT_FRESH: 'Votre session a expiré. Reconnectez-vous.',
  FAILED_TO_GET_SESSION: AUTH_ERROR_FALLBACK_FR,
  FAILED_TO_CREATE_SESSION: AUTH_ERROR_FALLBACK_FR,

  // Linked and social accounts.
  SOCIAL_ACCOUNT_ALREADY_LINKED: 'Ce compte est déjà relié à un autre utilisateur.',
  LINKED_ACCOUNT_ALREADY_EXISTS: 'Ce compte est déjà relié.',
  FAILED_TO_UNLINK_LAST_ACCOUNT:
    'Vous ne pouvez pas dissocier votre dernier moyen de connexion.',
  PROVIDER_NOT_FOUND: "Ce mode de connexion n'est pas disponible.",
  ID_TOKEN_NOT_SUPPORTED: "Ce mode de connexion n'est pas disponible.",
  FAILED_TO_GET_USER_INFO: 'Impossible de récupérer vos informations. Veuillez réessayer.',

  // Validation.
  VALIDATION_ERROR: 'Les informations saisies sont invalides.',
  MISSING_FIELD: 'Ce champ est obligatoire.',
  FIELD_NOT_ALLOWED: 'Les informations saisies sont invalides.',
  BODY_MUST_BE_AN_OBJECT: 'Les informations saisies sont invalides.',
  ASYNC_VALIDATION_NOT_SUPPORTED: AUTH_ERROR_FALLBACK_FR,

  // Security. The user cannot act on the mechanism, only on the retry.
  CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
    'La connexion a été bloquée pour des raisons de sécurité. Veuillez réessayer.',
  // V7 A11 (U2): no duration, because the lock now lasts 15 min and doubles. The server's own
  // message carries the real time; the dashboard shows it, an installed build shows this.
  TOO_MANY_REQUESTS:
    'Trop de tentatives. Votre compte est temporairement bloqué. Réessayez plus tard ou réinitialisez votre mot de passe.',
  INVALID_ORIGIN: AUTH_ERROR_FALLBACK_FR,
  MISSING_OR_NULL_ORIGIN: AUTH_ERROR_FALLBACK_FR,
  INVALID_CALLBACK_URL: AUTH_ERROR_FALLBACK_FR,
  INVALID_REDIRECT_URL: AUTH_ERROR_FALLBACK_FR,
  INVALID_ERROR_CALLBACK_URL: AUTH_ERROR_FALLBACK_FR,
  INVALID_NEW_USER_CALLBACK_URL: AUTH_ERROR_FALLBACK_FR,
  CALLBACK_URL_REQUIRED: AUTH_ERROR_FALLBACK_FR,

  // Internal failures.
  FAILED_TO_CREATE_USER: AUTH_ERROR_FALLBACK_FR,
  FAILED_TO_UPDATE_USER: AUTH_ERROR_FALLBACK_FR,
  METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED: AUTH_ERROR_FALLBACK_FR,

  // Two-factor plugin (CF4-41 / CF4-43). Not in BASE_ERROR_CODES, so the coverage test does not
  // demand them; mapped because both the dashboard and the app's code step can receive them.
  INVALID_CODE: 'Code incorrect.',
  INVALID_BACKUP_CODE: 'Code de secours incorrect.',
  INVALID_TWO_FACTOR_COOKIE: 'La vérification a expiré. Reconnectez-vous.',
  OTP_HAS_EXPIRED: 'La vérification a expiré. Reconnectez-vous.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Trop de tentatives. Reconnectez-vous.',
  ACCOUNT_TEMPORARILY_LOCKED:
    'Trop de tentatives. Votre compte est bloqué temporairement. Réessayez plus tard.',
  TWO_FACTOR_NOT_ENABLED: AUTH_ERROR_FALLBACK_FR,
  TOTP_NOT_ENABLED: AUTH_ERROR_FALLBACK_FR,
  OTP_NOT_ENABLED: AUTH_ERROR_FALLBACK_FR,
  BACKUP_CODES_NOT_ENABLED: AUTH_ERROR_FALLBACK_FR,
};

/**
 * Turn a Better Auth error code into a French sentence.
 *
 * Pass the call site's own French sentence as `fallback` when it is more
 * specific than the generic one. Never pass `error.message`: it is the English
 * string this function exists to keep off the screen.
 */
export function authErrorMessageFr(
  code?: string | null,
  fallback: string = AUTH_ERROR_FALLBACK_FR,
): string {
  if (!code) return fallback;
  return AUTH_ERROR_MESSAGES_FR[code] ?? fallback;
}
