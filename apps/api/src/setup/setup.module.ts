import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SetupRemindersService } from './setup-reminders.service.js';

/** V8 E1. The setup reminders, run by `CronModule`. */
@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [SetupRemindersService],
  exports: [SetupRemindersService],
})
export class SetupModule {}
