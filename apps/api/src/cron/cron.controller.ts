import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipPlatformGates } from '../platform/skip-platform-gates.decorator.js';
import type { CronRunResponse } from '@revime/shared';
import { CronSecretGuard } from './cron-secret.guard.js';
import { CronService } from './cron.service.js';

/**
 * Driven by `.github/workflows/reconcile.yml`, not by an in-process scheduler.
 *
 * `@nestjs/schedule` CANNOT fire here: the API is on Render's free plan, which
 * spins down when idle, and it would double-fire if the service were ever scaled
 * past one instance. Render Cron Jobs are a separate paid service type while the
 * workspace sits deliberately at $0. `keepalive.yml` is the working precedent.
 *
 * NOT gated on PAYMENTS_ENABLED: with the flag off there are no PAID commandes,
 * so the jobs find nothing, and gating it would turn the schedule red every six
 * hours for no information. The flag checks live inside the release path instead,
 * so the cron cannot move money in a configuration where money is not supposed
 * to move. See the P5 spec §5.3.
 */
@Controller('internal/cron')
@UseGuards(CronSecretGuard)
export class CronController {
  constructor(private readonly cron: CronService) {}

  /**
   * GitHub Actions schedule. No session, so `@AllowAnonymous` - the shared
   * secret IS the authentication, which is why the route is protected by
   * CronSecretGuard alone. Fails closed when CRON_SECRET is unset.
   */
  @Post('run')
  @HttpCode(200)
  @AllowAnonymous()
  @SkipPlatformGates()
  run(): Promise<CronRunResponse> {
    return this.cron.run();
  }
}
