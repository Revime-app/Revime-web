import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  createCancellationRequestSchema,
  type CancellationRequestInfo,
  type CreateCancellationRequestInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CancellationsService } from './cancellations.service.js';

/** CF4-27 (spec §4.4). `POST commandes/:id/cancellation` and its withdraw route. */
@Controller('commandes')
export class CancellationsController {
  constructor(private readonly cancellations: CancellationsService) {}

  @Post(':id/cancellation')
  @HttpCode(201)
  request(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCancellationRequestSchema)) body: CreateCancellationRequestInput,
  ): Promise<CancellationRequestInfo> {
    return this.cancellations.request(session.user.id, id, body);
  }

  @Post(':id/cancellation/withdraw')
  @HttpCode(200)
  withdraw(@Session() session: UserSession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.cancellations.withdraw(session.user.id, id);
  }
}
