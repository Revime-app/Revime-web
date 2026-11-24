import { CanActivate, ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
// Value import: Nest reads design:paramtypes to inject it.
import { Reflector } from '@nestjs/core';
import {
  CGU_ACCEPTANCE_REQUIRED_TEXT,
  CGU_REACCEPT_REQUIRED_TEXT,
  cguReacceptRequired,
  maintenanceBlocks,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { ALLOW_BEFORE_CGU_ACCEPTANCE } from './allow-before-cgu-acceptance.decorator.js';
import { PlatformStatusService } from './platform-status.service.js';
import { SKIP_PLATFORM_GATES } from './skip-platform-gates.decorator.js';

type GateRequest = {
  headers: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
  /**
   * Set by the Better Auth guard when it has run: `null` signed out, else the session. `cguVersion`
   * is one of the user's Better Auth `additionalFields`, so it is on the session's user.
   */
  session?: { user?: { role?: string | null; cguVersion?: string | null } } | null;
};

export type GateSessionResolver = (req: GateRequest) => Promise<GateRequest['session']>;
export const GATE_SESSION_RESOLVER = 'GATE_SESSION_RESOLVER';

/** Imported lazily so this guard does not load the whole auth configuration with it. */
const resolveWithBetterAuth: GateSessionResolver = async (req) => {
  const [{ auth }, { fromNodeHeaders }] = await Promise.all([
    import('../auth/auth.js'),
    import('better-auth/node'),
  ]);
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
};

/**
 * V7 D5 (U9, `DEC7-24` Q4 and Q10). The app's maintenance screen ships with the end-of-round build;
 * this server refusal waits for `PLATFORM_GATES_ENFORCED=true`, flipped on Render at that build's
 * delivery, so a tick in the dashboard cannot break today's installed builds. Older builds then show
 * the message as an error, since the code is new to them.
 */
export function platformGatesEnforced(): boolean {
  return process.env.PLATFORM_GATES_ENFORCED === 'true';
}

/**
 * V9 B1 (B1 (4), `DEC9-04` (5)): no recorded CGU acceptance, no access. Its own switch, independent of
 * `PLATFORM_GATES_ENFORCED`, added on Render only once the build with the terms screen is delivered,
 * so installed builds are never locked out. Absent = off.
 */
export function cguAcceptanceEnforced(): boolean {
  return process.env.CGU_ACCEPTANCE_ENFORCED === 'true';
}

/**
 * Registered globally by `PlatformModule`. While maintenance is on and enforced, every request from
 * anyone but the six staff roles is answered `503 MAINTENANCE` with the dashboard's message; then,
 * since U9b, a signed-in user owing a forced CGU re-acceptance gets `403 CGU_REACCEPT_REQUIRED`. Routes
 * marked `@SkipPlatformGates()` are never refused, and Better Auth's own `/api/auth/*` routes are not
 * Nest routes, so a team member can still sign in.
 *
 * Global guards are not guaranteed to run after Better Auth's, so when the session is not on the
 * request yet the guard resolves it itself. That only happens while maintenance is actually on.
 */
@Injectable()
export class PlatformGatesGuard implements CanActivate {
  private readonly resolveSession: GateSessionResolver;

  constructor(
    private readonly reflector: Reflector,
    private readonly status: PlatformStatusService,
    @Optional() @Inject(GATE_SESSION_RESOLVER) resolveSession?: GateSessionResolver,
  ) {
    this.resolveSession = resolveSession ?? resolveWithBetterAuth;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gatesOn = platformGatesEnforced();
    const acceptanceOn = cguAcceptanceEnforced();
    if (!gatesOn && !acceptanceOn) return true;
    if (context.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_PLATFORM_GATES, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const req = context.switchToHttp().getRequest<GateRequest>();
    let resolved: GateRequest['session'] | undefined = req.session;
    const session = async () => (resolved !== undefined ? resolved : (resolved = await this.resolveSession(req)));

    const status = gatesOn ? await this.status.read() : null;
    if (status && (status.maintenance.enabled || status.cgu?.forceReaccept)) {
      if (maintenanceBlocks(status, (await session())?.user?.role)) {
        throw new AppException('MAINTENANCE', status.maintenance.message);
      }
    }

    // V7 D5 (U9b, Q7, Q11, Q13): the CGU checks below refuse every app route but the few marked
    // `@AllowBeforeCguAcceptance()`, staff included. The dashboard has no CGU gate, so its `/admin`
    // routes are exempt by path rather than by decorating some forty controllers.
    const path = req.originalUrl ?? req.url ?? '';
    if (
      path.startsWith('/api/v1/admin/') ||
      this.reflector.getAllAndOverride<boolean>(ALLOW_BEFORE_CGU_ACCEPTANCE, [context.getHandler(), context.getClass()])
    ) {
      return true;
    }

    // V9 B1: never accepted at all comes first, so the new build shows its terms screen, not the
    // « conditions évoluent » one (`FND9-017`).
    if (acceptanceOn) {
      const user = (await session())?.user;
      if (user && (user.cguVersion ?? null) === null) {
        throw new AppException('CGU_ACCEPTANCE_REQUIRED', CGU_ACCEPTANCE_REQUIRED_TEXT);
      }
    }
    if (status?.cgu?.forceReaccept && cguReacceptRequired(status, (await session())?.user)) {
      throw new AppException('CGU_REACCEPT_REQUIRED', CGU_REACCEPT_REQUIRED_TEXT);
    }
    return true;
  }
}
