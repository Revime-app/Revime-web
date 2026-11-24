import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  createOfferSchema,
  type CreateOfferInput,
  type OfferDto,
  type OfferListItem,
  type ReceivedOfferListItem,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OffersService } from './offers.service.js';

@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('demandes/:id/offers')
  @HttpCode(201)
  create(
    @Session() session: UserSession,
    @Param('id') demandeId: string,
    @Body(new ZodValidationPipe(createOfferSchema)) body: CreateOfferInput,
  ): Promise<OfferDto> {
    return this.offers.create(session.user.id, demandeId, body);
  }

  @Get('offers/mine')
  listMine(@Session() session: UserSession): Promise<OfferListItem[]> {
    return this.offers.listMine(session.user.id);
  }

  /**
   * `CF-11`. The client's side of `offers/mine`.
   *
   * Both literal paths are declared before the `offers/:id` route below, which is the ordering
   * Nest requires: a `:id` route registered first would match `received` as an id.
   */
  @Get('offers/received')
  listReceived(@Session() session: UserSession): Promise<ReceivedOfferListItem[]> {
    return this.offers.listReceived(session.user.id);
  }

  @Get('demandes/:id/offers')
  listForDemande(
    @Session() session: UserSession,
    @Param('id') demandeId: string,
  ): Promise<OfferDto[]> {
    return this.offers.listForDemande(session.user.id, demandeId);
  }

  @Delete('offers/:id')
  @HttpCode(204)
  withdraw(@Session() session: UserSession, @Param('id') offerId: string): Promise<void> {
    return this.offers.withdraw(session.user.id, offerId);
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  decline(@Session() session: UserSession, @Param('id') offerId: string): Promise<{ ok: true }> {
    return this.offers.decline(session.user.id, offerId);
  }
}
