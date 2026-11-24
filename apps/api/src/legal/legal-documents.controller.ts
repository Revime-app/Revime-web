import { Body, Controller, Get, HttpCode, Param, Post, Redirect, Req } from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  acceptCguSchema,
  acceptSignupTermsSchema,
  type AcceptCguInput,
  type AcceptSignupTermsInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AllowBeforeCguAcceptance } from '../platform/allow-before-cgu-acceptance.decorator.js';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import { LegalDocumentsService } from './legal-documents.service.js';

@Controller()
export class LegalDocumentsController {
  constructor(private readonly legal: LegalDocumentsService) {}

  /**
   * V7 D5 (U9b). « Lire » in the app, on the re-acceptance screen and in the dashboard: redirects to a
   * one-hour signed URL of the PDF. Public texts, so anonymous, and never refused by the gates
   * (reading the CGU is allowed before accepting them, Q11).
   */
  @Get('legal-documents/:kind/:version')
  @AllowAnonymous()
  @SkipPlatformGates()
  @Redirect('', 302)
  async read(@Param('kind') kind: string, @Param('version') version: string): Promise<{ url: string }> {
    return { url: await this.legal.readUrl(kind, version) };
  }

  /** V7 D5 (U9b, Q12). The re-acceptance screen's « Continuer ». */
  @Post('users/me/cgu-acceptance')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async accept(
    @Body(new ZodValidationPipe(acceptCguSchema)) body: AcceptCguInput,
    @Session() session: UserSession,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ): Promise<{ ok: true }> {
    await this.legal.acceptCgu(session.user.id, session.user.email, body.version, req.headers);
    return { ok: true };
  }

  /** V9 B1 (`DEC9-04`, `DEC9-05`). The terms screen's « Continuer »: both boxes at once. */
  @Post('users/me/signup-acceptance')
  @HttpCode(200)
  @AllowBeforeCguAcceptance()
  async acceptSignupTerms(
    @Body(new ZodValidationPipe(acceptSignupTermsSchema)) body: AcceptSignupTermsInput,
    @Session() session: UserSession,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ): Promise<{ ok: true }> {
    await this.legal.acceptSignupTerms(session.user.id, session.user.email, body.cguVersion, req.headers);
    return { ok: true };
  }
}
