import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PushModule } from '../push/push.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * `exports` is load-bearing rather than habitual: OffersModule, PaymentsModule,
 * ConversationsModule, CommandesModule and DemandesModule all inject this service to emit,
 * so the provider has to leave this module.
 */
@Module({
  imports: [PrismaModule, PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
