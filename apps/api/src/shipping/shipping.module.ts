import { Module, forwardRef } from '@nestjs/common';
import { CommandesModule } from '../commandes/commandes.module.js';
import { GeoModule } from '../geo/geo.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import './boxtal.gateway.js'; // registers the real driver with the factory
import { ShipmentsService } from './shipments.service.js';
import { ShippingController } from './shipping.controller.js';
import { ShippingQuotesService } from './shipping-quotes.service.js';

/**
 * Livraison Boxtal. `forwardRef` with CommandesModule on BOTH sides, the shape PaymentsModule
 * and ConversationsModule already use: CommandesController calls ShipmentsService after an
 * address or step write, and ShipmentsService calls CommandesService.advanceBySystem.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, GeoModule, forwardRef(() => CommandesModule)],
  controllers: [ShippingController],
  providers: [ShippingQuotesService, ShipmentsService],
  exports: [ShipmentsService],
})
export class ShippingModule {}
