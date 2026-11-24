import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  lookupCompanySchema,
  signDocumentUploadSchema,
  submitBusinessVerificationSchema,
  type BusinessStatusResponse,
  type LookupCompanyInput,
  type LookupCompanyResponse,
  type SignDocumentUploadInput,
  type SubmitBusinessVerificationInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BusinessService } from './business.service.js';

@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Post('sign-document-upload')
  signDocumentUpload(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(signDocumentUploadSchema)) body: SignDocumentUploadInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.business.signDocumentUpload(session.user.id, body);
  }

  @Post('lookup')
  lookup(
    @Session() _session: UserSession,
    @Body(new ZodValidationPipe(lookupCompanySchema)) body: LookupCompanyInput,
  ): Promise<LookupCompanyResponse> {
    return this.business.lookup(body.identifier);
  }

  @Post('submit')
  submit(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(submitBusinessVerificationSchema)) body: SubmitBusinessVerificationInput,
    @Ip() ip: string,
  ): Promise<BusinessStatusResponse> {
    return this.business.submit(session.user.id, body, ip);
  }

  @Get('status')
  status(@Session() session: UserSession): Promise<BusinessStatusResponse> {
    return this.business.status(session.user.id);
  }
}
