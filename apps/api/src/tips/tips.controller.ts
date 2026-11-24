import { Controller, Get, Query } from '@nestjs/common';
import { TipsService } from './tips.service.js';
import { TipCategory } from '../generated/prisma/client.js';
import { z } from 'zod';
import { AppException } from '../common/app-exception.js';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

const GetDailyTipSchema = z.object({
  category: z.nativeEnum(TipCategory).default('CLIENT'),
});

@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @AllowAnonymous()
  @Get('daily')
  async getDailyTip(@Query() query: any) {
    const result = GetDailyTipSchema.safeParse(query);
    if (!result.success) {
      throw new AppException('VALIDATION_FAILED', 'Invalid query parameters');
    }
    
    return this.tipsService.getDailyTip(result.data.category);
  }
}
