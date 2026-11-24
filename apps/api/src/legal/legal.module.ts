import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LegalDocumentsController } from './legal-documents.controller.js';
import { LegalDocumentsService } from './legal-documents.service.js';

/** V7 D5 (U9b): published CGU and mentions légales versions, their public read, and re-acceptance. */
@Module({
  imports: [PrismaModule],
  controllers: [LegalDocumentsController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalModule {}
