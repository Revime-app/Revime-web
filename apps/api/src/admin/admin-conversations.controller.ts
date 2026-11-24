import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  adminConversationListQuerySchema,
  type AdminConversationDetailResponse,
  type AdminConversationKpis,
  type AdminConversationListQuery,
  type AdminConversationListResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Audit } from './admin-audit.decorator.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminConversationsService } from './admin-conversations.service.js';

@UseGuards(AdminAuthGuard)
@Controller('admin/conversations')
export class AdminConversationsController {
  constructor(private readonly conversationsService: AdminConversationsService) {}

  @RequirePermission('conversations.read')
  @Get('kpis')
  getKpis(): Promise<AdminConversationKpis> {
    return this.conversationsService.getConversationKpis();
  }

  @RequirePermission('content.moderate')
  @Audit('conversation.close', { targetType: 'Conversation', targetParam: 'id', detailFields: ['reason'] })
  @Post(':id/close')
  async closeConversation(@Param('id') id: string): Promise<{ ok: true }> {
    await this.conversationsService.closeConversation(id);
    return { ok: true };
  }

  @RequirePermission('content.moderate')
  @Audit('conversation.reopen', { targetType: 'Conversation', targetParam: 'id' })
  @Post(':id/reopen')
  async reopenConversation(@Param('id') id: string): Promise<{ ok: true }> {
    await this.conversationsService.reopenConversation(id);
    return { ok: true };
  }

  /**
   * Reading a private thread is itself audited (`conversation.read`): staff with only
   * `conversations.read` can open any pair of users' messages, and the journal must say who did.
   */
  @RequirePermission('conversations.read')
  @Audit('conversation.read', { targetType: 'Conversation', targetParam: 'id' })
  @Get(':id')
  getDetail(@Param('id') id: string): Promise<AdminConversationDetailResponse> {
    return this.conversationsService.getConversationDetail(id);
  }

  @RequirePermission('conversations.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(adminConversationListQuerySchema)) query: AdminConversationListQuery,
  ): Promise<AdminConversationListResponse> {
    return this.conversationsService.listConversations(query);
  }
}
