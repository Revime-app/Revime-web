import { Global, Module } from '@nestjs/common';
import { ConsentProofsService } from './consent-proofs.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ConsentProofsService],
  exports: [ConsentProofsService],
})
export class ComplianceModule {}
