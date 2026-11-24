/**
 * Strips personal data from an error-monitoring event before it leaves for Sentry.
 *
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-31. Both the app (`apps/mobile/src/lib/monitoring.ts`) and
 * the API (`apps/api/src/instrument.ts`) pass every event and breadcrumb through this, so a crash
 * report carries the error and where it happened, never who it happened to. The store answers
 * (App Privacy, Data safety) declare crash data only; this is what keeps that true.
 *
 * Plain TypeScript with no Sentry types and no `node:` import, because Metro bundles this package
 * into the app (`2efb66fc`).
 */

const REDACTED = '[redacted]';

/** Keys whose value is dropped whatever it is, compared lower-case without `-` or `_`. */
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'authorization', 'cookie', 'cookies', 'setcookie',
  'iban', 'bic', 'nif', 'taxid', 'tin', 'birthdate', 'dateofbirth', 'birthcity', 'birthcountry',
  'phone', 'phonenumber', 'email', 'emailaddress', 'address', 'addressline', 'street',
  'firstname', 'lastname', 'fullname', 'cardnumber', 'cvc', 'cvv', 'otp', 'ipaddress',
]);
/** Key fragments that make any key sensitive (accessToken, x-api-key, client_secret…). */
const SENSITIVE_FRAGMENTS = ['token', 'password', 'secret', 'apikey', 'cookie', 'iban'];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEYS.has(k) || SENSITIVE_FRAGMENTS.some((f) => k.includes(f));
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g;
const FR_PHONE = /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/g;

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(IBAN, '[iban]')
    .replace(FR_PHONE, '[phone]')
    .replace(BEARER, 'Bearer [redacted]');
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, seen));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(v, seen);
  }
  return out;
}

/**
 * Returns a scrubbed copy; the input is not changed. Typed loosely on purpose so both Sentry SDKs'
 * event and breadcrumb types pass through (`scrubMonitoringEvent(event) as typeof event`).
 */
export function scrubMonitoringEvent<T extends object>(event: T): T {
  const out = scrubValue(event, new WeakSet()) as Record<string, unknown>;

  const user = (event as Record<string, unknown>).user as Record<string, unknown> | undefined;
  if (user && typeof user === 'object') {
    if (user.id !== undefined) out.user = { id: user.id };
    else delete out.user;
  }

  const request = out.request as Record<string, unknown> | undefined;
  if (request && typeof request === 'object') {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (typeof request.url === 'string') request.url = request.url.split('?')[0];
  }
  return out as T;
}
