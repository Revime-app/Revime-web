import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { CGU_ACCEPTANCE_REQUIRED_TEXT } from '@revime/shared';
import { AppException } from '../src/common/app-exception.js';
import { PlatformGatesGuard, cguAcceptanceEnforced } from '../src/platform/platform-gates.guard.js';
import { ALLOW_BEFORE_CGU_ACCEPTANCE } from '../src/platform/allow-before-cgu-acceptance.decorator.js';
import { SKIP_PLATFORM_GATES } from '../src/platform/skip-platform-gates.decorator.js';

/**
 * V9 B1 (B1 (4); `DEC9-04` (4), (5), `DEC9-06` (3)). No recorded CGU acceptance, no access, behind
 * `CGU_ACCEPTANCE_ENFORCED` (off until the new build is delivered), independent of the V7 switch.
 */
afterEach(() => {
  delete process.env.CGU_ACCEPTANCE_ENFORCED;
  delete process.env.PLATFORM_GATES_ENFORCED;
});

function gate(opts: { forceReaccept?: boolean; maintenance?: boolean; resolved?: unknown } = {}) {
  const status = {
    read: vi.fn(async () => ({
      maintenance: { enabled: opts.maintenance ?? false, message: 'm' },
      cgu: { version: '2026-10-10', forceReaccept: opts.forceReaccept ?? false, summary: null, publishedAt: null },
      legalNotice: { version: '2026-10-10' },
    })),
  };
  const resolver = vi.fn(async () => opts.resolved ?? null);
  return { guard: new PlatformGatesGuard(new Reflector(), status as never, resolver as never), resolver };
}
function ctx(session: unknown, opts: { path?: string; allow?: boolean; skip?: boolean } = {}) {
  const handler = function handler() {};
  if (opts.allow) Reflect.defineMetadata(ALLOW_BEFORE_CGU_ACCEPTANCE, true, handler);
  if (opts.skip) Reflect.defineMetadata(SKIP_PLATFORM_GATES, true, handler);
  const req: Record<string, unknown> = { headers: {}, originalUrl: opts.path ?? '/api/v1/demandes' };
  if (session !== undefined) req.session = session;
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class C {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}
const user = (cguVersion: string | null, role: string | null = null) => ({ user: { id: 'u', role, cguVersion } });

describe('the switch', () => {
  it('reads CGU_ACCEPTANCE_ENFORCED, absent meaning off', () => {
    expect(cguAcceptanceEnforced()).toBe(false);
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    expect(cguAcceptanceEnforced()).toBe(true);
  });

  it('refuses nothing while off', async () => {
    await expect(gate().guard.canActivate(ctx(user(null)))).resolves.toBe(true);
  });
});

describe('with the switch on', () => {
  it('refuses an account with no recorded acceptance with 403 and the exact sentence', async () => {
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    const refusal = await gate().guard.canActivate(ctx(user(null))).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(AppException);
    expect((refusal as AppException).code).toBe('CGU_ACCEPTANCE_REQUIRED');
    expect((refusal as AppException).getStatus()).toBe(403);
    expect((refusal as AppException).message).toBe(CGU_ACCEPTANCE_REQUIRED_TEXT);
  });

  it('lets through an accepted account, the allowed routes, the dashboard, a visitor and the skipped routes', async () => {
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    const { guard } = gate();
    await expect(guard.canActivate(ctx(user('2026-10-10')))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(user(null), { allow: true }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(user(null, 'super_admin'), { path: '/api/v1/admin/users' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(null))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(user(null), { skip: true }))).resolves.toBe(true);
  });

  it('works without the V7 switch (the two are independent)', async () => {
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    expect(process.env.PLATFORM_GATES_ENFORCED).toBeUndefined();
    await expect(gate().guard.canActivate(ctx(user(null)))).rejects.toMatchObject({ code: 'CGU_ACCEPTANCE_REQUIRED' });
  });

  it('resolves the session itself when Better Auth has not set it yet', async () => {
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    const { guard, resolver } = gate({ resolved: user(null) });
    await expect(guard.canActivate(ctx(undefined))).rejects.toMatchObject({ code: 'CGU_ACCEPTANCE_REQUIRED' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('answers « no acceptance » before « re-accept » for a never-accepted account, and maintenance before both', async () => {
    process.env.CGU_ACCEPTANCE_ENFORCED = 'true';
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    await expect(gate({ forceReaccept: true }).guard.canActivate(ctx(user(null)))).rejects.toMatchObject({
      code: 'CGU_ACCEPTANCE_REQUIRED',
    });
    await expect(gate({ forceReaccept: true }).guard.canActivate(ctx(user('2026-09-01')))).rejects.toMatchObject({
      code: 'CGU_REACCEPT_REQUIRED',
    });
    await expect(gate({ maintenance: true }).guard.canActivate(ctx(user(null)))).rejects.toMatchObject({ code: 'MAINTENANCE' });
  });
});
