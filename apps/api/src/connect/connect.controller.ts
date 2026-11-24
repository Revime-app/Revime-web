import { Controller, Get, Headers, HttpCode, Post, Redirect, Req } from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import type { ConnectOnboardingResponse, ConnectStatusResponse } from '@revime/shared';
import { ConnectService } from './connect.service.js';
import { appStepUpEnforced, SecurityService } from '../security/security.service.js';

@Controller()
export class ConnectController {
  constructor(
    private readonly connect: ConnectService,
    private readonly security: SecurityService,
  ) {}

  @Post('connect/onboarding')
  @HttpCode(201)
  async onboarding(@Session() session: UserSession): Promise<ConnectOnboardingResponse> {
    // V7 A11 (U2b, Q6 / Q8): changing an IBAN already on file needs the password (or a code) again,
    // once the switch is on. The first setup has no IBAN to steal, so it needs nothing.
    if (appStepUpEnforced() && (await this.connect.hasIbanOnFile(session.user.id))) {
      await this.security.assertSteppedUp(session.session.id);
    }
    return this.connect.startOnboarding(session.user.id);
  }

  @Get('connect/status')
  status(@Session() session: UserSession): Promise<ConnectStatusResponse> {
    return this.connect.status(session.user.id);
  }

  /**
   * Stripe's return_url. Deliberately unauthenticated and deliberately trust-free:
   * it reads NOTHING - no query parameter, no body - grants nothing and writes
   * nothing. The app fetches authoritative state through `GET /connect/status` with
   * its own session cookie once it lands, and that state comes from the webhook.
   *
   * A static redirect, so it cannot be probed for whether a given user is onboarding.
   * The Identity sibling is identical.
   */
  @Get('connect/return')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('revime://connect/retour', 302)
  returnFromOnboarding(): { url: string } {
    return { url: 'revime://connect/retour' };
  }

  /**
   * Stripe's refresh_url. Mints a new link server-side and sends the user back in.
   *
   * Takes the user from the SESSION rather than a `?u=` query parameter. The old
   * shape was an unmetered outbound-Stripe surface: unauthenticated, and every
   * fetch minted an Account Link, so a link-preview bot spent a Stripe call. It
   * was never practically reachable - no DTO returns another user's id - but this
   * converges on `GET /identity/return`, which deliberately takes no parameter.
   *
   * Still @AllowAnonymous: Stripe's browser redirect opens in a separate browser,
   * so the app's session cookie is often absent. `refreshTarget('')` then falls
   * back to the app rather than erroring, which is an acceptable degradation -
   * the réparateur can request a fresh link. Properly seamless recovery would
   * require signing the user id into a query parameter, which would close this
   * unmetered surface entirely.
   */
  @Get('connect/refresh')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('revime://connect/retour', 302)
  async refresh(@Session() session: UserSession | undefined): Promise<{ url: string }> {
    // V7 U2b: a fresh link for an IBAN on file obeys the same step-up as the first one; without it
    // the browser goes back to the app, which asks for the password.
    const userId = session?.user?.id ?? '';
    if (userId && appStepUpEnforced() && (await this.connect.hasIbanOnFile(userId))) {
      if (!(await this.security.isSteppedUp(session!.session.id))) return { url: 'revime://connect/retour' };
    }
    return { url: await this.connect.refreshTarget(userId) };
  }

  @Post('stripe/connect/webhook')
  @HttpCode(200)
  @AllowAnonymous()
  @SkipPlatformGates()
  webhook(
    @Req() req: { body: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    return this.connect.handleWebhook(req.body, signature);
  }
}
