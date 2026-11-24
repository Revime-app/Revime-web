import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@revime/shared';

/**
 * Application exception with French message authored by our code.
 * Carries an explicit marker so AllExceptionsFilter can distinguish it
 * from framework exceptions that have English defaults.
 */
export class AppException extends HttpException {
  readonly isAppException = true;

  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    const status = STATUS_BY_CODE[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    super({ message, fields, isAppException: true }, status);
  }
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNPROCESSABLE_ENTITY: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
  // V7 U2b: the app opens its password sheet on this code rather than showing an error.
  STEP_UP_REQUIRED: 403,
  // V7 U7: the app shows its « Mon entreprise » card on this code rather than a bare error.
  PARTICULAR_CAP_REACHED: 403,
  // V7 D5 (U9): the app shows its maintenance screen on this code; its message is the dashboard's.
  MAINTENANCE: 503,
  // V7 D5 (U9b): the app shows its re-acceptance screen on this code.
  CGU_REACCEPT_REQUIRED: 403,
  // V9 B1: no recorded CGU acceptance; the new build shows its terms screen on this code.
  CGU_ACCEPTANCE_REQUIRED: 403,
};
