import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SecurityModule } from '../security/security.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule, GeoModule, SecurityModule],
  controllers: [UsersController],
  providers: [UsersService],
  // Exported for VerificationModule: checkPhone answers with the full MeResponse
  // so the app refreshes level, phone and modes from one response.
  exports: [UsersService],
})
export class UsersModule {}
