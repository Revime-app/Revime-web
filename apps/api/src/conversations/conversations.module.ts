import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BlocksController } from './blocks.controller.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { ModerationService } from './moderation.service.js';

// `imports` is REQUIRED, not tidying: a missing PrismaModule is a DI failure the
// typechecker cannot see. That defect shipped once in CommandesModule and was caught
// only by running the controller.
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ConversationsController, BlocksController],
  providers: [ConversationsService, ModerationService],
  exports: [ConversationsService, ModerationService],
})
export class ConversationsModule {}
