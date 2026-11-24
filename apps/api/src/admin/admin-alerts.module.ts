import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminAlertsService } from './admin-alerts.service.js';

/**
 * F7. GLOBAL so the producers (disputes, payments, commandes, shipping) can inject
 * `AdminAlertsService` without importing AdminModule, which already imports CommandesModule and
 * ShippingModule and would make a cycle. The service was registered inside AdminModule only and
 * nothing outside it ever called it, so no alert was ever raised. Same device as ComplianceModule.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AdminAlertsService],
  exports: [AdminAlertsService],
})
export class AdminAlertsModule {}
