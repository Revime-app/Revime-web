import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';

const SECRET = 'cron_secret_for_test';

describe('cron', () => {
  let app: INestApplication;
  const saved: Record<string, string | undefined> = {};

  const run = (secret?: string) => {
    const req = request(app.getHttpServer()).post('/api/v1/internal/cron/run');
    return secret === undefined ? req : req.set('x-cron-secret', secret);
  };

  beforeAll(async () => {
    saved.CRON_SECRET = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRET;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    if (saved.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved.CRON_SECRET;
  });

  it('refuses a request with no secret', async () => {
    await run().expect(403);
  });

  it('refuses a wrong secret', async () => {
    await run('wrong').expect(403);
  });

  it('refuses a secret that is a prefix of the real one, which a length-only compare would admit', async () => {
    await run(SECRET.slice(0, 5)).expect(403);
  });

  it('accepts the right secret and reports one result per job', async () => {
    const res = await run(SECRET).expect(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    for (const job of res.body.jobs) {
      expect(typeof job.job).toBe('string');
      expect(typeof job.scanned).toBe('number');
    }
  });

  it('refuses even the right secret when the server has none configured', async () => {
    delete process.env.CRON_SECRET;
    try {
      await run(SECRET).expect(403);
    } finally {
      process.env.CRON_SECRET = SECRET;
    }
  });
});
