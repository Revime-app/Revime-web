import { SetMetadata } from '@nestjs/common';

export const SKIP_PLATFORM_GATES = 'skipPlatformGates';

/**
 * V7 D5 (U9, `DEC7-24`). A route the maintenance guard never refuses: webhooks (Stripe, Boxtal),
 * the cron run, `/health`, the public status read, the « Ce n'est pas moi » page and the browser
 * return pages that only bounce back to the app. Put it on the line right after `@AllowAnonymous()`:
 * `test/v7-u9-maintenance.spec.ts` fails on any anonymous route that is neither exempt nor listed
 * there as blocked.
 */
export const SkipPlatformGates = () => SetMetadata(SKIP_PLATFORM_GATES, true);
