import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  promoCodeValidationBodySchema,
  type PromoCodeValidationBody,
  type PromoValidationResult,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PromoValidationService } from './promo-validation.service.js';

@Controller('promos')
export class PromosController {
  constructor(
    private readonly promoValidationService: PromoValidationService,
  ) {}

  /**
   * Signed-in users only, and the user is the session's. This was `@AllowAnonymous()` with the
   * `userId` read from the body: anyone could enumerate codes (nine distinct failure reasons)
   * and probe another user's first-order and per-use state by passing their UUID.
   */
  @Post('validate')
  @HttpCode(200)
  async validate(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(promoCodeValidationBodySchema))
    body: PromoCodeValidationBody,
  ): Promise<PromoValidationResult> {
    return this.promoValidationService.validatePromo({
      code: body.code,
      orderAmountCents: body.orderAmountCents,
      userId: session.user.id,
    });
  }
}
