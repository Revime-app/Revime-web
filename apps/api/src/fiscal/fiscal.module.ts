import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommandesModule } from '../commandes/commandes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FiscalController } from './fiscal.controller.js';
import { FiscalService } from './fiscal.service.js';

@Module({
  imports: [PrismaModule, CommandesModule, NotificationsModule],
  controllers: [FiscalController],
  providers: [FiscalService],
  exports: [FiscalService],
})
export class FiscalModule {}
