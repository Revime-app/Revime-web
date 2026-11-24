import type { ArgumentsHost } from '@nestjs/common';
import type { ApiErrorBody } from '@revime/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../src/common/app-exception.js';
import { AllExceptionsFilter } from '../src/common/http-exception.filter.js';

/**
 * Drives AllExceptionsFilter directly rather than through a route.
 *
 * Deliberate: the filter derives the response CODE from the STATUS via a
 * `Partial<Record<number, ApiErrorCode>>`, so a missing entry is not a type
 * error. That makes it the one edit tsc cannot catch, and this file is
 * database-free so the guard runs in the half that gates CI.
 */
function capture(exception: unknown): { status: number; body: ApiErrorBody } {
  let status = 0;
  let body: ApiErrorBody | undefined;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: ApiErrorBody) {
      body = payload;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  if (!body) throw new Error('The filter never wrote a response body.');
  return { status, body };
}

describe('AllExceptionsFilter status to code mapping', () => {
  it('maps a rate limit exception to 429 and the TOO_MANY_REQUESTS code', () => {
    const { status, body } = capture(
      new AppException('TOO_MANY_REQUESTS', 'Trop de tentatives. Réessayez dans 60 secondes.'),
    );

    expect(status).toBe(429);
    // Pinning the code, not only the status. Without CODE_BY_STATUS[429] this is
    // 'INTERNAL' on a 429 response, and the filter logs every rate limit hit as
    // a server fault while the French message still looks correct.
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(body.error.message).toBe('Trop de tentatives. Réessayez dans 60 secondes.');
  });

  it('maps a registry outage to 503 and the SERVICE_UNAVAILABLE code', () => {
    const { status, body } = capture(
      new AppException('SERVICE_UNAVAILABLE', 'Le registre des entreprises est indisponible.'),
    );

    expect(status).toBe(503);
    // The same unenforced edit as 429, one row down. Without CODE_BY_STATUS[503] this
    // is 'INTERNAL' on a 503 response: the filter logs a third party's outage as our
    // own fault, and the app cannot tell « réessayez » from a real server error.
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.message).toBe('Le registre des entreprises est indisponible.');
  });

  it('still maps the pre-existing codes, so this change is additive', () => {
    expect(capture(new AppException('VALIDATION_FAILED', 'x')).status).toBe(400);
    expect(capture(new AppException('UNPROCESSABLE_ENTITY', 'x')).body.error.code).toBe(
      'UNPROCESSABLE_ENTITY',
    );
    expect(capture(new AppException('CONFLICT', 'x')).status).toBe(409);
  });
});
