import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';

@Controller('health')
export class HealthController {
  @Get()
  @AllowAnonymous()
  @SkipPlatformGates()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
