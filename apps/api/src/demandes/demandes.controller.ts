import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { browseQuerySchema, createDemandeSchema, feedQuerySchema, signPhotoSchema, updateDemandeSchema, type BrowseQuery, type CreateDemandeInput, type DemandeDto, type DemandeListItem, type FeedItem, type FeedQuery, type PublicDemandeView, type SignPhotoInput, type SignPhotoResponse, type UpdateDemandeInput } from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DemandesService } from './demandes.service.js';

@Controller('demandes')
export class DemandesController {
  constructor(private readonly demandes: DemandesService) {}

  @Post()
  @HttpCode(201)
  create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createDemandeSchema)) body: CreateDemandeInput,
  ): Promise<DemandeDto> {
    return this.demandes.create(session.user.id, body);
  }

  /**
   * Declared directly after `@Post()` and BEFORE any parameterised route, deliberately.
   *
   * Nest matches in declaration order, so a future `@Post(':id')` added above this line would
   * swallow `photos/sign` and answer it with a NOT_FOUND that looks identical to a real one -
   * this API derives its error envelope from the HTTP status, so a router 404 and a service 404
   * are byte-identical. There is no `@Post(':id')` today; keeping this first is what makes
   * adding one safe.
   */
  @Post('photos/sign')
  @HttpCode(201)
  signPhoto(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(signPhotoSchema)) body: SignPhotoInput,
  ): Promise<SignPhotoResponse> {
    return this.demandes.signPhotoUpload(session.user.id, body);
  }

  @Get('mine')
  listMine(@Session() session: UserSession): Promise<DemandeListItem[]> {
    return this.demandes.listMine(session.user.id);
  }

  @Get('feed')
  feed(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQuery,
  ): Promise<FeedItem[]> {
    return this.demandes.feed(session.user.id, query);
  }

  /**
   * CF4-24. Any signed-in user; read-only, public demandes only. Declared BEFORE the `:id`
   * GET, so the literal `browse` is never read as an id (`demandes-browse.spec.ts` pins it).
   */
  @Get('browse')
  browse(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(browseQuerySchema)) query: BrowseQuery,
  ): Promise<PublicDemandeView[]> {
    return this.demandes.browse(session.user.id, query);
  }

  @Get(':id')
  getOne(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<DemandeDto> {
    return this.demandes.getForViewer(session.user.id, id);
  }

  /**
   * `CF-16`. Declared after the `@Get`s, and the ordering warning on `photos/sign` above does
   * NOT apply to this route: Nest matches per METHOD, so a PATCH on `:id` cannot swallow a
   * POST. Left here rather than moved up so that comment's rule stays readable.
   */
  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDemandeSchema)) body: UpdateDemandeInput,
  ): Promise<DemandeDto> {
    return this.demandes.update(session.user.id, id, body);
  }

  /** `CF-17`. Soft delete. 204, so `api.del` on mobile needs no body handling. */
  @Delete(':id')
  @HttpCode(204)
  remove(@Session() session: UserSession, @Param('id') id: string): Promise<void> {
    return this.demandes.softDelete(session.user.id, id);
  }

  /**
   * CF4-27. Cancel a public demande with live offers, before payment - no approval, unlike
   * a post-payment cancellation request (`cancellations.controller.ts`).
   */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Session() session: UserSession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.demandes.cancel(session.user.id, id);
  }
}
