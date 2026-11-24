import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  adminAlertListQuerySchema,
  adminAlertPreferencesPatchSchema,
  type AdminAlertItem,
  type AdminAlertKpis,
  type AdminAlertListResponse,
  type AdminAlertPreferences,
} from '@revime/shared';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminAlertsService } from './admin-alerts.service.js';

@Controller('admin/alerts')
@UseGuards(AdminAuthGuard)
export class AdminAlertsController {
  constructor(private readonly alertsService: AdminAlertsService) {}

  @RequirePermission('dashboard.read')
  @Get('unread-count')
  async getUnreadCount(): Promise<{ unreadCount: number }> {
    const unreadCount = await this.alertsService.getUnreadCount();
    return { unreadCount };
  }

  @RequirePermission('dashboard.read')
  @Get('kpis')
  getKpis(): Promise<AdminAlertKpis> {
    return this.alertsService.getAlertKpis();
  }

  @RequirePermission('dashboard.read')
  @Get('preferences')
  getPreferences(): Promise<AdminAlertPreferences> {
    return this.alertsService.getPreferences();
  }

  @RequirePermission('dashboard.read')
  @Patch('preferences')
  async updatePreferences(@Body() body: unknown): Promise<AdminAlertPreferences> {
    const parsed = adminAlertPreferencesPatchSchema.parse(body);
    return this.alertsService.updatePreferences(parsed);
  }

  @RequirePermission('dashboard.read')
  @Post('mark-all-read')
  async markAllAsRead(@Req() req?: any): Promise<{ count: number }> {
    const operatorUserId = req?.user?.id ?? req?.session?.user?.id;
    return this.alertsService.markAllAsRead(operatorUserId);
  }

  @RequirePermission('dashboard.read')
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<AdminAlertItem> {
    const operatorUserId = req?.user?.id ?? req?.session?.user?.id;
    return this.alertsService.markAsRead(id, operatorUserId);
  }

  @RequirePermission('dashboard.read')
  @Get()
  async listAlerts(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminAlertListResponse> {
    const parsed = adminAlertListQuerySchema.parse(query);
    return this.alertsService.listAlerts(parsed);
  }
}
