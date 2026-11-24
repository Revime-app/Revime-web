import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommandesModule } from '../commandes/commandes.module.js';
import { DisputesController } from './disputes.controller.js';
import { DisputesService } from './disputes.service.js';

@Module({
  imports: [PrismaModule, CommandesModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
