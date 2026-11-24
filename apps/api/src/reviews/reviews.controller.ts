import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { createReviewSchema, type CreateReviewInput, type ReviewDto } from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReviewsService } from './reviews.service.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /**
   * On the commande and not on a top-level `reviews` collection, because the commande is
   * the authority for eligibility (§6.1) and the path already carries the id a body
   * would otherwise have to repeat.
   *
   * No flag guard, and that is a considered asymmetry rather than an omission: a review
   * needs a RELEASED commande, so it is inert by DATA exactly as `BUSINESS` is (§6.4).
   */
  @Post('commandes/:id/review')
  async create(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewInput,
  ): Promise<{ ok: true }> {
    await this.reviews.create(session.user.id, id, body);
    return { ok: true };
  }

  /**
   * 🛑 **The `repairers/*` URL space is SPLIT across two modules on purpose.**
   * `GET /repairers` and `GET /repairers/:userId` live in `repairers/`, because they are
   * about réparateurs. This route stays in `reviews/` because it is about reviews, and
   * its tests live with them. They differ in segment count, so neither can shadow the
   * other.
   *
   * Behind the session guard like everything else: "public" here means every signed-in
   * user, not anonymous. No route in this API is anonymous except health and the webhooks,
   * and making this the first one is a decision nothing has asked for.
   */
  @Get('repairers/:userId/reviews')
  list(@Param('userId') userId: string): Promise<ReviewDto[]> {
    return this.reviews.listForRepairer(userId);
  }
}
