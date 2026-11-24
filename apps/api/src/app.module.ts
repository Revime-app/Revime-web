import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessModule } from './business/business.module.js';
import { CancellationsModule } from './cancellations/cancellations.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CommandesModule } from './commandes/commandes.module.js';
import { AdminAlertsModule } from './admin/admin-alerts.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { ConnectModule } from './connect/connect.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { CronModule } from './cron/cron.module.js';
import { DemandesModule } from './demandes/demandes.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OffersModule } from './offers/offers.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuoteRequestsModule } from './quote-requests/quote-requests.module.js';
import { RepairersModule } from './repairers/repairers.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { ShippingModule } from './shipping/shipping.module.js';
import { UsersModule } from './users/users.module.js';
import { SecurityModule } from './security/security.module.js';
import { VerificationModule } from './verification/verification.module.js';
import { TipsModule } from './tips/tips.module.js';
import { DisputesModule } from './disputes/disputes.module.js';
import { PromosModule } from './promos/promos.module.js';
import { FiscalModule } from './fiscal/fiscal.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { LegalModule } from './legal/legal.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    // V7 D5 (U9): the maintenance guard. After AuthModule so Better Auth's guard usually runs first;
    // the maintenance guard resolves the session itself when it has not.
    PlatformModule,
    LegalModule,
    UsersModule,
    SecurityModule,
    AdminModule,
    AdminAlertsModule,
    BusinessModule,
    CancellationsModule,
    CatalogModule,
    CommandesModule,
    ComplianceModule,
    ConnectModule,
    ConversationsModule,
    CronModule,
    DemandesModule,
    DisputesModule,
    FavoritesModule,
    FiscalModule,
    IdentityModule,
    NotificationsModule,
    OffersModule,
    PaymentsModule,
    PromosModule,
    QuoteRequestsModule,
    RepairersModule,
    ReviewsModule,
    ShippingModule,
    VerificationModule,
    TipsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
