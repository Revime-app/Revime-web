import { Module } from '@nestjs/common';
import { CommandesModule } from '../commandes/commandes.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PushModule } from '../push/push.module.js';
import { QuoteRequestsModule } from '../quote-requests/quote-requests.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { UsersModule } from '../users/users.module.js';
import { CronController } from './cron.controller.js';
import { CronService } from './cron.service.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { SetupModule } from '../setup/setup.module.js';

@Module({
  imports: [PrismaModule, CommandesModule, PaymentsModule, ShippingModule, PushModule, UsersModule, QuoteRequestsModule, FiscalModule, SetupModule],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
