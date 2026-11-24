import type { VerificationOutcome } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Between two sends. Makes burning a whole session take 4 minutes, not 4 seconds. */
export const COOLDOWN_SECONDS = 60;

/**
 * Chosen so one account's worst case is exactly one worst-case Verify session:
 * 5 × $0.0798 = $0.40 per account per day.
 */
export const MAX_SENDS_PER_USER_PER_DAY = 5;

/**
 * Deliberately DOUBLE the per-user cap, and equal would be a defect. At 5 this
 * becomes a weapon: one hostile account burns a stranger's number for the day
 * and the real owner cannot verify their own phone. At 10 one hostile account
 * cannot lock a number out, while three still cannot flood it.
 */
export const MAX_SENDS_PER_PHONE_PER_DAY = 10;

const DAY_SECONDS = 86_400;

export type LimitVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'cooldown' | 'user_daily' | 'phone_daily';
      retryAfterSeconds: number;
    };

type PrismaLike = Pick<PrismaService, 'verificationAttempt'>;

/**
 * Every window is trailing, never calendar. A calendar day would introduce a
 * timezone question this codebase does not otherwise have, and hand an attacker
 * a free refill at midnight.
 *
 * The two rules count DIFFERENT rows, and a single rule cannot serve both:
 *
 * - The cooldown counts every row regardless of outcome. Otherwise someone whose
 *   sends are all being blocked can hammer the endpoint indefinitely for free.
 * - The daily caps count only SENT, which is the outcome that cost money.
 *   Otherwise a Fraud-Guard block consumes the victim's own budget, which gives
 *   an attacker amplification: cause blocks, exhaust the quota.
 *
 * Scoped to `channel: 'SMS'` throughout. EMAIL rows exist for the audit trail
 * only: emailOTP enforces its own rate limit and email costs nothing, so reading
 * them here would only add a way to lock a user out with nothing saved.
 */
export async function checkLimit(
  prisma: PrismaLike,
  args: { userId: string; phone: string },
): Promise<LimitVerdict> {
  const now = Date.now();
  const cooldownSince = new Date(now - COOLDOWN_SECONDS * 1000);
  const daySince = new Date(now - DAY_SECONDS * 1000);

  const latest = await prisma.verificationAttempt.findFirst({
    where: { userId: args.userId, channel: 'SMS', createdAt: { gte: cooldownSince } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latest) {
    const elapsed = Math.floor((now - latest.createdAt.getTime()) / 1000);
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.max(1, COOLDOWN_SECONDS - elapsed),
    };
  }

  const [userSends, phoneSends] = await Promise.all([
    prisma.verificationAttempt.count({
      where: {
        userId: args.userId,
        channel: 'SMS',
        outcome: 'SENT',
        createdAt: { gte: daySince },
      },
    }),
    prisma.verificationAttempt.count({
      where: {
        target: args.phone,
        channel: 'SMS',
        outcome: 'SENT',
        createdAt: { gte: daySince },
      },
    }),
  ]);

  if (userSends >= MAX_SENDS_PER_USER_PER_DAY) {
    return { allowed: false, reason: 'user_daily', retryAfterSeconds: DAY_SECONDS };
  }
  if (phoneSends >= MAX_SENDS_PER_PHONE_PER_DAY) {
    return { allowed: false, reason: 'phone_daily', retryAfterSeconds: DAY_SECONDS };
  }
  return { allowed: true };
}

/**
 * A registry lookup costs nothing, so this is an ABUSE cap and not a spend cap. Ten a
 * day is far above any honest use - one verification needs one - and low enough that
 * enumerating SIRENs through this route buys nothing.
 */
export const MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY = 10;

/**
 * Deliberately DOUBLE the per-user cap, and equal would be the defect. This is
 * MAX_SENDS_PER_PHONE_PER_DAY's reasoning applied to a company: at parity, one hostile
 * account could spend a real company's whole daily budget and stop its owner ever
 * verifying it. At double, one account cannot lock a SIREN out while several still
 * cannot flood the registry.
 */
export const MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY = 20;

export type RegistryLimitVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'user_daily' | 'siren_daily';
      retryAfterSeconds: number;
    };

/**
 * The outcomes that mean a lookup REACHED the registry, and therefore consumed one.
 *
 * `SENT` is deliberately absent and always will be: it means "dispatched, and
 * therefore billed", and a registry lookup is neither. `BLOCKED` is absent for
 * `checkLimit`'s amplification reason - a refusal must not consume the budget of the
 * account, or of the company, it was aimed at.
 *
 * Annotated with Prisma's generated enum type, which is what lets it live here rather
 * than being repeated inside each filter: an un-annotated array infers `string[]` and
 * an `as const` one infers a readonly tuple, and the generated filter rejects both.
 */
const REACHED_THE_REGISTRY: VerificationOutcome[] = ['APPROVED', 'REJECTED', 'FAILED'];

/**
 * The registry channel's own limiter, and NOT a reuse of `checkLimit`.
 *
 * Two differences, both load-bearing. **There is no cooldown:** a mistyped number is
 * refused locally by the Luhn check with no call and no row, so a cooldown would only
 * punish the honest correction path. And it counts every row that REACHED the registry
 * rather than `outcome: 'SENT'` - nothing is dispatched and nothing is billed on this
 * channel, so SENT is never written for it and counting SENT would count zero forever.
 *
 * BLOCKED is excluded for `checkLimit`'s amplification reason: a refusal must not
 * consume the budget of the account, or of the company, it was aimed at.
 */
export async function checkRegistryLimit(
  prisma: PrismaLike,
  args: { userId: string; siren: string },
): Promise<RegistryLimitVerdict> {
  const daySince = new Date(Date.now() - DAY_SECONDS * 1000);

  const [userLookups, sirenLookups] = await Promise.all([
    prisma.verificationAttempt.count({
      where: {
        userId: args.userId,
        channel: 'REGISTRY',
        outcome: { in: REACHED_THE_REGISTRY },
        createdAt: { gte: daySince },
      },
    }),
    prisma.verificationAttempt.count({
      where: {
        target: args.siren,
        channel: 'REGISTRY',
        outcome: { in: REACHED_THE_REGISTRY },
        createdAt: { gte: daySince },
      },
    }),
  ]);

  if (userLookups >= MAX_REGISTRY_LOOKUPS_PER_USER_PER_DAY) {
    return { allowed: false, reason: 'user_daily', retryAfterSeconds: DAY_SECONDS };
  }
  if (sirenLookups >= MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY) {
    return { allowed: false, reason: 'siren_daily', retryAfterSeconds: DAY_SECONDS };
  }
  return { allowed: true };
}
