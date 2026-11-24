import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  createConversationSchema,
  reportConversationSchema,
  sendMessageSchema,
  signAttachmentSchema,
  signChatPhotoSchema,
  type ConversationDto,
  type ConversationListItem,
  type CreateConversationInput,
  type MessageDto,
  type ReportConversationInput,
  type SendMessageInput,
  type SignAttachmentInput,
  type SignChatPhotoInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ConversationsService } from './conversations.service.js';
import { ModerationService } from './moderation.service.js';

@Controller()
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly moderation: ModerationService,
  ) {}

  @Get('conversations')
  listInbox(@Session() session: UserSession): Promise<ConversationListItem[]> {
    return this.conversations.listInbox(session.user.id);
  }

  @Post('conversations')
  @HttpCode(201)
  getOrCreate(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversationInput,
  ): Promise<{ id: string }> {
    return this.conversations.getOrCreate(session.user.id, body);
  }

  @Post('conversations/:id/photos/sign')
  @HttpCode(201)
  signPhoto(
    @Session() session: UserSession,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(signChatPhotoSchema)) body: SignChatPhotoInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.conversations.signPhotoUpload(session.user.id, conversationId, body);
  }

  @Post('conversations/:id/attachments/sign')
  @HttpCode(201)
  signAttachment(
    @Session() session: UserSession,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(signAttachmentSchema)) body: SignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.conversations.signAttachmentUpload(session.user.id, conversationId, body);
  }

  @Get('conversations/:id')
  getThread(
    @Session() session: UserSession,
    @Param('id') conversationId: string,
  ): Promise<ConversationDto> {
    return this.conversations.getThread(session.user.id, conversationId);
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  sendMessage(
    @Session() session: UserSession,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<MessageDto> {
    return this.conversations.sendMessage(session.user.id, conversationId, body);
  }

  @Patch('conversations/:id/read')
  @HttpCode(204)
  markRead(@Session() session: UserSession, @Param('id') conversationId: string): Promise<void> {
    return this.conversations.markRead(session.user.id, conversationId);
  }

  /**
   * Deliberately NOT behind `MESSAGING_ENABLED` -- see spec §8.1a and the service's
   * own comment. 201 because it creates a row.
   */
  @Post('conversations/:id/report')
  @HttpCode(201)
  async report(
    @Session() session: UserSession,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(reportConversationSchema)) body: ReportConversationInput,
  ): Promise<{ ok: true }> {
    await this.moderation.report(session.user.id, conversationId, body);
    return { ok: true };
  }
}
