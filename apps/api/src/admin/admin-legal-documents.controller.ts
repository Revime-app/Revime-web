import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  publishLegalVersionSchema,
  signLegalUploadSchema,
  type AdminLegalVersionsResponse,
  type LegalDocumentVersionDto,
  type PublishLegalVersionInput,
  type SignLegalUploadInput,
  type SignLegalUploadResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LegalDocumentsService } from '../legal/legal-documents.service.js';
import { Audit } from './admin-audit.decorator.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';

/**
 * V7 D5 (U9b, `DEC7-24` Q14). Réglages → CGU & Légal: the published versions for the dropdowns, and
 * « Publier une nouvelle version » (sign an upload, PUT the PDF, publish). Publishing is a super
 * admin's, like every other write on that page (`admin.manage`); choosing the active version goes
 * through `PATCH /admin/settings`, which checks it is published and is audited there.
 */
@Controller('admin/legal-documents')
@UseGuards(AdminAuthGuard)
export class AdminLegalDocumentsController {
  constructor(private readonly legal: LegalDocumentsService) {}

  @Get()
  @RequirePermission('dashboard.read')
  list(): Promise<AdminLegalVersionsResponse> {
    return this.legal.list();
  }

  @Post('upload-url')
  @RequirePermission('admin.manage')
  uploadUrl(@Body(new ZodValidationPipe(signLegalUploadSchema)) body: SignLegalUploadInput): Promise<SignLegalUploadResponse> {
    return this.legal.signUpload(body);
  }

  @Post()
  @RequirePermission('admin.manage')
  @Audit('legal_document.publish', {
    targetType: 'LegalDocumentVersion',
    detailFields: ['kind', 'version', 'activate'],
  })
  publish(
    @Body(new ZodValidationPipe(publishLegalVersionSchema)) body: PublishLegalVersionInput,
    @Session() session: UserSession,
  ): Promise<LegalDocumentVersionDto> {
    return this.legal.publish(body, session.user.id);
  }
}
