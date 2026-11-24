import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, forwardRef } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  advanceStepSchema,
  commandeListQuerySchema,
  shippingAddressSchema,
  type AdvanceStepInput,
  type CommandeDto,
  type CommandeListItem,
  type CommandeListQuery,
  type ShippingAddressInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ShipmentsService } from '../shipping/shipments.service.js';
import { CommandesService } from './commandes.service.js';

@Controller()
export class CommandesController {
  constructor(
    private readonly commandes: CommandesService,
    // Livraison Boxtal. forwardRef because ShipmentsService itself depends on CommandesService.
    @Inject(forwardRef(() => ShipmentsService)) private readonly shipments: ShipmentsService,
  ) {}

  @Get('commandes')
  list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(commandeListQuerySchema)) query: CommandeListQuery,
  ): Promise<CommandeListItem[]> {
    return this.commandes.list(session.user.id, query);
  }

  @Get('commandes/:id')
  async findOne(@Session() session: UserSession, @Param('id') id: string): Promise<CommandeDto> {
    // Livraison Boxtal (spec §8.4): a missed label webhook is recovered the moment someone looks.
    await this.shipments.pollLabelsOnRead(id);
    return this.commandes.findOne(session.user.id, id);
  }

  @Post('commandes/:id/steps')
  @HttpCode(200)
  async advance(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(advanceStepSchema)) body: AdvanceStepInput,
  ): Promise<CommandeDto> {
    await this.commandes.advance(session.user.id, id, body);
    // Livraison Boxtal (spec §8.2): « réparation terminée » buys the return label. AFTER the
    // step write, never inside it; never throws (Task 13).
    await this.shipments.afterStepClaim(id, body.step);
    return this.commandes.findOne(session.user.id, id);
  }

  @Post('commandes/:id/release')
  @HttpCode(200)
  release(@Session() session: UserSession, @Param('id') id: string): Promise<CommandeDto> {
    return this.commandes.release(session.user.id, id);
  }

  @Patch('commandes/:id/shipping-address')
  async submitShippingAddress(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shippingAddressSchema)) body: ShippingAddressInput,
  ): Promise<CommandeDto> {
    await this.commandes.submitShippingAddress(session.user.id, id, body);
    // Livraison Boxtal (spec §8.1). AFTER the write, never inside it: the address is saved whether
    // or not Boxtal answers. Never throws (Task 13).
    await this.shipments.afterAddressWrite(id);
    return this.commandes.findOne(session.user.id, id);
  }
}
