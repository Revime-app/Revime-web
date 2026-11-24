import { Inject, Injectable, Optional } from '@nestjs/common';
import { isAPIError } from 'better-auth/api';
import {
  PHONE_ALREADY_TAKEN_FR,
  type CheckPhoneVerificationInput,
  type MeResponse,
  type StartPhoneVerificationInput,
  type StartPhoneVerificationResponse,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OtpProviderError, otpSender, type OtpCheckResult } from '../sms/otp.service.js';
import { UsersService } from '../users/users.service.js';
import { promoteToBasicIfEligible } from './promote-basic.js';
import { COOLDOWN_SECONDS, checkLimit, type LimitVerdict } from './rate-limit.js';
import { createAuthThrottleDeps, recordCodeFailure, throttleKey, type ThrottleDeps } from '../auth/throttle/index.js';

/** Nest token for the lock-out, so a spec can hand in an in-memory one. */
export const AUTH_THROTTLE = 'AUTH_THROTTLE';

type Outcome = 'SENT' | 'BLOCKED' | 'FAILED' | 'APPROVED' | 'REJECTED';

/** Verify sessions expire after 10 minutes, so an older SENT row is unusable. */
const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class VerificationService {
  private readonly throttle: ThrottleDeps;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Optional() @Inject(AUTH_THROTTLE) throttle?: ThrottleDeps,
  ) {
    this.throttle = throttle ?? createAuthThrottleDeps(prisma);
  }

  /**
   * Opens a Verify session for a phone this user does not yet hold.
   *
   * `user.phone` is NOT written here, deliberately. Claiming it before the code
   * is approved would let a typo park a stranger's number in a UNIQUE column and
   * make it permanently unclaimable, which is a fresh instance of the wart the
   * identity spec §10 already records for soft-deleted accounts.
   *
   * The duplicate check still runs here, and it runs BEFORE the limiter, so a
   * number that could never be claimed anyway costs neither $0.0798 nor a slot
   * in the caller's own daily budget.
   */
  async startPhone(
    userId: string,
    input: StartPhoneVerificationInput,
    ip?: string,
  ): Promise<StartPhoneVerificationResponse> {
    const phone = input.phone;

    const taken = await this.prisma.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new AppException('CONFLICT', PHONE_ALREADY_TAKEN_FR);
    }

    const verdict = await checkLimit(this.prisma, { userId, phone });
    if (!verdict.allowed) {
      // Recorded even though nothing was sent: a refusal is auditable, and the
      // cooldown rule counts BLOCKED rows, so this row is load-bearing rather
      // than decorative.
      await this.record(userId, phone, 'BLOCKED', { ipAddress: ip });
      throw new AppException('TOO_MANY_REQUESTS', limitMessageFr(verdict));
    }

    try {
      const { ref } = await otpSender().start(phone, ip);
      await this.record(userId, phone, 'SENT', { providerRef: ref, ipAddress: ip });
      return { retryAfterSeconds: COOLDOWN_SECONDS };
    } catch (error) {
      const provider = error instanceof OtpProviderError ? error : undefined;
      await this.record(userId, phone, 'FAILED', {
        errorCode: provider?.twilioCode,
        ipAddress: ip,
      });
      throw toAppException(provider);
    }
  }

  /**
   * Verifies the code and claims the phone.
   *
   * The prior-SENT-row check is not bookkeeping. Without it, `check` is an
   * unbounded free outbound Twilio call driven entirely by unvalidated client
   * input, and it would let someone consume a DIFFERENT user's five check
   * attempts on a number they do not hold.
   */
  async checkPhone(userId: string, input: CheckPhoneVerificationInput): Promise<MeResponse> {
    const { phone, code } = input;

    const pending = await this.prisma.verificationAttempt.findFirst({
      where: {
        userId,
        target: phone,
        channel: 'SMS',
        outcome: 'SENT',
        createdAt: { gte: new Date(Date.now() - SESSION_TTL_MS) },
      },
      select: { id: true },
    });
    if (!pending) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'Aucun code en attente pour ce numéro. Demandez un nouveau code.',
      );
    }

    // V7 A11 (U2, Q5): wrong SMS codes share the code ladder with wrong e-mail codes. Checked
    // before Twilio, so a locked account spends nothing and learns nothing.
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    const codeKey = account ? throttleKey(account.email) : null;
    if (codeKey) await asAppException(() => this.throttle.throttle.assertOpen('CODE_ACCOUNT', codeKey));

    let result: OtpCheckResult;
    try {
      result = await otpSender().check(phone, code);
    } catch (error) {
      const provider = error instanceof OtpProviderError ? error : undefined;
      await this.record(userId, phone, 'FAILED', { errorCode: provider?.twilioCode });
      throw toAppException(provider);
    }

    if (result !== 'approved') {
      await this.record(userId, phone, 'REJECTED');
      if (result === 'rejected' && account) {
        // The SMS check is authenticated, so the account is the key and the IP adds nothing.
        const lock = await recordCodeFailure(this.throttle, { email: account.email, user: account, ip: null });
        if (lock) throw new AppException('TOO_MANY_REQUESTS', lock.message);
      }
      throw new AppException('UNPROCESSABLE_ENTITY', rejectionMessageFr(result));
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phone, phoneVerifiedAt: new Date() },
      });
    } catch (error) {
      // P2002: another account claimed this number between the pre-check in
      // startPhone and now. Answer the same way the pre-check does rather than
      // leaking an unmapped 500. Same pattern offers.service.ts uses for its own
      // create race.
      if ((error as { code?: string } | null)?.code === 'P2002') {
        await this.record(userId, phone, 'FAILED', { errorCode: 'P2002' });
        throw new AppException('CONFLICT', PHONE_ALREADY_TAKEN_FR);
      }
      throw error;
    }

    await this.record(userId, phone, 'APPROVED');
    await promoteToBasicIfEligible(this.prisma, userId);

    return this.users.me(userId);
  }

  private record(
    userId: string,
    target: string,
    outcome: Outcome,
    extra: { providerRef?: string; errorCode?: string; ipAddress?: string } = {},
  ): Promise<unknown> {
    return this.prisma.verificationAttempt.create({
      data: {
        userId,
        target,
        channel: 'SMS',
        outcome,
        providerRef: extra.providerRef ?? null,
        errorCode: extra.errorCode ?? null,
        ipAddress: extra.ipAddress ?? null,
      },
    });
  }
}

/** The lock-out speaks Better Auth's APIError; a Nest route answers with our AppException. */
async function asAppException(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (isAPIError(err) && err.statusCode === 429) throw new AppException('TOO_MANY_REQUESTS', err.message);
    throw err;
  }
}

function limitMessageFr(verdict: Extract<LimitVerdict, { allowed: false }>): string {
  if (verdict.reason === 'cooldown') {
    return `Trop de tentatives. Réessayez dans ${verdict.retryAfterSeconds} secondes.`;
  }
  return "Vous avez atteint la limite de codes pour aujourd'hui. Réessayez demain.";
}

function rejectionMessageFr(result: Exclude<OtpCheckResult, 'approved'>): string {
  switch (result) {
    case 'expired':
      return 'Ce code a expiré. Demandez un nouveau code.';
    case 'max_attempts':
      return 'Trop de tentatives pour ce code. Demandez un nouveau code.';
    default:
      return 'Code incorrect. Vérifiez le code reçu par SMS.';
  }
}

/**
 * Twilio's codes mean opposite things to a user, so they must not collapse into
 * one message.
 */
function toAppException(provider: OtpProviderError | undefined): AppException {
  switch (provider?.twilioCode) {
    case '60203':
    case '60202':
      return new AppException(
        'TOO_MANY_REQUESTS',
        'Trop de tentatives pour ce numéro. Réessayez dans quelques minutes.',
      );
    case '60410':
      // Fraud Guard. "Try again" is wrong advice: retrying reinforces the
      // pattern, so the message must not invite it.
      return new AppException(
        'UNPROCESSABLE_ENTITY',
        'Nous ne pouvons pas vérifier ce numéro pour le moment. Contactez-nous pour activer votre compte.',
      );
    case '60605':
      // Geo permissions: our configuration is wrong, not the user's input, and
      // retrying never helps. INTERNAL also makes the filter log it.
      return new AppException(
        'INTERNAL',
        'La vérification par SMS est momentanément indisponible. Merci de réessayer plus tard.',
      );
    default:
      return new AppException('INTERNAL', 'Envoi du code impossible. Merci de réessayer plus tard.');
  }
}
