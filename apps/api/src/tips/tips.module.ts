import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TipsController } from './tips.controller.js';
import { TipsService } from './tips.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TipsController],
  providers: [TipsService],
  exports: [TipsService],
})
export class TipsModule {}
