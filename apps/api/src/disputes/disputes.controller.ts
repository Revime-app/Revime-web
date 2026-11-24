import { Body, Controller, Get, HttpCode, Logger, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  openDisputeByPartySchema,
  sendDisputeMessageSchema,
  signAttachmentSchema,
  type DisputeMessageDto,
  type OpenDisputeByPartyInput,
  type PartyDisputeDto,
  type SendDisputeMessageInput,
  type SignAttachmentInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DisputesService } from './disputes.service.js';

@Controller()
export class DisputesController {
  private readonly logger = new Logger(DisputesController.name);

  constructor(private readonly disputes: DisputesService) {}

  @Post('commandes/:id/dispute')
  @HttpCode(201)
  open(
    @Session() session: UserSession,
    @Param('id') commandeId: string,
    @Body(new ZodValidationPipe(openDisputeByPartySchema)) body: OpenDisputeByPartyInput,
  ): Promise<{ number: number; reference: string }> {
    return this.disputes.open(session.user.id, commandeId, body);
  }

  @Get('commandes/:id/dispute')
  get(
    @Session() session: UserSession,
    @Param('id') commandeId: string,
  ): Promise<PartyDisputeDto> {
    return this.disputes.get(session.user.id, commandeId);
  }

  @Post('commandes/:id/dispute/messages')
  @HttpCode(201)
  send(
    @Session() session: UserSession,
    @Param('id') commandeId: string,
    @Body(new ZodValidationPipe(sendDisputeMessageSchema)) body: SendDisputeMessageInput,
  ): Promise<DisputeMessageDto> {
    this.logger.log(
      `POST dispute message: commandeId=${commandeId} userId=${session.user.id} bodyLength=${body.body?.length ?? 0} hasAttachment=${Boolean(body.attachment)}`,
    );
    return this.disputes.send(session.user.id, commandeId, body);
  }

  @Post('commandes/:id/dispute/read')
  @HttpCode(204)
  markRead(
    @Session() session: UserSession,
    @Param('id') commandeId: string,
  ): Promise<void> {
    return this.disputes.markRead(session.user.id, commandeId);
  }

  @Post('commandes/:id/dispute/attachments/sign')
  @HttpCode(201)
  signUpload(
    @Session() session: UserSession,
    @Param('id') commandeId: string,
    @Body(new ZodValidationPipe(signAttachmentSchema)) body: SignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.disputes.signUpload(session.user.id, commandeId, body);
  }
}
