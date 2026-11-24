import type { NextConfig } from 'next';
import { HTML_LIMITED_BOTS } from './lib/bots';

/**
 * The browser only ever calls revime.fr. `/api/*` (Better Auth under /api/auth, the REST API
 * under /api/v1) is proxied to the API server, so session cookies are first-party on revime.fr
 * and the API needs no CORS entry for the site.
 */
const API_URL = (process.env.API_URL ?? 'https://api.revime.fr').replace(/\/+$/, '');

const config: NextConfig = {
  // AI crawlers do not run JavaScript: give them complete <head> metadata (lib/bots.ts).
  htmlLimitedBots: HTML_LIMITED_BOTS,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
