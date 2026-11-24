import { Body, Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import { AllowBeforeCguAcceptance } from '../platform/allow-before-cgu-acceptance.decorator.js';
import {
  stepUpAppleSchema,
  stepUpCodeSchema,
  stepUpPasswordSchema,
  type StepUpAppleInput,
  type GoogleStepUpStartResponse,
  type StepUpCodeInput,
  type StepUpMethodResponse,
  type StepUpPasswordInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SecurityService } from './security.service.js';
import { notMeConfirmPage, notMeDonePage, notMeInvalidPage } from './not-me-pages.js';

/** V7 A11 (U2b). « Ce n'est pas moi » (anonymous: the token is the credential) and the step-up. */
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  /** Opening the link reads the token and shows a form; nothing is changed (Q5). */
  @Get('not-me')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  async notMePage(@Query('token') token: string): Promise<string> {
    return (await this.security.checkNotMeToken(token ?? '')) ? notMeConfirmPage(token) : notMeInvalidPage();
  }

  /** The form's button. A plain HTML form, so the body is url-encoded (configure-app.ts). */
  @Post('not-me')
  @AllowAnonymous()
  @SkipPlatformGates()
  @HttpCode(200)
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  async notMeConfirm(@Body() body: { token?: string }): Promise<string> {
    const result = await this.security.notMe(typeof body?.token === 'string' ? body.token : '');
    return result.ok ? notMeDonePage(result.hadPassword) : notMeInvalidPage();
  }

  // V7 D5 (U9b, Q11): the four step-up routes stay open before a CGU re-acceptance, because account
  // deletion (also open) needs them.
  @Get('step-up')
  @AllowBeforeCguAcceptance()
  async method(@Session() session: UserSession): Promise<StepUpMethodResponse> {
    return this.security.methodResponse(session.user.id);
  }

  // `{ ok: true }` rather than 204 on purpose: the app's `api.post` parses a JSON body.
  @Post('step-up')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async withPassword(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(stepUpPasswordSchema)) body: StepUpPasswordInput,
  ): Promise<{ ok: true }> {
    await this.security.withPassword(stepUpSession(session), body.password);
    return { ok: true };
  }

  @Post('step-up/code/send')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async sendCode(@Session() session: UserSession): Promise<{ ok: true }> {
    await this.security.sendCode(stepUpSession(session));
    return { ok: true };
  }

  @Post('step-up/code')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async withCode(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(stepUpCodeSchema)) body: StepUpCodeInput,
  ): Promise<{ ok: true }> {
    await this.security.withCode(stepUpSession(session), body.code);
    return { ok: true };
  }
}

/** V9 U3 (`DEC9-09`). Confirming with Apple or Google; open before a CGU acceptance, as deletion is. */
@Controller('security/step-up')
export class ProviderStepUpController {
  constructor(private readonly security: SecurityService) {}

  @Post('apple')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async withApple(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(stepUpAppleSchema)) body: StepUpAppleInput,
  ): Promise<{ ok: true }> {
    await this.security.withApple(stepUpSession(session), body);
    return { ok: true };
  }

  @Post('google/start')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async startGoogle(@Session() session: UserSession): Promise<GoogleStepUpStartResponse> {
    const { nonce } = await this.security.startGoogle(stepUpSession(session));
    return { ok: true, nonce };
  }

  @Post('google/confirm')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async confirmGoogle(@Session() session: UserSession): Promise<{ ok: true }> {
    await this.security.confirmGoogle(stepUpSession(session));
    return { ok: true };
  }
}

function stepUpSession(session: UserSession) {
  return { userId: session.user.id, sessionId: session.session.id, email: session.user.email };
}
