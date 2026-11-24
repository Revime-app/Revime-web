import { APIError, isAPIError } from 'better-auth/api';
import { isStaffRole } from '@revime/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * CF4-41 (sub-project N), spec §4.3 and decision N5.
 *
 * 🛑 WHY THE PROOF LIVES ON THE SESSION. Better Auth's twoFactor plugin challenges only
 * `/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number` (its hooks.after matcher).
 * A 2FA-enabled account signing in by email code, Apple or Google gets a session with NO second
 * factor. So AdminRoleGuard never trusts `user.twoFactorEnabled`; it trusts
 * `Session.twoFactorVerifiedAt`, which only this module writes.
 *
 * Both two-factor verification endpoints create a NEW session when they succeed:
 * - completing a sign-in challenge (verify-two-factor.mjs `valid()` → createSession);
 * - confirming the setup (totp/index.mjs: createSession + delete the old one).
 * Either way `ctx.context.newSession` is the session that carries the proof.
 */
export const TWO_FACTOR_VERIFY_PATHS = ['/two-factor/verify-totp', '/two-factor/verify-backup-code'] as const;

type StampCtx = {
  path: string;
  context: { newSession?: { session: { token: string } } | null; returned?: unknown };
};

/**
 * Runs from hooks.after, whose matcher is `() => true`: it runs on EVERY auth request, so it
 * must never throw. A failed stamp leaves the operator asked for the code again - safe.
 */
export async function stampTwoFactorSession(prisma: PrismaClient, ctx: StampCtx): Promise<void> {
  try {
    if (!(TWO_FACTOR_VERIFY_PATHS as readonly string[]).includes(ctx.path)) return;
    // A refreshed session can sit in newSession even when the code was wrong (getSessionFromCtx
    // re-issues the cookie past updateAge). The code's verdict is `returned`.
    const returned = ctx.context.returned;
    if (isAPIError(returned) || returned instanceof Error) return;
    const token = ctx.context.newSession?.session?.token;
    if (!token) return;
    await prisma.session.updateMany({ where: { token }, data: { twoFactorVerifiedAt: new Date() } });
  } catch (err) {
    console.error('[staff-two-factor] failed to stamp the session', err);
  }
}

type DisableCtx = {
  path: string;
  context: { session?: { user: { role?: string | null } } | null };
};

/** Runs from hooks.before. Staff may never switch their second factor off (decision N3). */
export async function assertStaffMayDisableTwoFactor(_prisma: PrismaClient, ctx: DisableCtx): Promise<void> {
  if (ctx.path !== '/two-factor/disable') return;
  if (isStaffRole(ctx.context.session?.user.role)) {
    throw new APIError('FORBIDDEN', {
      code: 'FORBIDDEN',
      message: "La double authentification est obligatoire pour l'équipe.",
    });
  }
}

/**
 * CF4-51 (owner decision 2026-10-01): two-factor authentication belongs to the ADMIN DASHBOARD
 * only. A staff account signing into the mobile app is handled exactly like any user - no code.
 *
 * 🛑 SAFE BECAUSE THE CHALLENGE WAS NEVER THE GATE. AdminRoleGuard admits a session only when
 * `Session.twoFactorVerifiedAt` is set, and only `stampTwoFactorSession` above writes it, after a
 * correct TOTP / backup code. An app session never gets that stamp, so it opens no admin route -
 * the same position Google, Apple and e-mail-code sessions were already in (see the header).
 *
 * The app is recognised by its `revime://` origin: the Expo client sends `expo-origin`, and the
 * expo() server plugin copies it into `origin` when the request has none. A forged header gains
 * nothing but a session without the stamp.
 */
const APP_ORIGIN_PREFIX = 'revime://';

export function isMobileAppRequest(headers: Headers | undefined | null): boolean {
  if (!headers) return false;
  return [headers.get('origin'), headers.get('expo-origin')].some(
    (o) => typeof o === 'string' && o.startsWith(APP_ORIGIN_PREFIX),
  );
}

type AfterHook = { matcher: (context: never) => boolean; handler: unknown };

/**
 * Wraps Better Auth's twoFactor plugin so its sign-in challenge (its only `hooks.after` entry,
 * matched on `/sign-in/email|username|phone-number`) does not fire for the mobile app. Everything
 * else in the plugin - setup, verify-totp, backup codes - is untouched, so the dashboard keeps
 * the full flow.
 */
export function withoutAppSignInChallenge<P extends { hooks: { after: AfterHook[] } }>(plugin: P): P {
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: plugin.hooks.after.map((hook) => ({
        ...hook,
        matcher: (context: never) =>
          hook.matcher(context) &&
          !isMobileAppRequest((context as { headers?: Headers } | undefined)?.headers),
      })),
    },
  };
}

type ImpersonationCtx = {
  path: string;
  session: { session: { twoFactorVerifiedAt?: Date | string | null } } | null;
};

/**
 * Runs from hooks.before. `/admin/impersonate-user` is Better Auth's own endpoint: its only check
 * is the Super Admin role, NOT AdminRoleGuard, so before this a Super Admin's Google, Apple or
 * e-mail-code session - and, after CF4-51, his app session - could act as another user without
 * a code. It now needs the same second-factor proof as every dashboard route.
 * `/admin/stop-impersonating` is deliberately not checked, so an operator can always get back.
 */
export async function assertImpersonationHasSecondFactor(ctx: ImpersonationCtx): Promise<void> {
  if (ctx.path !== '/admin/impersonate-user') return;
  if (!ctx.session?.session?.twoFactorVerifiedAt) {
    throw new APIError('FORBIDDEN', {
      code: 'TWO_FACTOR_REQUIRED',
      message: 'Double authentification requise pour cette action.',
    });
  }
}
