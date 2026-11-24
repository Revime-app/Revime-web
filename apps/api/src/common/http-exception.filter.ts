import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ApiErrorCode } from '@revime/shared';
import type { Response } from 'express';
import { AppException } from './app-exception.js';
import { reportServerError } from '../monitoring.js';

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  422: 'UNPROCESSABLE_ENTITY',
  // Required, and NOT enforced by the compiler: this map is Partial, so omitting
  // 429 is silent. Without it every rate limit answer carries code INTERNAL and
  // is logged at error level as though the server had faulted, while the authored
  // French message still looks correct. filter-mapping.spec.ts pins the code.
  429: 'TOO_MANY_REQUESTS',
  // Required for the same reason as 429 above, and unenforced for the same reason:
  // omitting it makes a third party's outage answer INTERNAL and be logged as our
  // own fault, while the authored French still reads correctly.
  503: 'SERVICE_UNAVAILABLE',
};

const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'Les informations envoyées sont invalides.',
  UNPROCESSABLE_ENTITY: 'Impossible de traiter cette demande.',
  UNAUTHENTICATED: 'Vous devez être connecté.',
  FORBIDDEN: "Vous n'avez pas accès à cette ressource.",
  NOT_FOUND: 'Ressource introuvable.',
  CONFLICT: 'Cette ressource existe déjà.',
  GONE: 'Cette ressource a expiré ou n\'est plus disponible.',
  TOO_MANY_REQUESTS: 'Trop de tentatives. Réessayez plus tard.',
  SERVICE_UNAVAILABLE: 'Service momentanément indisponible. Merci de réessayer.',
  INTERNAL: 'Une erreur est survenue. Merci de réessayer.',
  STEP_UP_REQUIRED: 'Confirmez votre identité pour continuer.',
  PARTICULAR_CAP_REACHED: 'Vous avez atteint le plafond des réparateurs particuliers.',
  MAINTENANCE: 'Plateforme en cours de maintenance.',
  CGU_REACCEPT_REQUIRED: "Acceptez les nouvelles Conditions Générales d'Utilisation pour continuer.",
  CGU_ACCEPTANCE_REQUIRED: "Acceptez les Conditions générales d'utilisation pour continuer.",
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    // An AppException names its own code: two codes can share a status (V7 U2b's STEP_UP_REQUIRED is a
    // 403 like FORBIDDEN, and the app must tell them apart). Every other code maps back to itself.
    const code =
      exception instanceof AppException ? exception.code : (CODE_BY_STATUS[status] ?? 'INTERNAL');

    if (code === 'INTERNAL') {
      this.logger.error(exception);
      // A real fault: report it (no-op until SENTRY_DSN is set, PUB-31). Expected answers are not.
      reportServerError(exception);
    }

    const detail =
      exception instanceof HttpException ? (exception.getResponse() as Record<string, unknown>) : {};
    const fields =
      detail && typeof detail === 'object' && 'fields' in detail
        ? (detail.fields as Record<string, string>)
        : undefined;

    // Only use detail.message if it carries our explicit marker (AppException).
    // Framework exceptions (404s, 401s from guards, etc.) have English defaults
    // that must be replaced with MESSAGE_BY_CODE French messages.
    const isAuthoredByUs =
      typeof detail === 'object' && detail !== null && 'isAppException' in detail;
    const message =
      isAuthoredByUs && typeof detail?.message === 'string'
        ? (detail.message as string)
        : MESSAGE_BY_CODE[code];

    const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
    res.status(status).json(body);
  }
}
