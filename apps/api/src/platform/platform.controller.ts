import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { PlatformStatus } from '@revime/shared';
import { PlatformStatusService } from './platform-status.service.js';
import { SkipPlatformGates } from './skip-platform-gates.decorator.js';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformStatusService) {}

  /**
   * V7 D5 (U9). Read by the app at launch, on return to the foreground and on a timer, signed in or
   * not, so it can show its maintenance screen. Never refused, or the screen could never lift.
   */
  @Get('status')
  @AllowAnonymous()
  @SkipPlatformGates()
  status(): Promise<PlatformStatus> {
    return this.platform.read();
  }
}
