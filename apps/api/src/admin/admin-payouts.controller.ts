import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  adminIncompleteAccountsQuerySchema,
  adminPayoutListQuerySchema,
  adminPayoutKpisSchema,
  type AdminIncompleteAccountsResponse,
  type AdminIncompleteConnectAccount,
  type AdminPayoutKpis,
  type AdminPayoutListItem,
  type AdminPayoutListResponse,
} from '@revime/shared';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminPayoutsService } from './admin-payouts.service.js';
import type { FiscalRemindersResult } from '../fiscal/fiscal.service.js';

@Controller('admin/payouts')
@UseGuards(AdminAuthGuard)
export class AdminPayoutsController {
  constructor(private readonly payoutsService: AdminPayoutsService) {}

  @RequirePermission('dashboard.read')
  @Get('incomplete-accounts')
  listIncompleteAccounts(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminIncompleteAccountsResponse> {
    const parsed = adminIncompleteAccountsQuerySchema.parse(query);
    return this.payoutsService.listIncompleteConnectAccounts(parsed);
  }

  @RequirePermission('dashboard.read')
  @Get('kpis')
  payoutKpis(): Promise<AdminPayoutKpis> {
    return this.payoutsService.getPayoutKpis();
  }

  @RequirePermission('dashboard.read')
  @Get('export')
  async exportCsv(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = adminPayoutListQuerySchema.parse(query);
    const { filename, content } = await this.payoutsService.exportCsv(parsed);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @RequirePermission('payments.manage')
  @Post('accounts/:userId/sync')
  syncAccount(
    @Param('userId') userId: string,
    @Session() session: UserSession,
  ): Promise<AdminIncompleteConnectAccount> {
    return this.payoutsService.syncConnectAccount(userId, session?.user?.id);
  }

  @RequirePermission('payments.manage')
  @Post('accounts/:userId/remind')
  remindAccount(
    @Param('userId') userId: string,
    @Session() session: UserSession,
  ): Promise<{ success: boolean }> {
    return this.payoutsService.sendConnectReminder(userId, session?.user?.id);
  }

  @RequirePermission('users.moderate')
  @Post('fiscal/remind')
  triggerFiscalReminders(@Session() session: UserSession): Promise<FiscalRemindersResult> {
    return this.payoutsService.triggerFiscalReminders(session?.user?.id);
  }

  @RequirePermission('payments.manage')
  @Post(':id/retry')
  retryTransfer(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<{ success: boolean; transferId: string }> {
    return this.payoutsService.retryTransfer(id, session?.user?.id);
  }

  @RequirePermission('dashboard.read')
  @Get(':id')
  payoutDetail(@Param('id') id: string): Promise<AdminPayoutListItem> {
    return this.payoutsService.getPayoutDetail(id);
  }

  @RequirePermission('dashboard.read')
  @Get()
  listPayouts(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminPayoutListResponse> {
    const parsed = adminPayoutListQuerySchema.parse(query);
    return this.payoutsService.listPayouts(parsed);
  }
}
