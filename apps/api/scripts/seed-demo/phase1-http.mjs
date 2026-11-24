import { CLIENTS, OPEN_DEMANDES, REPAIRERS, TUNED_OFFERS } from './cast.mjs';

/**
 * Mirrors deriveUsername in packages/shared/src/username.schemas.ts. Inlined
 * because this script is plain .mjs and importing the built package from a seed
 * script would couple the seeder to a build step it does not otherwise need.
 *
 * The cast index is appended unconditionally, so 14 demo accounts cannot collide
 * with each other OR with a real account holding the same derivation.
 */
function seedUsername(account) {
  const base = String(account.email).split('@')[0].toLowerCase()
    .replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  const withLetter = /[a-z]/.test(base) ? base : `user${base}`;
  const idx = String(account.index ?? 0);
  return `${withLetter.slice(0, 19 - idx.length).replace(/_+$/, '')}d${idx}`;
}

/** Better Auth is mounted at /api/auth, deliberately OUTSIDE setGlobalPrefix('api/v1'). */
export function signupRequest(account) {
  return {
    path: '/api/auth/sign-up/email',
    method: 'POST',
    body: {
      email: account.email,
      password: account.password,
      name: account.name,
      // NOT NULL since migration 22. The HTTP path goes through the create hook,
      // which would derive one anyway — but deriving here keeps the seeded handles
      // readable (`@rest_test` rather than a suffix pile) and makes the walkthrough
      // legible to the client.
      username: seedUsername(account),
    },
  };
}

export function modesRequest(role) {
  return role === 'REPAIRER'
    ? { path: '/api/v1/users/me/modes', method: 'PATCH', body: { repairerEnabled: true, activeMode: 'REPAIRER' } }
    : { path: '/api/v1/users/me/modes', method: 'PATCH', body: { clientEnabled: true, activeMode: 'CLIENT' } };
}

/** Owns geography: the service overwrites all four geo fields on every call. */
export function postalCodeRequest(postalCode) {
  return { path: '/api/v1/users/me/repairer', method: 'PATCH', body: { postalCode } };
}

/** Separate route from the above, on purpose. See users.controller.ts:40-44. */
export function publicProfileRequest({ displayName, bio }) {
  return { path: '/api/v1/users/me/repairer-profile', method: 'PATCH', body: { displayName, bio } };
}

export function demandeRequest(demande, categoryId) {
  const body = {
    categoryId,
    brand: demande.brand,
    model: demande.model,
    title: demande.title,
    description: demande.description,
    parts: demande.parts,
    mode: demande.mode,
    locationLabel: demande.locationLabel,
    postalCode: demande.postalCode,
  };
  if (demande.mode === 'BUDGET') body.budgetCents = demande.budgetCents;
  return { path: '/api/v1/demandes', method: 'POST', body };
}

export function offerRequest(demandeId, offer) {
  return {
    path: `/api/v1/demandes/${demandeId}/offers`,
    method: 'POST',
    body: {
      priceCents: offer.priceCents,
      delayHours: offer.delayHours,
      warrantyLabel: offer.warrantyLabel,
      partsLabel: offer.partsLabel,
      travel: offer.travel,
      acceptsParcel: offer.acceptsParcel,
      comment: offer.comment,
    },
  };
}

/**
 * Better Auth REJECTS a request with no `Origin` header outright:
 * `origin-check.mjs:107` throws FORBIDDEN / MISSING_OR_NULL_ORIGIN when the header
 * is absent or the string "null". `fetch` from Node sends none, so every signup
 * 403s -- which is exactly how the first live run of this script failed, after the
 * unit tests had passed for days. The builders are pure and testable; this header
 * lives in the one function they do not cover.
 *
 * The value must be a TRUSTED origin, not merely present. `auth.ts` sets
 * `trustedOrigins: ['revime://', ...adminOrigins()]`, so this must be one entry of
 * ADMIN_ORIGIN. Since V7 U10 that variable is a comma-separated list, and the raw
 * list is not an origin: take its first entry, the rule of `src/auth/admin-origins.ts`.
 * Read from ADMIN_ORIGIN rather than hardcoded, so a changed admin origin cannot
 * silently un-trust the seed.
 */
export const SEED_ORIGIN =
  (process.env.ADMIN_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .find((origin) => origin !== '') ?? 'http://localhost:3001';

async function send(baseUrl, req, cookie) {
  const res = await fetch(`${baseUrl}${req.path}`, {
    method: req.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SEED_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(req.body),
  });
  if (res.status >= 400) {
    throw new Error(`${req.method ?? 'POST'} ${req.path} -> ${res.status} ${await res.text()}`);
  }
  return {
    cookie: res.headers.getSetCookie?.().join('; ') ?? res.headers.get('set-cookie') ?? cookie,
    json: res.status === 204 ? null : await res.json().catch(() => null),
  };
}

/**
 * Asserts that a signup response carried a user id at `json.user.id`.
 *
 * Better Auth's own sign-up/email handler (node_modules/better-auth/dist/api/routes/sign-up.mjs:262-265)
 * returns `{ user: parseUserOutput(..., createdUser), token }`, and its OpenAPI schema
 * (lines 82-127) documents `user.id` as a required string. This project's auth.ts config
 * (user.additionalFields, databaseHooks, plugins) does not reshape the response.
 *
 * If the id is missing, throw immediately at the first signup rather than letting undefined
 * propagate into `repairerIds` and `clientIds`, which would fail fifty inserts later as a
 * foreign-key violation inside Task 8's production write — after fourteen accounts and
 * forty-seven demandes have already been created.
 */
function assertSignupProducedId(json, accountEmail) {
  const id = json?.user?.id;
  if (!id || typeof id !== 'string') {
    throw new Error(
      `Signup for ${accountEmail} returned no user id at json.user.id. ` +
      `Better Auth's sign-up/email response shape is the suspect. Got: ${JSON.stringify(json)}`,
    );
  }
  return id;
}

export async function runPhase1({ baseUrl, resolveCategoryId, clientDemandeId, log }) {
  const repairerIds = {};
  const clientIds = {};
  const openDemandeIds = [];
  const tunedOfferIds = [];

  for (const [i, r] of REPAIRERS.entries()) {
    const accountWithIndex = { ...r, index: i };
    const { cookie, json } = await send(baseUrl, signupRequest(accountWithIndex));
    const id = assertSignupProducedId(json, r.email);
    repairerIds[r.key] = id;
    await send(baseUrl, modesRequest('REPAIRER'), cookie);
    await send(baseUrl, postalCodeRequest(r.postalCode), cookie);
    await send(baseUrl, publicProfileRequest(r), cookie);
    log(`reparateur ${r.displayName} (${r.postalCode})`);
    r._cookie = cookie;
  }

  for (const [i, c] of CLIENTS.entries()) {
    const accountWithIndex = { ...c, index: i + REPAIRERS.length };
    const { cookie, json } = await send(baseUrl, signupRequest(accountWithIndex));
    const id = assertSignupProducedId(json, c.email);
    clientIds[c.key] = id;
    c._cookie = cookie;
    log(`client ${c.name}`);
  }

  for (const d of OPEN_DEMANDES) {
    const client = CLIENTS.find((c) => c.key === d.clientKey);
    const categoryId = await resolveCategoryId(d.categorySlug);
    const { json } = await send(baseUrl, demandeRequest(d, categoryId), client._cookie);
    openDemandeIds.push(json.id);
    log(`demande « ${d.title} »`);
  }

  // The four tuned offers land on the CLIENT'S OWN demande, so his notifications are real.
  for (const o of TUNED_OFFERS) {
    const r = REPAIRERS.find((x) => x.key === o.repairerKey);
    const { json } = await send(baseUrl, offerRequest(clientDemandeId, o), r._cookie);
    tunedOfferIds.push(json.id);
    log(`offer ${o.priceCents / 100} EUR from ${r.displayName}`);
  }

  return { repairerIds, clientIds, openDemandeIds, tunedOfferIds };
}
