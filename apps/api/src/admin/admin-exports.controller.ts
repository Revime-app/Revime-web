import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  adminDac7RecapsQuerySchema,
  adminExportQuerySchema,
  can,
  type AdminDac7RecapResult,
  type AdminExportQuery,
  type AdminExportSummary,
  type AdminExportPreviewResponse,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminExportsService } from './admin-exports.service.js';
import { defaultDac7Year } from './dac7-report.js';

/**
 * The DAC7 file lists every paid réparateur with his tax number and date of birth, and the four
 * other reports carry none of that. `dashboard.read` is held by the read-only role, so the route's
 * own permission is too weak for this one report: it asks for `payments.manage` (finance, admin,
 * super admin) on top.
 */
function assertCanReadDac7(query: AdminExportQuery, session: UserSession): void {
  const role = session?.user?.role;
  if (query.reportType === 'DAC7_ANNUAL' && !can(typeof role === 'string' ? role : null, 'payments.manage')) {
    throw new AppException('FORBIDDEN', "L'export DAC7 est réservé à la finance et aux administrateurs.");
  }
}

@Controller('admin/exports')
@UseGuards(AdminAuthGuard)
export class AdminExportsController {
  constructor(private readonly exportsService: AdminExportsService) {}

  @RequirePermission('dashboard.read')
  @Get('summary')
  exportSummary(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminExportSummary> {
    const parsed = adminExportQuerySchema.parse(query);
    return this.exportsService.getExportSummary(parsed);
  }

  @RequirePermission('dashboard.read')
  @Get('preview')
  exportPreview(
    @Query() query: Record<string, string | undefined>,
    @Session() session: UserSession,
  ): Promise<AdminExportPreviewResponse> {
    const parsed = adminExportQuerySchema.parse(query);
    assertCanReadDac7(parsed, session);
    return this.exportsService.getExportPreview(parsed);
  }

  @RequirePermission('dashboard.read')
  @Get('download')
  async exportDownload(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
    @Session() session: UserSession,
  ): Promise<void> {
    const parsed = adminExportQuerySchema.parse(query);
    assertCanReadDac7(parsed, session);
    const { filename, content } = await this.exportsService.generateCsv(parsed, session?.user?.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  /** Emails every complete réparateur his annual recap. Finance sends it, not moderation. */
  @RequirePermission('payments.manage')
  @Post('dac7/send-recaps')
  sendDac7Recaps(
    @Session() session: UserSession,
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminDac7RecapResult> {
    const { year } = adminDac7RecapsQuerySchema.parse(query);
    return this.exportsService.sendDac7Recaps(year ?? defaultDac7Year(), session?.user?.id);
  }
}
