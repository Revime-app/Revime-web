import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';

/**
 * 🛑 A DI FAILURE IS INVISIBLE TO `tsc`, and there is no runnable integration suite here to
 * catch it - `test:unit` excludes every `*.int.spec.ts` and `npm run test` writes to the
 * production database. So the only checks are Step 4's grep and, after deploy, the 401/404
 * control pair. `RepairersModule`'s header records the same trap.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
