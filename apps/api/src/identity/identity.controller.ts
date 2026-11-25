import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import {
  identitySessionRequestSchema,
  type IdentitySessionInput,
  type IdentitySessionResponse,
  type IdentityStatusResponse,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { IdentityService } from './identity.service.js';
import { siteOrigins } from '../auth/site-origins.js';

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  /**
   * The body is OPTIONAL and the variant defaults to the selfie check, which is what keeps the
   * binary on the client's phone working: build 6 ships `api.post('/identity/session', {})`.
   */
  @Post('identity/session')
  @HttpCode(201)
  session(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(identitySessionRequestSchema)) body: IdentitySessionInput,
    @Query('surface') surface?: string,
  ): Promise<IdentitySessionResponse> {
    return this.identity.start(session.user.id, body, surface === 'web' ? 'web' : 'app');
  }

  @Get('identity/status')
  status(@Session() session: UserSession): Promise<IdentityStatusResponse> {
    return this.identity.status(session.user.id);
  }

  /**
   * An Article 17 erasure request against the identity verification, WITHOUT closing the account.
   * `DELETE`, matching `DELETE /users/me`, and idempotent for the same reason.
   *
   * 🛑 This route discharges only HALF the duty. The other half - telling the user they must
   * contact Stripe support themselves - is app copy, because a redaction the user never hears
   * about does not discharge anything.
   */
  @Delete('identity/verification')
  requestErasure(@Session() session: UserSession): Promise<IdentityStatusResponse> {
    return this.identity.requestErasure(session.user.id);
  }

  /**
   * Stripe Identity's return_url. Deliberately unauthenticated and deliberately
   * trust-free: it reads nothing, grants nothing and writes nothing. Stripe's own
   * documentation is explicit that returning means the flow was exited, not that
   * anything was verified - the webhook is what grants.
   *
   * A static redirect, so it needs no query parameter and cannot be probed for
   * whether a given user has a session.
   */
  @Get('identity/return')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('revime://identite/retour', 302)
  returnFromIdentity(): void {}

  /** The same exit, for a verification started on the site: back to the site's return page. */
  @Get('identity/return-web')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('https://revime.fr/identite/retour', 302)
  returnFromIdentityWeb(): { url: string } {
    return { url: `${siteOrigins()[0]}/identite/retour` };
  }

  /**
   * Stripe's endpoint, and its OWN endpoint rather than cases inside P1's
   * /stripe/webhook. That route carries real card charges; putting
   * verification-level logic on the money path lets an identity bug fail a payment.
   */
  @Post('stripe/identity/webhook')
  @HttpCode(200)
  @AllowAnonymous()
  @SkipPlatformGates()
  webhook(
    @Req() req: { body: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    return this.identity.handleWebhook(req.body, signature);
  }
}
