import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformGatesGuard } from './platform-gates.guard.js';
import { PlatformStatusService } from './platform-status.service.js';

/** V7 D5 (U9, `DEC7-24`): the public platform status and the global maintenance guard. */
@Module({
  imports: [PrismaModule],
  controllers: [PlatformController],
  providers: [PlatformStatusService, { provide: APP_GUARD, useClass: PlatformGatesGuard }],
})
export class PlatformModule {}
