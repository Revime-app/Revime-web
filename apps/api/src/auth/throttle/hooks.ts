import { APIError, getIp, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { isStaffRole } from '@revime/shared';
import { THROTTLE_RULES } from './policy.js';
import { AuthThrottle, codeLockedError, lockedError, throttleKey } from './auth-throttle.js';
import { createNotMeUrl, createResetUrl, type VerificationWriter } from './links.js';
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  labelFromUserAgent,
  newBrowserDeviceId,
  readDevice,
  recordDevice,
  type DeviceStore,
} from '../devices/device.js';
import { isMobileAppRequest } from '../staff-two-factor.js';

/**
 * V7 A11 / D3 (U2). What each Better Auth route does with the lock-out counters. `auth.ts` calls
 * `throttleBefore` and `throttleAfter` from its hooks; the flow spec installs the same two functions
 * on a real Better Auth instance, so what is tested is what runs.
 *
 * - `/sign-in/email`: refused while the IP or the account is locked; a wrong password counts on
 *   both; a right one resets the account's failure count. Staff accounts lock after 3 (D3).
 * - `/two-factor/verify-*`: a wrong dashboard code counts on the staff account's login counter.
 * - `/email-otp/verify-email`: a wrong code counts on the account's code counter.
 * - `/request-password-reset`: 3 per e-mail per hour; past that the request is dropped while
 *   answering exactly what Better Auth answers, so nobody learns anything from the refusal.
 * - Google and Apple sign-in go through other routes and are never refused (Q11).
 * - U2b: a session created by a password login (or its 2FA step) is checked against the account's
 *   known devices, and an unknown one earns a « Nouvelle connexion » e-mail (`devices/device.ts`).
 */

export type LockedAccount = { id: string; email: string; name: string | null; role: string | null };

/** What a lock sets off: history rows, e-mails, alerts. `effects.ts` is the production one. */
export interface LockEffects {
  accountLocked(event: {
    scope: 'LOGIN_ACCOUNT' | 'CODE_ACCOUNT';
    user: LockedAccount;
    level: number;
    lockedUntil: Date;
    /** A one-hour reset link, for the lock e-mail. Null for a code lock. */
    resetUrl: string | null;
    /** U2b: « Ce n'est pas moi », for the lock e-mail. Null for a code lock. */
    notMeUrl: string | null;
  }): Promise<void>;
  ipBlocked(event: { ip: string; lockedUntil: Date; accountsTried: number }): Promise<void>;
  unlockedByPasswordReset(event: { userId: string }): Promise<void>;
  /** U2b: a password login from a device this account has not used (in 180 days). */
  newDevice(event: { user: LockedAccount; label: string; at: Date; notMeUrl: string | null }): Promise<void>;
}

/** `devices` absent: no device tracking. */
export type ThrottleDeps = { throttle: AuthThrottle; effects: LockEffects; devices?: DeviceStore };

/**
 * Better Auth's e-mail-code endpoints we never wired: sign-in, password reset and e-mail change by
 * code, and the non-consuming check. `sendVerificationOTP` in auth.ts sends nothing for those types,
 * but the plugin still generates and STORES a code for them, so with these routes open anyone could
 * request a code for any account and guess it three tries at a time, forever (found 2026-10-28,
 * `FND7-034`). Disabled in auth.ts's `disabledPaths`.
 */
export const UNUSED_EMAIL_OTP_PATHS = [
  '/email-otp/check-verification-otp',
  '/sign-in/email-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
] as const;

const SIGN_IN_PATH = '/sign-in/email';
const SIGN_UP_PATH = '/sign-up/email';
const TWO_FACTOR_PATHS = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code', '/two-factor/verify-otp']);
const EMAIL_CODE_PATH = '/email-otp/verify-email';
const RESET_REQUEST_PATH = '/request-password-reset';

/** Better Auth's own answer to a reset request (`api/routes/password.mjs`), word for word. */
const RESET_REQUEST_ANSWER = {
  status: true,
  message: 'If this email exists in our system, check your email for the reset link',
};

/** The slice of Better Auth's endpoint context these hooks read. */
type HookCtx = {
  path: string;
  body?: unknown;
  headers?: Headers;
  request?: Request;
  getSignedCookie?: (name: string, secret: string) => Promise<string | null | false>;
  setCookie?: (
    name: string,
    value: string,
    options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number },
  ) => unknown;
  context: {
    returned?: unknown;
    /** Set by Better Auth whenever this request created a session (`setSessionCookie`). */
    newSession?: { user?: Record<string, unknown> } | null;
    options: Parameters<typeof getIp>[1] & {
      emailAndPassword?: { resetPasswordTokenExpiresIn?: number };
    };
    baseURL: string;
    secret: string;
    createAuthCookie: (name: string) => { name: string };
    internalAdapter: {
      findUserByEmail(email: string): Promise<{ user: Record<string, unknown> } | null>;
      findUserById(id: string): Promise<Record<string, unknown> | null>;
      findVerificationValue(identifier: string): Promise<{ value: string } | null>;
      createVerificationValue(data: { value: string; identifier: string; expiresAt: Date }): Promise<unknown>;
    };
  };
};

export async function throttleBefore(rawCtx: unknown, deps: ThrottleDeps): Promise<unknown> {
  const ctx = rawCtx as HookCtx;
  const { throttle } = deps;

  if (ctx.path === SIGN_IN_PATH) {
    const email = bodyEmail(ctx);
    if (!email) return;
    await assertIpOpen(ctx, throttle);
    await throttle.assertOpen('LOGIN_ACCOUNT', email);
    return;
  }

  if (TWO_FACTOR_PATHS.has(ctx.path)) {
    const user = await pendingTwoFactorUser(ctx);
    if (!user) return;
    await assertIpOpen(ctx, throttle);
    await throttle.assertOpen('LOGIN_ACCOUNT', throttleKey(user.email));
    return;
  }

  if (ctx.path === EMAIL_CODE_PATH) {
    const email = bodyEmail(ctx);
    if (!email) return;
    await assertIpOpen(ctx, throttle);
    await throttle.assertOpen('CODE_ACCOUNT', email);
    return;
  }

  if (ctx.path === RESET_REQUEST_PATH) {
    const email = bodyEmail(ctx);
    if (!email) return;
    const ip = clientIp(ctx);
    const blocked = (ip && (await throttle.lockedUntil('IP', ip))) || (await throttle.lockedUntil('RESET_ACCOUNT', email));
    // Returning a value from a before hook answers the request without running the endpoint.
    if (blocked) return { ...RESET_REQUEST_ANSWER };
  }
}

/**
 * Records the outcome. Returns the lock error when THIS request started a lock; the caller returns
 * it from its after hook, which makes it the response (Better Auth's `runAfterHooks`).
 */
export async function throttleAfter(rawCtx: unknown, deps: ThrottleDeps): Promise<APIError | undefined> {
  const ctx = rawCtx as HookCtx;
  await safely(() => trackDevice(ctx, deps));
  const returned = ctx.context.returned;
  const failed = isAPIError(returned) || returned instanceof Error;
  const code = isAPIError(returned) ? (returned.body as { code?: string } | undefined)?.code : undefined;

  if (ctx.path === SIGN_IN_PATH) {
    const email = bodyEmail(ctx);
    if (!email) return;
    if (code === 'INVALID_EMAIL_OR_PASSWORD') return loginFailure(ctx, deps, email, await findUser(ctx, email));
    if (!failed) await deps.throttle.succeed('LOGIN_ACCOUNT', email, THROTTLE_RULES.LOGIN_ACCOUNT);
    return;
  }

  if (TWO_FACTOR_PATHS.has(ctx.path) && (code === 'INVALID_CODE' || code === 'INVALID_BACKUP_CODE')) {
    const user = await pendingTwoFactorUser(ctx);
    if (!user) return;
    return loginFailure(ctx, deps, throttleKey(user.email), user);
  }

  if (ctx.path === EMAIL_CODE_PATH && code === 'INVALID_OTP') {
    const email = bodyEmail(ctx);
    if (!email) return;
    return recordCodeFailure(deps, { email, user: await findUser(ctx, email), ip: clientIp(ctx) });
  }

  if (ctx.path === RESET_REQUEST_PATH && !failed) {
    const email = bodyEmail(ctx);
    if (!email) return;
    await deps.throttle.fail('RESET_ACCOUNT', email, THROTTLE_RULES.RESET_ACCOUNT);
    const ip = clientIp(ctx);
    if (ip) await ipFailure(deps, ip, email);
  }
}

/**
 * A wrong code, from Better Auth's e-mail code or from our SMS check (`verification.service.ts`).
 * Returns the lock error when this failure started a lock (account or IP).
 */
export async function recordCodeFailure(
  deps: ThrottleDeps,
  args: { email: string; user: LockedAccount | null; ip: string | null },
): Promise<APIError | undefined> {
  const email = throttleKey(args.email);
  const outcome = await deps.throttle.fail('CODE_ACCOUNT', email, THROTTLE_RULES.CODE_ACCOUNT);
  const ipUntil = args.ip ? await ipFailure(deps, args.ip, email) : null;
  if (outcome.lockedNow && args.user) {
    await safely(() =>
      deps.effects.accountLocked({
        scope: 'CODE_ACCOUNT',
        user: args.user!,
        level: outcome.level,
        lockedUntil: outcome.lockedUntil!,
        resetUrl: null,
        notMeUrl: null,
      }),
    );
  }
  // V9 U1 (V9 B2 (3)): the code lock answers with its own sentence, never a password one.
  return lockResponse(outcome.lockedNow ? outcome.lockedUntil : null, ipUntil, codeLockedError);
}

/** Better Auth's `onPasswordReset`: completing a reset lifts the login lock and its ladder (Q3). */
export async function clearLockAfterPasswordReset(user: { id: string; email: string }, deps: ThrottleDeps): Promise<void> {
  await deps.throttle.clear('LOGIN_ACCOUNT', throttleKey(user.email));
  await safely(() => deps.effects.unlockedByPasswordReset({ userId: user.id }));
}

async function loginFailure(
  ctx: HookCtx,
  deps: ThrottleDeps,
  email: string,
  user: LockedAccount | null,
): Promise<APIError | undefined> {
  const rule = user && isStaffRole(user.role) ? THROTTLE_RULES.LOGIN_STAFF : THROTTLE_RULES.LOGIN_ACCOUNT;
  const outcome = await deps.throttle.fail('LOGIN_ACCOUNT', email, rule);
  const ip = clientIp(ctx);
  const ipUntil = ip ? await ipFailure(deps, ip, email) : null;

  if (outcome.lockedNow && user) {
    const resetUrl = await safely(() => createResetUrl(writer(ctx), ctx.context.baseURL, user.id, resetLifetime(ctx)));
    const notMeUrl = await safely(() => createNotMeUrl(writer(ctx), apiOrigin(ctx), user.id));
    await safely(() =>
      deps.effects.accountLocked({
        scope: 'LOGIN_ACCOUNT',
        user,
        level: outcome.level,
        lockedUntil: outcome.lockedUntil!,
        resetUrl: resetUrl ?? null,
        notMeUrl: notMeUrl ?? null,
      }),
    );
  }
  return lockResponse(outcome.lockedNow ? outcome.lockedUntil : null, ipUntil);
}

/** Counts one failure on the IP. Returns the block's end when this failure started it. */
async function ipFailure(deps: ThrottleDeps, ip: string, email: string): Promise<Date | null> {
  const outcome = await deps.throttle.fail('IP', ip, THROTTLE_RULES.IP, email);
  if (!outcome.lockedNow) return null;
  await safely(() =>
    deps.effects.ipBlocked({ ip, lockedUntil: outcome.lockedUntil!, accountsTried: outcome.recentKeys.length }),
  );
  return outcome.lockedUntil;
}

/**
 * The later of the two ends. `accountError` words the account counter's lock (the login lock by
 * default, `codeLockedError` for wrong codes, V9 U1); an IP block keeps the login lock's sentence.
 */
function lockResponse(
  accountUntil: Date | null,
  ipUntil: Date | null,
  accountError: (until: Date) => APIError = lockedError,
): APIError | undefined {
  if (accountUntil && (!ipUntil || accountUntil.getTime() >= ipUntil.getTime())) return accountError(accountUntil);
  return ipUntil ? lockedError(ipUntil) : undefined;
}

async function assertIpOpen(ctx: HookCtx, throttle: AuthThrottle): Promise<void> {
  const ip = clientIp(ctx);
  if (ip) await throttle.assertOpen('IP', ip);
}

/** The same client IP Better Auth's own limiter keys on (`AUTH_IP_ADDRESS_OPTIONS`). Null when unknown. */
function clientIp(ctx: HookCtx): string | null {
  const source = ctx.request ?? ctx.headers;
  if (!source) return null;
  try {
    return getIp(source, ctx.context.options);
  } catch {
    return null;
  }
}

function bodyEmail(ctx: HookCtx): string | null {
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() !== '' ? throttleKey(email) : null;
}

function toAccount(user: Record<string, unknown>): LockedAccount {
  return {
    id: String(user.id),
    email: String(user.email),
    name: typeof user.name === 'string' ? user.name : null,
    role: typeof user.role === 'string' ? user.role : null,
  };
}

async function findUser(ctx: HookCtx, email: string): Promise<LockedAccount | null> {
  const found = await ctx.context.internalAdapter.findUserByEmail(email);
  return found?.user ? toAccount(found.user) : null;
}

/**
 * Who a two-factor code is for, the way the plugin itself finds out (`verify-two-factor.mjs`): the
 * session when there is one, otherwise the signed `two_factor` cookie the sign-in challenge set,
 * whose verification row holds the user id.
 */
async function pendingTwoFactorUser(ctx: HookCtx): Promise<LockedAccount | null> {
  const session = await getSessionFromCtx(ctx as never).catch(() => null);
  if (session?.user) return toAccount(session.user as unknown as Record<string, unknown>);
  if (!ctx.getSignedCookie) return null;
  const cookieName = ctx.context.createAuthCookie('two_factor').name;
  const signed = await ctx.getSignedCookie(cookieName, ctx.context.secret).catch(() => null);
  if (!signed) return null;
  const verification = await ctx.context.internalAdapter.findVerificationValue(signed);
  if (!verification) return null;
  const user = await ctx.context.internalAdapter.findUserById(verification.value);
  return user ? toAccount(user) : null;
}

/**
 * U2b. A session this request created, from a password login or its 2FA step (or the sign-up,
 * recorded silently), checked against the account's known devices. A browser with no device cookie
 * gets one here; an app request without the device header (today's builds) is not tracked (Q1).
 */
async function trackDevice(ctx: HookCtx, deps: ThrottleDeps): Promise<void> {
  if (!deps.devices) return;
  if (ctx.path !== SIGN_IN_PATH && ctx.path !== SIGN_UP_PATH && !TWO_FACTOR_PATHS.has(ctx.path)) return;
  const created = ctx.context.newSession;
  if (!created?.user) return;

  const headers = ctx.request?.headers ?? ctx.headers;
  const isApp = isMobileAppRequest(headers);
  // A 2FA account's password step: Better Auth creates the session, then the two-factor plugin
  // swaps it for the challenge. Checked at the code step instead. The app gets no challenge (CF4-51).
  const returned = ctx.context.returned as { twoFactorRedirect?: boolean } | null | undefined;
  const challenged = returned?.twoFactorRedirect === true || (created.user.twoFactorEnabled === true && !isApp);
  if (ctx.path === SIGN_IN_PATH && challenged) return;
  let device = readDevice(headers, isApp);
  if (!device && !isApp && ctx.setCookie) {
    const id = newBrowserDeviceId();
    ctx.setCookie(DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: ctx.context.baseURL.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
    device = { id, label: `${labelFromUserAgent(headers?.get('user-agent') ?? '')} · tableau de bord` };
  }
  if (!device) return;

  const user = toAccount(created.user);
  const at = deps.throttle.now();
  const { notify } = await recordDevice(deps.devices, { userId: user.id, device, now: at, silent: ctx.path === SIGN_UP_PATH });
  if (!notify) return;
  const label = device.label;
  const notMeUrl = await safely(() => createNotMeUrl(writer(ctx), apiOrigin(ctx), user.id));
  await safely(() => deps.effects.newDevice({ user, label, at, notMeUrl: notMeUrl ?? null }));
}

const writer = (ctx: HookCtx): VerificationWriter => (row) => ctx.context.internalAdapter.createVerificationValue(row);
const apiOrigin = (ctx: HookCtx) => new URL(ctx.context.baseURL).origin;
const resetLifetime = (ctx: HookCtx) => ctx.context.options.emailAndPassword?.resetPasswordTokenExpiresIn ?? 3600;

/** A lock's side effects must never turn into a failed request: log and carry on. */
async function safely<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error('[auth-throttle] lock side effect failed', err);
    return undefined;
  }
}
