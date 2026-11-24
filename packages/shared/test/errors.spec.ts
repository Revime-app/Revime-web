import { describe, expect, it } from 'vitest';
import { resolveApiErrorMessage } from '../src/errors.js';

describe('resolveApiErrorMessage', () => {
  it('extracts code, message, and fields when valid ApiErrorBody is provided', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Les informations envoyées sont invalides.',
        fields: { body: 'Message vide.' },
      },
    };
    const res = resolveApiErrorMessage(body, 400);
    expect(res).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Les informations envoyées sont invalides.',
      fields: { body: 'Message vide.' },
    });
  });

  it('handles 502 / 504 Bad Gateway / Gateway Timeout with HTML or null body', () => {
    const res502 = resolveApiErrorMessage(null, 502);
    expect(res502).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Le serveur met trop de temps à répondre. Merci de réessayer.',
    });

    const res504 = resolveApiErrorMessage('<html>504 Gateway Time-out</html>', 504);
    expect(res504).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Le serveur met trop de temps à répondre. Merci de réessayer.',
    });
  });

  it('handles 503 Service Unavailable', () => {
    const res = resolveApiErrorMessage(null, 503);
    expect(res).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service momentanément indisponible. Merci de réessayer.',
    });
  });

  it('handles 401 Unauthenticated with null body', () => {
    const res = resolveApiErrorMessage(null, 401);
    expect(res).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Vous devez être connecté.',
    });
  });

  it('handles 403 Forbidden with null body', () => {
    const res = resolveApiErrorMessage(null, 403);
    expect(res).toEqual({
      code: 'FORBIDDEN',
      message: "Vous n'avez pas accès à cette ressource.",
    });
  });

  it('handles 404 Not Found with null body', () => {
    const res = resolveApiErrorMessage(null, 404);
    expect(res).toEqual({
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    });
  });

  it('handles 429 Too Many Requests with null body', () => {
    const res = resolveApiErrorMessage(null, 429);
    expect(res).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Trop de requêtes. Merci de patienter un instant.',
    });
  });

  it('handles 500 with null body', () => {
    const res = resolveApiErrorMessage(null, 500);
    expect(res).toEqual({
      code: 'INTERNAL',
      message: 'Une erreur est survenue. Merci de réessayer.',
    });
  });

  it('falls back to provided fallback when status is unknown and body is invalid', () => {
    const res = resolveApiErrorMessage(null, undefined);
    expect(res).toEqual({
      code: 'INTERNAL',
      message: 'Une erreur est survenue.',
    });

    const resCustom = resolveApiErrorMessage({}, 418, "Échec de l'envoi.");
    expect(resCustom).toEqual({
      code: 'INTERNAL',
      message: "Échec de l'envoi.",
    });
  });
});
