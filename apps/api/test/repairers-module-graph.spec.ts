import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { RepairersModule } from '../src/repairers/repairers.module.js';
import { RepairersService } from '../src/repairers/repairers.service.js';
import { RepairerDashboardService } from '../src/repairers/repairer-dashboard.service.js';
import { RepairersController } from '../src/repairers/repairers.controller.js';

/**
 * 🛑 THE GATE THIS MODULE HAS NEVER HAD, and its own header explains why it needs one:
 * « A DI failure is INVISIBLE to tsc - it is the defect P3 shipped in CommandesModule, where
 * the app could not boot while typecheck passed. The gate is any integration test that calls
 * `createTestApp()`. » And `test:unit` EXCLUDES `*.int.spec.ts`, so that gate never runs.
 *
 * `CF-34` gives `RepairersService` its first constructor dependency on another module's
 * provider, so "compiles but cannot boot" became reachable here for the first time.
 *
 * It needs NO DATABASE, verified rather than hoped: `PrismaService` opens its connection in
 * `onModuleInit`, not its constructor, and `.compile()` does not run lifecycle hooks. It does
 * need `DATABASE_URL` to be PARSEABLE - the unit suite already runs against an unreachable one.
 */
describe('RepairersModule', () => {
  it('resolves RepairersService, which is what proves GeoModule is imported', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RepairersModule] }).compile();

    expect(moduleRef.get(RepairersService)).toBeInstanceOf(RepairersService);

    await moduleRef.close();
  });

  it('resolves RepairerDashboardService (CF4-G)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RepairersModule] }).compile();

    expect(moduleRef.get(RepairerDashboardService)).toBeInstanceOf(RepairerDashboardService);

    await moduleRef.close();
  });

  it('declares repairers/me/dashboard before repairers/:userId', () => {
    const proto = RepairersController.prototype as unknown as Record<string, unknown>;
    const paths = Object.getOwnPropertyNames(proto)
      .filter((k) => k !== 'constructor')
      .map((k) => Reflect.getMetadata('path', proto[k] as object) as string | undefined)
      .filter((p): p is string => typeof p === 'string');
    const me = paths.indexOf('repairers/me/dashboard');
    expect(me).toBeGreaterThanOrEqual(0);
    expect(me).toBeLessThan(paths.indexOf('repairers/:userId'));
    const seen = paths.indexOf('repairers/me/dashboard-seen');
    expect(seen).toBeGreaterThanOrEqual(0);
    expect(seen).toBeLessThan(paths.indexOf('repairers/:userId'));
  });
});
