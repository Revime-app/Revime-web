import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { RefundService } from './refund.service.js';
import { CommandeAnnouncer } from './commande-announcer.service.js';

@Module({
  // Livraison Boxtal: forwardRef on both sides, like PaymentsModule and ConversationsModule.
  imports: [
    PrismaModule,
    NotificationsModule,
    forwardRef(() => ShippingModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [CommandesController],
  providers: [CommandesService, RefundService, CommandeAnnouncer],
  // Exported for CronModule (auto-release). Without this, Nest cannot inject it
  // and the app fails to BOOT -- while typecheck passes, because a DI failure is
  // invisible to tsc. That is the exact defect P3 shipped in this module and P4
  // recorded in AdminModule's comment.
  //
  // CF4-17 (design §E): `CommandeAnnouncer` exported too - Task 3 rewires
  // dispute/refund callers outside this module onto it.
  exports: [CommandesService, RefundService, CommandeAnnouncer],
})
export class CommandesModule {}
