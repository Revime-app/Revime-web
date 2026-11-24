import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  notificationQuerySchema,
  registerPushTokenSchema,
  unregisterPushTokenSchema,
  type NotificationDto,
  type NotificationQuery,
  type RegisterPushTokenInput,
  type UnregisterPushTokenInput,
} from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BadgeService } from '../push/badge.service.js';
import { PushService } from '../push/push.service.js';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly badgeService: BadgeService,
  ) {}

  /**
   * `CF4-35`. Returns the server-computed app icon badge count for the session user.
   */
  @Get('me/badge')
  badge(@Session() session: UserSession): Promise<{ count: number }> {
    return this.badgeService.countFor(session.user.id).then((count) => ({ count }));
  }

  @Get('notifications')
  list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(notificationQuerySchema))
    query: NotificationQuery,
  ): Promise<NotificationDto[]> {
    return this.notifications.list(session.user.id, query.mode);
  }

  /**
   * Separate from the list, and cheaply so: the bell lives on Accueil, which never loads
   * the list, and pulling 50 rows to render a dot would be the wrong trade on a free-plan
   * service. One `count()`.
   *
   * Declared BEFORE nothing that could shadow it - there is no `GET notifications/:id`
   * route in this controller, so `unread-count` cannot be mistaken for an id.
   */
  @Get('notifications/unread-count')
  unreadCount(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(notificationQuerySchema))
    query: NotificationQuery,
  ): Promise<{ count: number }> {
    return this.notifications
      .unreadCount(session.user.id, query.mode)
      .then((count) => ({ count }));
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  markRead(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notifications.markRead(session.user.id, id);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  markAllRead(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(notificationQuerySchema))
    query: NotificationQuery,
  ): Promise<void> {
    return this.notifications.markAllRead(session.user.id, query.mode);
  }

  /**
   * `CF-44`. Registers this device's Expo push token for the caller. A PUT because it is
   * idempotent: the app calls it on every cold start. Spec §7.
   */
  @Put('notifications/push-token')
  @HttpCode(204)
  registerPushToken(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(registerPushTokenSchema))
    body: RegisterPushTokenInput,
  ): Promise<void> {
    return this.push.register(session.user.id, body);
  }

  /**
   * A body rather than a path segment, because `ExponentPushToken[…]` carries brackets and
   * the mobile `api.del` helper takes no body. Called best-effort at sign-out (step 0).
   */
  @Post('notifications/push-token/unregister')
  @HttpCode(204)
  unregisterPushToken(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(unregisterPushTokenSchema))
    body: UnregisterPushTokenInput,
  ): Promise<void> {
    return this.push.unregister(session.user.id, body.token);
  }
}
