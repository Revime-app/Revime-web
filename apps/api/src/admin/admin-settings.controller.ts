import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { updatePlatformSettingsSchema, type UpdatePlatformSettingsDto } from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Audit } from './admin-audit.decorator.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { RequirePermission } from './require-permission.decorator.js';

@Controller('admin/settings')
@UseGuards(AdminAuthGuard)
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get()
  @RequirePermission('dashboard.read')
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @RequirePermission('admin.manage')
  @Audit('settings.update', {
    targetType: 'PlatformSettings',
    detailFields: Object.keys(updatePlatformSettingsSchema.shape),
  })
  async updateSettings(
    @Body(new ZodValidationPipe(updatePlatformSettingsSchema)) parsed: UpdatePlatformSettingsDto,
    @Session() session: UserSession,
  ) {
    return this.settingsService.updateSettings(parsed, session.user.id);
  }
}
