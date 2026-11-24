import {
  Body,
  Controller,
  Get,
  HttpCode,
  Put,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  fiscalDeclarationInputSchema,
  type FiscalDeclarationInput,
  type FiscalPreFillResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FiscalService } from './fiscal.service.js';

@Controller('users/me/fiscal')
export class FiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get()
  getPreFill(@Session() session: UserSession): Promise<FiscalPreFillResponse> {
    return this.fiscal.getPreFill(session.user.id);
  }

  @Put()
  @HttpCode(200)
  submit(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(fiscalDeclarationInputSchema)) body: FiscalDeclarationInput,
  ): Promise<FiscalPreFillResponse> {
    return this.fiscal.submitDeclaration(session.user.id, body);
  }
}
