import type { INestApplication } from '@nestjs/common';
import { json, raw, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { adminOrigins } from './auth/admin-origins.js';

export function configureApp<T extends INestApplication>(app: T): T {
  // Render terminates TLS in front of this service, so without this req.ip is the
  // proxy address and is IDENTICAL for every user on earth. A rate limit bucket
  // keyed on that value is not a lax limit, it is a global one: the fifteenth
  // verification of the day would lock out everybody. Our own limits key on
  // userId and phone for exactly this reason; the IP is passed to Twilio's
  // bucket as defence in depth only, and omitted when it cannot be trusted.
  (
    app.getHttpAdapter().getInstance() as {
      set(key: string, value: unknown): void;
    }
  ).set('trust proxy', 1);

  // Better Auth reads the request stream itself, and Stripe's signature check
  // needs the bytes exactly as sent, so both bypass the JSON parser. This is the
  // reason main.ts creates the app with `bodyParser: false`.
  //
  // An explicit LIST, not a prefix test. It was
  // `startsWith('/api/v1/stripe/webhook')`, which silently excluded
  // `/api/v1/stripe/connect/webhook` - a Connect event would have arrived
  // JSON-parsed and every signature check would have failed, presenting as an
  // unexplained 400 on the route that grants verification levels.
  //
  // Nesting the Connect route under the old prefix would have "fixed" it by
  // accident and left the next JSON route added there receiving raw bytes. On the
  // routes that handle money, explicit beats clever.
  //
  // These paths must match: setGlobalPrefix('api/v1') below + each controller's
  // @Post(...). If either changes, this must change with it.
  const RAW_BODY_PATHS = [
    '/api/v1/stripe/webhook',
    '/api/v1/stripe/connect/webhook',
    '/api/v1/stripe/identity/webhook',
    // Livraison Boxtal. HMAC over the RAW body; a JSON-parsed body would fail every signature.
    '/api/v1/shipping/webhook',
  ];

  app.use((req: { path: string }, res: unknown, next: () => void) => {
    if (req.path.startsWith('/api/auth')) return next();
    if (RAW_BODY_PATHS.includes(req.path)) {
      return raw({ type: 'application/json', limit: '1mb' })(
        req as never,
        res as never,
        next,
      );
    }
    // V7 U2b: « Ce n'est pas moi » is a plain HTML form, so its button posts url-encoded. This path only.
    if (req.path === '/api/v1/security/not-me') {
      return urlencoded({ extended: false, limit: '4kb' })(req as never, res as never, next);
    }
    return json({ limit: '1mb' })(req as never, res as never, next);
  });
  app.setGlobalPrefix('api/v1', { exclude: ['api/auth/{*path}'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    // V7 U10: every dashboard host (auth/admin-origins.ts).
    origin: adminOrigins(),
    credentials: true,
  });
  return app;
}
