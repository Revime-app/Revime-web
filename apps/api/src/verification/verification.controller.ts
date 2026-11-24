import { Body, Controller, Ip, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  checkPhoneVerificationSchema,
  startPhoneVerificationSchema,
  type CheckPhoneVerificationInput,
  type MeResponse,
  type StartPhoneVerificationInput,
  type StartPhoneVerificationResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { VerificationService } from './verification.service.js';

@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post('phone/start')
  startPhone(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(startPhoneVerificationSchema)) body: StartPhoneVerificationInput,
    @Ip() ip: string,
  ): Promise<StartPhoneVerificationResponse> {
    return this.verification.startPhone(session.user.id, body, ip);
  }

  @Post('phone/check')
  checkPhone(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(checkPhoneVerificationSchema)) body: CheckPhoneVerificationInput,
  ): Promise<MeResponse> {
    return this.verification.checkPhone(session.user.id, body);
  }
}
