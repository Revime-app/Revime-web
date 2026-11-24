import type { AdminAuditAction } from '@revime/shared';
import { isAPIError } from 'better-auth/api';
import { writeAuditRow, type AuditCapableClient } from './admin-audit-write.js';

/**
 * Better Auth's admin() plugin, called with no options in auth.ts, ships FIFTEEN
 * endpoints. Thirteen are disabled and two are kept.
 *
 * 🛑 THE VALUES ARE BASE-PATH-RELATIVE. `disabledPaths` is compared against
 * `normalizePathname(req.url, basePath)` (better-auth/dist/api/index.mjs:165), which
 * strips the base path - so '/admin/ban-user', never '/api/auth/admin/ban-user'. A
 * prefixed value silently matches nothing and the whole lockdown becomes a no-op that
 * still answers 400 exactly as production does today.
 *
 * A disabled path returns a genuine `404 Not Found` at the router, before the handler
 * (index.mjs:166), so it is indistinguishable from an endpoint that never existed. It
 * blocks the HTTP route only, not internal `auth.api.*` calls.
 */
export const AUTH_DISABLED_ADMIN_PATHS = [
  // 🛑 The reason this exists: routes.mjs:780 calls internalAdapter.deleteUser, a real
  // row delete, reaching this schema's 27 cascading User foreign keys - the Stripe money
  // trail, the VerificationAttempt ledger and the whole KYC chain.
  '/admin/remove-user',
  // Can mint an admin, which is the same class of hazard.
  '/admin/set-role',
  // Replaced by AdminController's own audited routes.
  '/admin/ban-user',
  '/admin/unban-user',
  '/admin/update-user',
  '/admin/get-user',
  '/admin/list-users',
  // Never wanted: we do not create accounts or set passwords from the dashboard.
  '/admin/create-user',
  '/admin/set-user-password',
  // Surface reduction: one path per capability, and we have built none of these.
  '/admin/list-user-sessions',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/has-permission',
] as const;

/**
 * Impersonation is KEPT on the owner's decision of 2026-09-03. `stop-impersonating` is
 * kept because without it an impersonating operator cannot get back.
 *
 * Stated limit: there are only three apps - api, admin, mobile - and none of them
 * renders the user experience on the web, so this yields an API session rather than a
 * « view as user » screen.
 */
export const AUTH_KEPT_ADMIN_PATHS = [
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
] as const;

const ADMIN_PREFIX = '/admin/';

/**
 * Maps a Better Auth path to an audit action, or null if it is not an admin action.
 *
 * `auth.admin.other` is why this returns a member rather than the raw path: the column
 * is constrained by adminAuditActionSchema, so an endpoint a future Better Auth version
 * adds would otherwise be REFUSED by the writer and vanish. The path survives in `detail`.
 */
export function actionForAuthPath(path: string): AdminAuditAction | null {
  if (!path.startsWith(ADMIN_PREFIX)) return null;
  if (path === '/admin/impersonate-user') return 'auth.admin.impersonate';
  if (path === '/admin/stop-impersonating') return 'auth.admin.stop_impersonating';
  return 'auth.admin.other';
}

type BridgeCtx = {
  path: string;
  body?: { userId?: string } | undefined;
  context?:
    | {
        session?: { user?: { id?: string; email?: string } } | undefined;
        returned?: unknown;
      }
    | undefined;
};

/**
 * The tripwire behind Better Auth's surviving admin endpoints.
 *
 * 🛑 A STANDALONE FUNCTION TAKING ITS CLIENT, not a Nest provider, because auth.ts
 * builds its own module-level PrismaClient and no injected service is reachable from
 * it. Same pattern and same stated reason as promote-basic.ts and ensure-profile.ts,
 * and auth.ts's own recordEmailAttempt is the closest precedent - an audit-style write
 * from this file, wrapped so it can never fail the user's action.
 *
 * Its job is to make an UNAUDITED admin write impossible to have. It is not the path
 * anything we build writes through; AdminController's @Audit decorator is.
 */
export async function recordAuthAdminAction(
  prisma: AuditCapableClient,
  ctx: BridgeCtx,
  onError: (message: string, err: unknown) => void,
): Promise<void> {
  const action = actionForAuthPath(ctx.path);
  if (action === null) return;

  // 🛑 Write nothing when there is no session. The table exists because Ch.8 requires
  // « l'ensemble des actions réalisées depuis le Dashboard » be historisé, and a caller
  // with no session took no action from the Dashboard - it is a probe, and probes belong
  // in the request log. But a signed-in NON-admin hitting an admin endpoint HAS a session,
  // so it must still be recorded - with a real actor and (after Fix 1) a real 403. That is
  // precisely the gap piece A's residual #1 named (guard-layer refusals unaudited).
  if (!ctx.context?.session) return;

  const targetId = ctx.body?.userId ?? null;

  await writeAuditRow(
    prisma,
    {
      actorUserId: ctx.context.session.user?.id ?? null,
      actorEmail: ctx.context.session.user?.email ?? null,
      action,
      targetType: targetId === null ? null : 'User',
      targetId,
      // 🛑 CORRECTED after review. An earlier draft hardcoded 200 on two premises that
      // Step 7 disproved: that the real status was unavailable, and that whether the hook
      // fires on a throw was unknown. Both are answered - better-auth's dispatch converts a
      // thrown APIError into `context.returned = e` carrying its status, THEN runs the
      // after hooks (dispatch.mjs:231-242). So read it. A table where every row says 200
      // cannot answer « show me the refused admin attempts », which is the one question an
      // audit log exists for.
      statusCode: isAPIError(ctx.context.returned) ? ctx.context.returned.statusCode : 200,
      detail: action === 'auth.admin.other' ? { path: ctx.path } : null,
    },
    onError,
  );
}
