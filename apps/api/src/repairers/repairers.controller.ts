import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  directoryQuerySchema,
  type DirectoryCardDto,
  type DirectoryQuery,
  type RepairerDashboardDto,
  type RepairerProfileDto,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RepairerDashboardService } from './repairer-dashboard.service.js';
import { RepairersService } from './repairers.service.js';

/**
 * `@Controller()` with full paths, matching `ReviewsController`, because `repairers` is
 * deliberately not a Prisma model name: the resource is a person's public reputation
 * rather than a `RepairerProfile` row.
 *
 * 🛑 **The `repairers/*` URL space is SPLIT across two modules on purpose.**
 * `GET /repairers/:userId/reviews` stays in `reviews/`, because it is about reviews and
 * its tests live with them. They differ in segment count, so neither can shadow the
 * other.
 *
 * That last sentence is not only reasoning: `repairers.int.spec.ts`'s « coexists with the
 * reviews route on the same URL prefix » drives BOTH paths in one run, because "different
 * segment counts cannot shadow" is a claim about Nest's router and not something to take
 * on faith.
 *
 * Behind the session guard like everything else. "Public" here means every signed-in
 * user, not anonymous: no route in this API is anonymous except health and the
 * webhooks, and making this the first one is a decision nothing has asked for.
 */
@Controller()
export class RepairersController {
  constructor(
    private readonly repairers: RepairersService,
    private readonly dashboardService: RepairerDashboardService,
  ) {}

  @Get('repairers')
  list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(directoryQuerySchema)) query: DirectoryQuery,
  ): Promise<DirectoryCardDto[]> {
    return this.repairers.list(session.user.id, query);
  }

  /**
   * CF4-22/23/26 (sub-project G). His own Tableau de bord « À faire » and « Activité
   * récente ». Declared BEFORE `repairers/:userId` so the literal `me` is never read as an
   * id, whatever the segment counts; `repairers-module-graph.spec.ts` pins the order.
   * A read: no `@Audit`.
   */
  @Get('repairers/me/dashboard')
  dashboard(@Session() session: UserSession): Promise<RepairerDashboardDto> {
    return this.dashboardService.get(session.user.id);
  }

  /**
   * CF5-15: Stamp when the réparateur opened/inspected the Tableau de bord panel,
   * dismissing the home notification count pill until newer actions arrive.
   */
  @Post('repairers/me/dashboard-seen')
  async markDashboardSeen(@Session() session: UserSession): Promise<{ ok: true }> {
    await this.dashboardService.markSeen(session.user.id);
    return { ok: true };
  }

  /**
   * Deliberately AFTER `list` in this file. Nest matches in declaration order, and while
   * `repairers` and `repairers/:userId` differ in segment count and cannot shadow each
   * other, `demandes.controller.ts` puts `@Get('feed')` before `@Get(':id')` for exactly
   * this reason and the convention is worth keeping visible.
   *
   * Takes no session parameter: unlike `list`, this route does not exclude the caller, so
   * there is nothing to derive from who is asking. The session guard still applies.
   */
  @Get('repairers/:userId')
  getOne(
    @Session() session: UserSession,
    @Param('userId') userId: string,
  ): Promise<RepairerProfileDto> {
    // PUB-33 (DECP-23): the viewer is passed for the store-review seal only.
    return this.repairers.getPublicProfile(userId, session.user.id);
  }
}
