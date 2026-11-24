import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reflector, APP_GUARD } from '@nestjs/core';
import { ADMIN_ROLES } from '@revime/shared';
import { AppException } from '../src/common/app-exception.js';
import { PlatformGatesGuard } from '../src/platform/platform-gates.guard.js';
import { PlatformStatusService } from '../src/platform/platform-status.service.js';
import { PlatformController } from '../src/platform/platform.controller.js';
import { PlatformModule } from '../src/platform/platform.module.js';
import { SKIP_PLATFORM_GATES } from '../src/platform/skip-platform-gates.decorator.js';
import { HealthController } from '../src/health/health.controller.js';

/**
 * V7 D5 (U9, `DEC7-24`). Maintenance mode on the API: a public status read for the app, and a global
 * guard that refuses everyone but the six staff roles with `503 MAINTENANCE` and the dashboard's
 * message. The refusal waits for `PLATFORM_GATES_ENFORCED=true`, flipped when the end-of-round build
 * reaches users, so today's installed builds keep working. Webhooks, crons, `/health`, the status
 * read and the browser return pages are never refused.
 */

const MESSAGE = 'Plateforme en cours de maintenance. De retour très prochainement.';

afterEach(() => {
  delete process.env.PLATFORM_GATES_ENFORCED;
});

function statusService(enabled: boolean) {
  return { read: vi.fn(async () => ({ maintenance: { enabled, message: MESSAGE } })) };
}

function context(opts: { session?: unknown; skip?: boolean } = {}) {
  const handler = function handler() {};
  const cls = class Ctl {};
  if (opts.skip) Reflect.defineMetadata(SKIP_PLATFORM_GATES, true, handler);
  const req: Record<string, unknown> = { headers: {} };
  if ('session' in opts) req.session = opts.session;
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function guard(enabled: boolean, resolver?: (req: unknown) => Promise<unknown>) {
  const status = statusService(enabled);
  const resolve = vi.fn(resolver ?? (async () => null));
  return { guard: new PlatformGatesGuard(new Reflector(), status as never, resolve as never), status, resolve };
}

const asUser = (role: string | null) => ({ user: { id: 'u1', role }, session: { id: 's1' } });

describe('the maintenance guard', () => {
  it('reads nothing and lets everything through until the switch is on (Q4)', async () => {
    const t = guard(true);
    await expect(t.guard.canActivate(context({ session: null }))).resolves.toBe(true);
    expect(t.status.read).not.toHaveBeenCalled();
  });

  it('lets everyone through when maintenance is off', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(false);
    await expect(t.guard.canActivate(context({ session: asUser(null) }))).resolves.toBe(true);
  });

  it('refuses a signed-out visitor with 503 MAINTENANCE and the dashboard message', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true);
    const refusal = await t.guard.canActivate(context({ session: null })).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(AppException);
    expect((refusal as AppException).code).toBe('MAINTENANCE');
    expect((refusal as AppException).getStatus()).toBe(503);
    expect((refusal as AppException).message).toBe(MESSAGE);
  });

  it('refuses a signed-in client or réparateur', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true);
    await expect(t.guard.canActivate(context({ session: asUser(null) }))).rejects.toMatchObject({ code: 'MAINTENANCE' });
    await expect(t.guard.canActivate(context({ session: asUser('user') }))).rejects.toMatchObject({ code: 'MAINTENANCE' });
  });

  it('lets each of the six staff roles through (Q3)', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true);
    for (const role of ADMIN_ROLES) {
      await expect(t.guard.canActivate(context({ session: asUser(role) }))).resolves.toBe(true);
    }
  });

  it('never refuses a route marked @SkipPlatformGates, and reads nothing for it', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true);
    await expect(t.guard.canActivate(context({ session: null, skip: true }))).resolves.toBe(true);
    expect(t.status.read).not.toHaveBeenCalled();
  });

  it('resolves the session itself when the auth guard has not run yet, so a staff member still passes', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true, async () => asUser('support'));
    await expect(t.guard.canActivate(context())).resolves.toBe(true);
    expect(t.resolve).toHaveBeenCalledTimes(1);
  });

  it('does not resolve the session again when the auth guard already set it', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const t = guard(true);
    await t.guard.canActivate(context({ session: asUser('admin') }));
    expect(t.resolve).not.toHaveBeenCalled();
  });
});

describe('the status read', () => {
  function service(row: unknown) {
    // U9b also reads the active CGU version's row; its fields are `v7-u9b-legal-versions.spec.ts`'s.
    const prisma = { platformSettings: { findUnique: vi.fn(async () => row) }, legalDocumentVersion: { findUnique: vi.fn(async () => null) } };
    const s = new PlatformStatusService(prisma as never);
    let clock = 1_000_000;
    s.now = () => clock;
    return { s, prisma, tick: (ms: number) => (clock += ms) };
  }

  it('answers the stored switch and message', async () => {
    const t = service({ maintenanceEnabled: true, maintenanceMessage: 'Retour à 18 h.' });
    await expect(t.s.read()).resolves.toMatchObject({ maintenance: { enabled: true, message: 'Retour à 18 h.' } });
    expect(t.prisma.platformSettings.findUnique).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      select: expect.objectContaining({ maintenanceEnabled: true, maintenanceMessage: true }),
    });
  });

  it('answers the defaults (maintenance off) when no settings row exists, and writes nothing', async () => {
    const t = service(null);
    await expect(t.s.read()).resolves.toMatchObject({
      maintenance: { enabled: false, message: 'Plateforme en cours de maintenance. De retour très prochainement.' },
      cgu: { version: '2026-10-10', forceReaccept: false },
    });
  });

  it('keeps an answer for 10 seconds, so the guard is not a database read per request', async () => {
    const t = service({ maintenanceEnabled: false, maintenanceMessage: MESSAGE });
    await t.s.read();
    t.tick(9_999);
    await t.s.read();
    expect(t.prisma.platformSettings.findUnique).toHaveBeenCalledTimes(1);
    t.tick(1);
    await t.s.read();
    expect(t.prisma.platformSettings.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('GET /platform/status', () => {
  it('returns the status read, to anyone, and is never refused by the gate', async () => {
    const status = statusService(true);
    const ctl = new PlatformController(status as never);
    await expect(ctl.status()).resolves.toEqual({ maintenance: { enabled: true, message: MESSAGE } });
    expect(Reflect.getMetadata('path', PlatformController)).toBe('platform');
    expect(Reflect.getMetadata('path', PlatformController.prototype.status)).toBe('status');
    expect(Reflect.getMetadata('PUBLIC', PlatformController.prototype.status)).toBe(true);
    expect(Reflect.getMetadata(SKIP_PLATFORM_GATES, PlatformController.prototype.status)).toBe(true);
  });
});

describe('wiring', () => {
  it('PlatformModule registers the guard globally and AppModule imports it', () => {
    const providers = Reflect.getMetadata('providers', PlatformModule) as unknown[];
    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: PlatformGatesGuard });
    const app = readFileSync(join(__dirname, '../src/app.module.ts'), 'utf8');
    expect(app).toMatch(/PlatformModule,/);
  });

  it('the exemption decorator really sets the metadata the guard reads (health)', () => {
    expect(Reflect.getMetadata(SKIP_PLATFORM_GATES, HealthController.prototype.check)).toBe(true);
  });

  it('the error filter keeps MAINTENANCE and its 503', async () => {
    const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    new AllExceptionsFilter().catch(new AppException('MAINTENANCE', MESSAGE), host as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'MAINTENANCE', message: MESSAGE } });
  });
});

/**
 * Every anonymous route is decided on purpose. A new webhook added without `@SkipPlatformGates()`
 * would be refused during maintenance and lose its events, so this fails until it is either exempt
 * (the decorator on the line right after `@AllowAnonymous()`) or listed here as blocked with a reason.
 */
const BLOCKED_DURING_MAINTENANCE: Record<string, string> = {
  'catalog.controller.ts#listCategories': 'app content, nothing to serve while the app is closed',
  'catalog.controller.ts#listBrands': 'app content',
  'catalog.controller.ts#listModels': 'app content',
  'tips.controller.ts#getDailyTip': 'app content',
};

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('every @AllowAnonymous route is decided', () => {
  const found: string[] = [];
  for (const file of controllerFiles(join(__dirname, '../src'))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim() !== '@AllowAnonymous()') return;
      const rest = lines.slice(i + 1);
      const handler = rest.map((l) => /^\s+(?:async\s+)?(\w+)\(/.exec(l)?.[1]).find(Boolean);
      const key = `${file.split(/[\\/]/).pop()}#${handler}`;
      found.push(key);
      it(key, () => {
        const exempt = (lines[i + 1] ?? '').trim() === '@SkipPlatformGates()';
        expect(exempt || key in BLOCKED_DURING_MAINTENANCE, `${key}: add @SkipPlatformGates() under @AllowAnonymous(), or list it as blocked`).toBe(true);
        expect(exempt && key in BLOCKED_DURING_MAINTENANCE, `${key} is both exempt and listed as blocked`).toBe(false);
      });
    });
  }

  it('found the anonymous routes, and every blocked entry still exists', () => {
    // 17 on 2026-10-29: 12 exempt, 4 blocked, and `/platform/status` itself.
    expect(found.length).toBeGreaterThanOrEqual(17);
    for (const key of Object.keys(BLOCKED_DURING_MAINTENANCE)) expect(found).toContain(key);
  });
});
