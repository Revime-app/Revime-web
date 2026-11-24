import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CancellationsController } from './cancellations.controller.js';
import { CancellationsService } from './cancellations.service.js';

/** CF4-27. `app-module-di.spec.ts` walks this module's providers. */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CancellationsController],
  providers: [CancellationsService],
  exports: [CancellationsService],
})
export class CancellationsModule {}
