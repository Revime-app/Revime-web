import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Nothing is exported, and that is the point of `repairer-stats.ts` being a plain
 * function: `OffersService` needs the aggregate but needs nothing from this module, so
 * there is no provider to export and no import for `OffersModule` to forget.
 *
 * A DI failure is invisible to `tsc` -- it is the exact defect P3 shipped in
 * `CommandesModule`, where the app could not boot while typecheck passed. The gate is
 * any integration test that calls `createTestApp()`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
