'use client';

import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

/**
 * Better Auth on the site's own origin: `/api/auth/*` is proxied to the API (next.config.ts), so
 * the session cookie is first-party on revime.fr, as on the admin. The API must list the site's
 * origin in `trustedOrigins` (SITE_ORIGIN, apps/api/src/auth/site-origins.ts).
 */
export const authClient = createAuthClient({ baseURL: '', plugins: [emailOTPClient()] });
