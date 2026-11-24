/**
 * The private and internal ranges Render's own hops come from (RFC 1918, CGNAT, loopback and
 * their IPv6 equivalents), skipped when walking `x-forwarded-for`. See `AUTH_IP_ADDRESS_OPTIONS`.
 */
export const AUTH_TRUSTED_PROXIES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '100.64.0.0/10',
  '::1/128',
  'fc00::/7',
];

/**
 * How Better Auth resolves the CLIENT IP that keys its rate limiter (CF4-02).
 *
 * 🛑 Without this, every user on production shares ONE rate-limit bucket per path.
 * Render logged it 26 times between 2026-09-21 and 2026-09-28 (once per process start,
 * the warning is latched by `ipWarningLogged`): « Rate limiting could not determine a
 * client IP and is falling back to a single shared per-path bucket. »
 *
 * Why the default fails on Render, read from the installed 1.6.25 source rather than
 * guessed (`@better-auth/core/dist/utils/ip.mjs:172-191`): the default header is
 * `x-forwarded-for`, and with no `trustedProxies` Better Auth trusts it ONLY when it
 * holds exactly one address. Render sits behind Cloudflare plus its own load balancer
 * and APPENDS to X-Forwarded-For, so the chain has several entries and resolves to
 * `null` -> the shared `no-trusted-ip|<path>` key. Shared, that key allows 3 requests per
 * 10 s on /sign-in/* and /sign-up/* and 100 per 10 s on everything else, /get-session
 * included, for the WHOLE user base (`better-auth/dist/api/rate-limiter/index.mjs:370-383`).
 * Those numbers are Better Auth's DEFAULTS; `auth.ts` now overrides the 100-per-10-s one
 * (`rateLimit`, S1) and leaves the sign-in/sign-up one alone.
 *
 * Why `cf-connecting-ip` first, and not the left-most X-Forwarded-For entry: Render does
 * not strip a client-supplied X-Forwarded-For, it appends to it, so the left-most entry
 * is whatever the client typed and a client could rotate it to dodge the limiter.
 * Render documents that all inbound web-service traffic passes through Cloudflare, and
 * Cloudflare sets CF-Connecting-IP itself on the edge-to-origin hop to the address that
 * connected to it: a single value, which Better Auth accepts.
 *
 * `x-forwarded-for` stays second, as the fallback, and `AUTH_TRUSTED_PROXIES` (S1) makes it
 * usable: Better Auth then strips the chain from the RIGHT, skipping our private hops, and takes
 * the first address that is not one of them. That cannot be spoofed, because whatever a client
 * types sits to the LEFT of the entries Render appends, private or not. It is also COARSE: Render
 * appends Cloudflare's edge address, which is public, so with no CF-Connecting-IP the key is the
 * edge, not the user (the test pins this). That is still better than before, when a multi-hop
 * chain resolved to `null` and every user shared one bucket. If Render's own hop ever leaves
 * these ranges the fallback resolves to that hop instead, the same coarse outcome.
 *
 * Local dev needs nothing: with neither header present getIp falls back to 127.0.0.1
 * under NODE_ENV development/test and returns null otherwise (ip.mjs:215) - it never
 * throws - and the limiter is off outside NODE_ENV=production anyway
 * (`better-auth/dist/context/create-context.mjs:171`).
 */
export const AUTH_IP_ADDRESS_OPTIONS = {
  ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
  trustedProxies: AUTH_TRUSTED_PROXIES,
};
