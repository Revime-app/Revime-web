import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DemandesController } from './demandes.controller.js';
import { DemandesService } from './demandes.service.js';

@Module({
  imports: [PrismaModule, GeoModule, NotificationsModule],
  controllers: [DemandesController],
  providers: [DemandesService],
  exports: [DemandesService],
})
export class DemandesModule {}
