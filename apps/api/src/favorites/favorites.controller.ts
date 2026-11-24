import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { FavoriteDemandeItem, RepairerCardDto } from '@revime/shared';
import { FavoritesService } from './favorites.service.js';

/**
 * `CF-18` / `CF-19` / `CF-20` / `CF-27`.
 *
 * 🛑 `PUT` RATHER THAN `POST`, AND IDEMPOTENT RATHER THAN 409. The caller is a heart being
 * tapped, possibly twice. A unique-constraint violation surfacing as a 500 on the second tap
 * is the failure this choice removes, and `PUT` is the verb that says so.
 *
 * No request bodies anywhere: the resource identity is entirely in the path, so there is
 * nothing to validate and no `ZodValidationPipe`.
 *
 * Route ORDER: the two collection `@Get`s are declared before nothing that could shadow them
 * - `favorites/repairers` and `favorites/repairers/:userId` differ in segment count and
 * cannot collide. Declared collection-first anyway, matching `demandes.controller.ts`'s
 * convention.
 */
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('repairers')
  listRepairers(@Session() session: UserSession): Promise<RepairerCardDto[]> {
    return this.favorites.listRepairers(session.user.id);
  }

  @Get('demandes')
  listDemandes(@Session() session: UserSession): Promise<FavoriteDemandeItem[]> {
    return this.favorites.listDemandes(session.user.id);
  }

  @Put('repairers/:userId')
  @HttpCode(204)
  addRepairer(
    @Session() session: UserSession,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.favorites.addRepairer(session.user.id, userId);
  }

  @Delete('repairers/:userId')
  @HttpCode(204)
  removeRepairer(
    @Session() session: UserSession,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.favorites.removeRepairer(session.user.id, userId);
  }

  @Put('demandes/:id')
  @HttpCode(204)
  addDemande(@Session() session: UserSession, @Param('id') id: string): Promise<void> {
    return this.favorites.addDemande(session.user.id, id);
  }

  @Delete('demandes/:id')
  @HttpCode(204)
  removeDemande(@Session() session: UserSession, @Param('id') id: string): Promise<void> {
    return this.favorites.removeDemande(session.user.id, id);
  }
}
