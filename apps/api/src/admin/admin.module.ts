import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommandesModule } from '../commandes/commandes.module.js';
import { CronModule } from '../cron/cron.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { PushModule } from '../push/push.module.js';
import { AdminController } from './admin.controller.js';
import { AdminStaffPublicController } from './admin-staff-public.controller.js';
import { AdminCommunicationsController } from './admin-communications.controller.js';
import { AdminPromosController } from './admin-promos.controller.js';
import { AdminPayoutsController } from './admin-payouts.controller.js';
import { AdminExportsController } from './admin-exports.controller.js';
import { AdminAlertsController } from './admin-alerts.controller.js';
import { AdminConversationsController } from './admin-conversations.controller.js';
import { AdminConversationsService } from './admin-conversations.service.js';
import { AdminSettingsController } from './admin-settings.controller.js';
import { AdminLegalDocumentsController } from './admin-legal-documents.controller.js';
import { LegalModule } from '../legal/legal.module.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { ModerationAdminService } from './moderation-admin.service.js';
import { AdminPromoService } from './admin-promos.service.js';
import { AdminCommunicationsService } from './admin-communications.service.js';
import { AdminOverviewService } from './admin-overview.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminUsersWriteService } from './admin-users-write.service.js';
import { AdminRepairersService } from './admin-repairers.service.js';
import { AdminRepairersWriteService } from './admin-repairers-write.service.js';
import { AdminDemandesService } from './admin-demandes.service.js';
import { AdminDemandesWriteService } from './admin-demandes-write.service.js';
import { AdminOffresService } from './admin-offres.service.js';
import { AdminDisputesService } from './admin-disputes.service.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import { AdminShipmentsListService } from './admin-shipments-list.service.js';
import { AdminRefundsService } from './admin-refunds.service.js';
import { AdminVerificationsService } from './admin-verifications.service.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminTipsService } from './admin-tips.service.js';
import { AdminReviewsService } from './admin-reviews.service.js';
import { AdminIdentityDecisionsService } from './admin-identity-decisions.service.js';
import { AdminStaffService } from './admin-staff.service.js';
import { AdminStaffInvitationsService } from './admin-staff-invitations.service.js';
import { AdminCancellationsService } from './admin-cancellations.service.js';
import { AdminDisputeSpacesService } from './admin-dispute-spaces.service.js';
import { AdminComplianceService } from './admin-compliance.service.js';
import { AdminPayoutsService } from './admin-payouts.service.js';
import { AdminExportsService } from './admin-exports.service.js';
import { AdminAuditInterceptor } from './admin-audit.interceptor.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';

// imports is REQUIRED, not tidying. AdminController now injects PrismaService,
// and without this the app cannot boot -- while typecheck passes, because a DI
// failure is invisible to tsc. This is the exact defect P3 shipped in
// CommandesModule, caught only by running the controller.
//
// ModerationAdminService needs only PrismaService, which PrismaModule already
// supplies, so piece 2 adds a provider and no new import.
//
// NotificationsModule is piece C1's: AdminDemandesWriteService injects
// NotificationsService. Without it the app boots but the injected parameter is
// undefined, which is the defect piece B2 shipped.
//
// ShippingModule is Livraison Boxtal's: AdminController injects ShipmentsService for the
// shipment retry route, and `admin-module-di.spec.ts` is the gate that sees a missing import.
@Module({
  imports: [PrismaModule, CommandesModule, CronModule, UsersModule, NotificationsModule, CatalogModule, ShippingModule, PushModule, FiscalModule, LegalModule],
  controllers: [
    AdminConversationsController,
    AdminController,
    AdminStaffPublicController,
    AdminCommunicationsController,
    AdminPromosController,
    AdminPayoutsController,
    AdminExportsController,
    AdminAlertsController,
    AdminSettingsController,
    // V7 D5 (U9b): CGU and mentions légales versions.
    AdminLegalDocumentsController,
  ],
  providers: [
    ModerationAdminService,
    AdminPromoService,
    AdminCommunicationsService,
    AdminOverviewService,
    AdminAuditService,
    AdminUsersService,
    AdminUsersWriteService,
    AdminRepairersService,
    AdminRepairersWriteService,
    AdminDemandesService,
    AdminDemandesWriteService,
    AdminOffresService,
    AdminDisputesService,
    AdminPaymentsService,
    AdminShipmentsListService,
    AdminRefundsService,
    AdminVerificationsService,
    AdminCatalogService,
    AdminStatsService,
    AdminTipsService,
    AdminReviewsService,
    AdminIdentityDecisionsService,
    AdminStaffService,
    AdminStaffInvitationsService,
    AdminCancellationsService,
    AdminDisputeSpacesService,
    AdminComplianceService,
    AdminPayoutsService,
    AdminExportsService,
    AdminConversationsService,
    AdminSettingsService,
    AdminAuditInterceptor,
  ],
  exports: [
    AdminCatalogService,
    AdminStatsService,
    AdminDisputeSpacesService,
    AdminStaffInvitationsService,
    AdminComplianceService,
    AdminPromoService,
    AdminPayoutsService,
    AdminExportsService,
    AdminConversationsService,
    AdminSettingsService,
  ],
})
export class AdminModule {}
