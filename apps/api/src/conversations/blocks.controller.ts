import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { createBlockSchema, type CreateBlockInput } from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ModerationService } from './moderation.service.js';

/**
 * A controller of its own rather than two more routes on `ConversationsController`:
 * a block is keyed on the USER, not nested under a conversation, so `/blocks` is a
 * sibling collection. Neither route reads `MESSAGING_ENABLED` - spec §8.1a.
 */
@Controller()
export class BlocksController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('blocks')
  @HttpCode(201)
  async block(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createBlockSchema)) body: CreateBlockInput,
  ): Promise<{ ok: true }> {
    await this.moderation.block(session.user.id, body);
    return { ok: true };
  }

  /** 204, matching `withdraw`'s shape: there is nothing to return about an absent row. */
  @Delete('blocks/:userId')
  @HttpCode(204)
  unblock(@Session() session: UserSession, @Param('userId') targetUserId: string): Promise<void> {
    return this.moderation.unblock(session.user.id, targetUserId);
  }
}
