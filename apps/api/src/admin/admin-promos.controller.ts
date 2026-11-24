import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  promoCodeCreateSchema,
  promoCodeUpdateStatusSchema,
  type AdminPromoKpis,
  type AdminPromoListItem,
  type AdminPromoListResponse,
  type PromoCodeCreateInput,
  type PromoCodeUpdateStatusInput,
  type PromoStatus,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminAuthGuard } from './admin-role.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminPromoService } from './admin-promos.service.js';
import { Audit } from './admin-audit.decorator.js';

@Controller('admin/promos')
@UseGuards(AdminAuthGuard)
export class AdminPromosController {
  constructor(private readonly adminPromosService: AdminPromoService) {}

  @RequirePermission('dashboard.read')
  @Get()
  async listPromos(
    @Query('search') search?: string,
    @Query('status') status?: PromoStatus,
    @Query('isReferral') isReferral?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminPromoListResponse> {
    const p = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const l = limit ? Math.max(1, Math.min(100, parseInt(limit, 10) || 20)) : 20;
    const isRef =
      isReferral !== undefined
        ? isReferral === 'true' || isReferral === '1'
        : undefined;

    return this.adminPromosService.listPromos({
      search,
      status,
      isReferral: isRef,
      page: p,
      limit: l,
    });
  }

  @RequirePermission('dashboard.read')
  @Get('kpis')
  async getMarketingKpis(): Promise<AdminPromoKpis> {
    return this.adminPromosService.getMarketingKpis();
  }

  @RequirePermission('dashboard.read')
  @Get(':id')
  async getPromoDetail(@Param('id') id: string): Promise<AdminPromoListItem> {
    return this.adminPromosService.getPromoDetail(id);
  }

  @RequirePermission('users.moderate')
  @Audit('promo.create', { targetType: 'PromoCode', detailFields: ['code', 'type', 'valueCents'] })
  @Post()
  async createPromo(
    @Body(new ZodValidationPipe(promoCodeCreateSchema)) body: PromoCodeCreateInput,
  ): Promise<AdminPromoListItem> {
    return this.adminPromosService.createPromo(body);
  }

  @RequirePermission('users.moderate')
  @Audit('promo.update_status', { targetType: 'PromoCode', targetParam: 'id', detailFields: ['status'] })
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(promoCodeUpdateStatusSchema))
    body: PromoCodeUpdateStatusInput,
  ): Promise<AdminPromoListItem> {
    return this.adminPromosService.updateStatus(id, body.status);
  }
}
