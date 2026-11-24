import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BadgeService } from './badge.service.js';
import { PushService } from './push.service.js';

/**
 * `exports` is load-bearing: NotificationsModule injects PushService to dispatch after every
 * emit, and CronModule injects it for the receipts job. NotificationsController also injects
 * BadgeService for GET me/badge.
 */
@Module({
  imports: [PrismaModule],
  providers: [PushService, BadgeService],
  exports: [PushService, BadgeService],
})
export class PushModule {}
