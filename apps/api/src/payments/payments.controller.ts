import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Redirect, Req } from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import {
  createCheckoutSchema,
  type CheckoutSessionResponse,
  type CreateCheckoutInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PaymentsService } from './payments.service.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('offers/:id/checkout')
  @HttpCode(201)
  checkout(
    @Session() session: UserSession,
    @Param('id') offerId: string,
    @Body(new ZodValidationPipe(createCheckoutSchema)) body: CreateCheckoutInput,
  ): Promise<CheckoutSessionResponse> {
    return this.payments.createCheckout(session.user.id, offerId, body);
  }

  /**
   * Stripe's endpoint. No session, so `@AllowAnonymous` - the signature IS the
   * authentication, which is why Task 7's tests cover it before any business
   * logic exists behind it.
   */
  @Post('stripe/webhook')
  @HttpCode(200)
  @AllowAnonymous()
  @SkipPlatformGates()
  webhook(
    @Req() req: { body: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    return this.payments.handleWebhook(req.body, signature);
  }

  /**
   * Stripe's success_url and cancel_url. A browser navigation, so no session and
   * no CORS involvement.
   */
  @Get('payments/return')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('revime://', 302)
  async returnFromCheckout(
    @Query('commande') commandeId: string,
    @Query('r') outcome: string,
  ): Promise<{ url: string }> {
    return { url: await this.payments.returnTarget(commandeId ?? '', outcome ?? '') };
  }
}
