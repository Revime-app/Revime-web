import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RepairerDashboardService } from './repairer-dashboard.service.js';
import { RepairersController } from './repairers.controller.js';
import { RepairersService } from './repairers.service.js';

/**
 * Nothing is exported, and `repairerStats` being a plain function is why nothing needs
 * to be: this module consumes the aggregate without any provider to export and no
 * import for another module to forget.
 *
 * A DI failure is INVISIBLE to tsc -- it is the defect P3 shipped in CommandesModule,
 * where the app could not boot while typecheck passed. The gate is any integration test
 * that calls `createTestApp()`.
 *
 * 🆕 `CF-34`, 2026-09-02: `GeoModule` is imported because `list` now geocodes a client-supplied
 * postal code. That made this module's warning above LIVE for the first time - it had no
 * cross-module provider to forget until now. And the warning understated the problem: the
 * integration gate it names is `*.int.spec.ts`, which `test:unit` EXCLUDES, so no gate ran it.
 * `test/repairers-module-graph.spec.ts` is now that gate, needs no database, and was watched
 * failing before it was made to pass.
 */
@Module({
  imports: [PrismaModule, GeoModule],
  controllers: [RepairersController],
  providers: [RepairersService, RepairerDashboardService],
})
export class RepairersModule {}
