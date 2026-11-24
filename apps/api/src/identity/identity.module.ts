import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
