export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNPROCESSABLE_ENTITY',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'GONE',
  'TOO_MANY_REQUESTS',
  // 503. Added by piece 5: a company-registry outage is neither our fault nor the
  // caller's, and INTERNAL would log it as a server fault while telling the user to
  // retry something that is not broken here. It also gives the app a code it can
  // distinguish, which « réessayez » depends on being true.
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
  // V7 A11 (U2b), 403: a sensitive action needs the password (or an e-mail code) again. Its own
  // code so the app can open the confirmation sheet instead of showing an error.
  'STEP_UP_REQUIRED',
  // V7 A10 (U7), 403: a private individual at the CGU art. 53 cap. Its own code so the app can show
  // the « Mon entreprise » card instead of a bare error.
  'PARTICULAR_CAP_REACHED',
  // V7 D5 (U9), 503: maintenance mode, its message the one typed in the dashboard. Its own code so
  // the app can show its maintenance screen at once; an older build shows the message as an error.
  'MAINTENANCE',
  // V7 D5 (U9b), 403: forced CGU re-acceptance pending. Its own code so the app shows its acceptance
  // screen at once; an older build shows the message as an error.
  'CGU_REACCEPT_REQUIRED',
  // V9 B1, 403: no recorded CGU acceptance while `CGU_ACCEPTANCE_ENFORCED` is on. The new build shows
  // its terms screen; an older build shows the message as an error.
  'CGU_ACCEPTANCE_REQUIRED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every non-2xx response from the API has exactly this body. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    /** French, safe to show to the user. */
    message: string;
    /** Field name → French message, for form-level rendering. */
    fields?: Record<string, string>;
  };
};

const STATUS_CODE_TO_ERROR_CODE: Partial<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'SERVICE_UNAVAILABLE',
};

/**
 * Resolves a human-readable, safe error message and error code from any response
 * body or HTTP status code. Used by both the mobile client and admin dashboard
 * when handling API errors.
 */
export function resolveApiErrorMessage(
  body: unknown,
  status?: number,
  fallback = 'Une erreur est survenue.',
): { code: ApiErrorCode; message: string; fields?: Record<string, string> } {
  const err = (body as ApiErrorBody | null)?.error;
  if (err && typeof err.message === 'string' && err.message.trim().length > 0) {
    return {
      code: err.code ?? (status ? STATUS_CODE_TO_ERROR_CODE[status] : undefined) ?? 'INTERNAL',
      message: err.message,
      fields: err.fields,
    };
  }

  let message = fallback;
  if (status === 502 || status === 504) {
    message = 'Le serveur met trop de temps à répondre. Merci de réessayer.';
  } else if (status === 503) {
    message = 'Service momentanément indisponible. Merci de réessayer.';
  } else if (status === 401) {
    message = 'Vous devez être connecté.';
  } else if (status === 403) {
    message = "Vous n'avez pas accès à cette ressource.";
  } else if (status === 404) {
    message = 'Ressource introuvable.';
  } else if (status === 410) {
    message = 'Cette ressource a expiré ou n\'est plus disponible.';
  } else if (status === 429) {
    message = 'Trop de requêtes. Merci de patienter un instant.';
  } else if (status && status >= 500) {
    message = 'Une erreur est survenue. Merci de réessayer.';
  }

  const code = (status ? STATUS_CODE_TO_ERROR_CODE[status] : undefined) ?? 'INTERNAL';

  return {
    code,
    message,
  };
}

