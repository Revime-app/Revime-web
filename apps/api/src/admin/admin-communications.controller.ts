import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  SEGMENT_LOCATION_MESSAGE,
  adminBroadcastSendSchema,
  broadcastTargetSchema,
  segmentLocationNeedsRepairers,
  type AdminBroadcastHistoryResponse,
  type AdminBroadcastPreview,
  type AdminBroadcastRecipientSuggestion,
  type AdminBroadcastSendInput,
  type BroadcastTarget,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { Audit } from './admin-audit.decorator.js';
import { RequirePermission } from './require-permission.decorator.js';
import {
  AdminCommunicationsService,
  type AdminBroadcastSendResult,
} from './admin-communications.service.js';

@Controller('admin/communications')
@UseGuards(AdminAuthGuard)
export class AdminCommunicationsController {
  constructor(
    private readonly communicationsService: AdminCommunicationsService,
  ) {}

  @RequirePermission('dashboard.read')
  @Post('preview')
  async preview(
    @Body(new ZodValidationPipe(broadcastTargetSchema)) target: BroadcastTarget,
  ): Promise<AdminBroadcastPreview> {
    // The send schema refuses this; the preview must say the same instead of answering « 0 ».
    if (segmentLocationNeedsRepairers(target)) {
      throw new UnprocessableEntityException(SEGMENT_LOCATION_MESSAGE);
    }
    return this.communicationsService.previewAudience(target);
  }

  /** V7 D2 (U5): the single-recipient suggestions, readable by any staff member like the preview. */
  @RequirePermission('dashboard.read')
  @Get('recipients')
  async recipients(@Query('q') q?: string): Promise<AdminBroadcastRecipientSuggestion[]> {
    return this.communicationsService.searchRecipients(q);
  }

  @RequirePermission('dashboard.read')
  @Get('history')
  async history(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminBroadcastHistoryResponse> {
    const p = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const l = limit ? Math.max(1, Math.min(100, parseInt(limit, 10) || 20)) : 20;
    return this.communicationsService.getHistory(p, l);
  }

  @RequirePermission('users.moderate')
  @Audit('broadcast.send', { targetType: 'AdminBroadcast', detailFields: ['templateKey', 'subject'] })
  @Post('send')
  async send(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(adminBroadcastSendSchema)) body: AdminBroadcastSendInput,
  ): Promise<AdminBroadcastSendResult> {
    return this.communicationsService.sendBroadcast(session.user.id, body);
  }
}
