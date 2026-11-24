import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProviderStepUpController, SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';
import { ProviderRevocationService } from '../auth/provider-revocation/provider-revocation.service.js';

/**
 * V7 A11 (U2b). Exported for the routes that demand a step-up (users, connect). V9 U3: the provider
 * revocation an account deletion runs first (users).
 */
@Module({
  imports: [PrismaModule],
  controllers: [SecurityController, ProviderStepUpController],
  providers: [SecurityService, ProviderRevocationService],
  exports: [SecurityService, ProviderRevocationService],
})
export class SecurityModule {}
