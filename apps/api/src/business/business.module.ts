import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BusinessController } from './business.controller.js';
import { BusinessService } from './business.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
