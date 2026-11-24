import type { PrismaClient } from '../../generated/prisma/client.js';
import { AdminAlertsService } from '../../admin/admin-alerts.service.js';
import { mailSender } from '../../mail/mail.service.js';
import { AuthThrottle } from './auth-throttle.js';
import { PrismaLockEffects } from './effects.js';
import type { ThrottleDeps } from './hooks.js';
import { PrismaThrottleStore } from './store.js';
import { PrismaDeviceStore } from '../devices/device.js';

export { clearLockAfterPasswordReset, recordCodeFailure, throttleAfter, throttleBefore, UNUSED_EMAIL_OTP_PATHS } from './hooks.js';
export type { LockedAccount, LockEffects, ThrottleDeps } from './hooks.js';
export { AuthThrottle, throttleKey } from './auth-throttle.js';

/** V7 A11 / D3 (U2, U2b). The production lock-out and device tracking: Postgres counters, devices, history, e-mails and alerts. */
export function createAuthThrottleDeps(prisma: PrismaClient): ThrottleDeps {
  return {
    throttle: new AuthThrottle(new PrismaThrottleStore(prisma)),
    effects: new PrismaLockEffects(prisma, mailSender, new AdminAlertsService(prisma as never)),
    devices: new PrismaDeviceStore(prisma),
  };
}
