import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

@Module({
  // UsersModule for UsersService: checkPhone answers with the full MeResponse so
  // the app refreshes level, phone and modes from a single response, matching
  // UsersService.updateRepairer's convention.
  imports: [PrismaModule, UsersModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
