import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommandesModule } from '../commandes/commandes.module.js';
import { SecurityModule } from '../security/security.module.js';
import { ConnectController } from './connect.controller.js';
import { ConnectService } from './connect.service.js';

@Module({
  imports: [PrismaModule, CommandesModule, SecurityModule],
  controllers: [ConnectController],
  providers: [ConnectService],
})
export class ConnectModule {}
