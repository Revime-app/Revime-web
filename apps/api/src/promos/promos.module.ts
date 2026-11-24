import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PromosController } from './promos.controller.js';
import { PromoValidationService } from './promo-validation.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PromosController],
  providers: [PromoValidationService],
  exports: [PromoValidationService],
})
export class PromosModule {}
