import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/app-exception.js';

const REFUSED = 'Accès refusé.';

/**
 * A CREDENTIAL, not a fifth feature flag. The roadmap's four-flag paragraph
 * carries per-flag pre-flip conditions, and a fifth would be documentation cost
 * for no safety.
 *
 * Absent secret ⇒ refuse, the same fail-closed shape as every other
 * configuration guard in this codebase. A route that authenticated against an
 * unset variable would be open in exactly the environment nobody configured.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_SECRET;
    const presented = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
      .headers['x-cron-secret'];

    if (!expected || typeof presented !== 'string' || !this.matches(expected, presented)) {
      // The message is deliberately uninformative about WHY the credential failed
      // (missing vs. wrong vs. server-not-configured), so the GitHub Actions log
      // cannot leak whether CRON_SECRET is set on Render. The 403 status is what
      // the tests pin.
      throw new AppException('FORBIDDEN', REFUSED);
    }
    return true;
  }

  /**
   * Digests, not raw strings. `timingSafeEqual` THROWS when the buffers differ in
   * length, so comparing raw values would leak length through an exception and
   * turn a wrong-length guess into a 500. SHA-256 makes both sides 32 bytes.
   */
  private matches(expected: string, presented: string): boolean {
    const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
    return timingSafeEqual(digest(expected), digest(presented));
  }
}
