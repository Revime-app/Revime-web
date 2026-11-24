import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import { shippingQuoteRequestSchema, type ParcelPointDto, type ShippingQuoteDto, type ShippingQuoteRequest } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ShipmentsService } from './shipments.service.js';
import { ShippingQuotesService } from './shipping-quotes.service.js';

@Controller()
export class ShippingController {
  constructor(
    private readonly quotes: ShippingQuotesService,
    private readonly shipments: ShipmentsService,
  ) {}

  /** Spec §7.1. POST rather than GET: the body is a parcel, and the call persists a quote. */
  @Post('offers/:id/shipping-quote')
  @HttpCode(200)
  quote(
    @Session() session: UserSession,
    @Param('id') offerId: string,
    @Body(new ZodValidationPipe(shippingQuoteRequestSchema)) body: ShippingQuoteRequest,
  ): Promise<ShippingQuoteDto> {
    return this.quotes.quote(session.user.id, offerId, body);
  }

  /** Spec §7.5. Relay points around the caller's own address by default, or the postal code he passes. */
  @Get('commandes/:id/parcel-points')
  parcelPoints(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Query('postalCode') postalCode?: string,
    @Query('city') city?: string,
  ): Promise<ParcelPointDto[]> {
    return this.shipments.parcelPointsFor(session.user.id, id, { postalCode, city });
  }

  /** Spec §7.6. A short-lived signed URL to the stored label PDF, for the leg's sender only. */
  @Get('commandes/:id/label')
  label(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Query('leg') leg: string,
  ): Promise<{ url: string }> {
    if (leg !== 'OUTBOUND' && leg !== 'RETURN') throw new AppException('VALIDATION_FAILED', 'Étape invalide.');
    return this.shipments.labelUrlFor(session.user.id, id, leg);
  }

  /**
   * Boxtal's endpoint (spec §7.7). No session; the HMAC signature IS the authentication. The body
   * arrives RAW because `configure-app.ts` lists this path - a JSON-parsed body would fail every
   * signature. Answers 200 on processed, duplicate and unknown-shipment alike; 400 on a bad
   * signature; 404 while quoting is off.
   */
  @Post('shipping/webhook')
  @HttpCode(200)
  @AllowAnonymous()
  @SkipPlatformGates()
  async webhook(@Req() req: { body: Buffer }, @Headers('x-bxt-signature') signature: string | undefined): Promise<{ ok: true }> {
    await this.shipments.handleWebhook(req.body, signature);
    return { ok: true };
  }
}
