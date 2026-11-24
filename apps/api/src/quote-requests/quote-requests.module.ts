import { Module } from '@nestjs/common';
import { DemandesModule } from '../demandes/demandes.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QuoteRequestsController } from './quote-requests.controller.js';
import { QuoteRequestsService } from './quote-requests.service.js';

/** CF4-25. `app-module-di.spec.ts` walks this module's providers. */
@Module({
  imports: [PrismaModule, DemandesModule, NotificationsModule],
  controllers: [QuoteRequestsController],
  providers: [QuoteRequestsService],
  exports: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
