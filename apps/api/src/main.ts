// MUST be the first import. `auth/auth.ts` builds its PrismaClient at module
// scope, and ES modules evaluate imports in source order - so anything imported
// above this line would read `process.env` before `.env` is loaded and silently
// get `undefined`. ConfigModule.forRoot() is too late: `app.module.ts` imports
// AuthModule before its own decorator runs, so auth.ts would fall back to a
// localhost connection string and every query would die on ECONNREFUSED, which
// surfaces misleadingly as a French 401 rather than as a database fault.
//
// A no-op in production: Render injects env vars into the process and ships no
// .env, and dotenv is silent when the file is absent. This mirrors what the
// tests already do via `setupFiles: ['dotenv/config']` in vitest.config.ts.
import 'dotenv/config';
// Second: error reporting, after dotenv so it can read SENTRY_DSN (PUB-31). Off without a DSN.
import './instrument.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { ensureStorageBuckets } from './storage/ensure-buckets.js';
import { ensureBoxtalSubscriptions } from './shipping/boxtal-subscriptions.js';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule, { bodyParser: false }));
  await app.listen(process.env.PORT ?? 3000);
  // Boxtal label and tracking webhooks: created once if missing (shipping/boxtal-subscriptions.ts).
  void ensureBoxtalSubscriptions();
  // Private Storage buckets: created once if missing (storage/ensure-buckets.ts).
  void ensureStorageBuckets();
}
void bootstrap();
