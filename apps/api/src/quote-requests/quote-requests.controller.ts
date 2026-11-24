import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  createQuoteRequestSchema,
  declineQuoteRequestSchema,
  type CreateQuoteRequestInput,
  type DeclineQuoteRequestInput,
  type DemandeDto,
  type RepairerQuoteRequestItem,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuoteRequestsService } from './quote-requests.service.js';

/**
 * CF4-25 (spec §4.2). Full paths, like `RepairersController`, because the URL space is
 * `repairers/*` and `demandes/*` rather than a resource of its own.
 *
 * `repairers/me/quote-requests` cannot be shadowed: the only other three-segment
 * `repairers/:userId/…` GET is `…/reviews`, whose last segment is a different literal, and
 * the two-segment `repairers/:userId` differs in segment count.
 */
@Controller()
export class QuoteRequestsController {
  constructor(private readonly quoteRequests: QuoteRequestsService) {}

  @Get('repairers/me/quote-requests')
  listMine(@Session() session: UserSession): Promise<RepairerQuoteRequestItem[]> {
    return this.quoteRequests.listForRepairer(session.user.id);
  }

  @Post('repairers/:userId/quote-requests')
  @HttpCode(201)
  create(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(createQuoteRequestSchema)) body: CreateQuoteRequestInput,
  ): Promise<DemandeDto> {
    return this.quoteRequests.create(session.user.id, userId, body);
  }

  /**
   * The three transitions. Four segments under `demandes/`, so none can collide with
   * `DemandesController`'s `:id` (two) or `:id/cancel` (three) routes.
   * 200 with `{ ok: true }` rather than 204, so the app's mutation helpers get a body.
   */
  @Post('demandes/:id/quote/decline')
  @HttpCode(200)
  decline(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(declineQuoteRequestSchema)) body: DeclineQuoteRequestInput,
  ): Promise<{ ok: true }> {
    return this.quoteRequests.decline(session.user.id, id, body);
  }

  @Post('demandes/:id/quote/refuse')
  @HttpCode(200)
  refuse(@Session() session: UserSession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.quoteRequests.refuse(session.user.id, id);
  }

  @Post('demandes/:id/quote/cancel')
  @HttpCode(200)
  cancel(@Session() session: UserSession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.quoteRequests.cancel(session.user.id, id);
  }
}
