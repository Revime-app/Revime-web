import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';

describe('exception handling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns French message for framework-raised 404 without leaking request path', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      },
    });
    // Must not leak the request path
    expect(JSON.stringify(res.body)).not.toContain('/api/v1/nope');
    expect(JSON.stringify(res.body)).not.toContain('Cannot GET');
  });

  it('returns French message for framework-raised 401 from auth guard', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Vous devez être connecté.',
      },
    });
  });

  it.skip('preserves authored French messages and fields from validation failures', async () => {
    // This test was a placeholder. Task 6 adds PATCH /api/v1/users/me/modes which uses
    // ZodValidationPipe, and modes.int.spec.ts verifies validation behavior there.
    // Skipping this rather than deleting it preserves the pattern for future reference.
  });
});
