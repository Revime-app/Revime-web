import twilio from 'twilio';

export type OtpCheckResult = 'approved' | 'rejected' | 'expired' | 'max_attempts';

/** Carries Twilio's own numeric code so the service can map 60410 and 60605 apart. */
export class OtpProviderError extends Error {
  constructor(
    message: string,
    readonly twilioCode: string | undefined,
  ) {
    super(message);
  }
}

export interface OtpSender {
  /** `ip` is passed to Twilio's end_user_ip rate limit bucket. Omitted when unknown. */
  start(phone: string, ip?: string): Promise<{ ref: string }>;
  check(phone: string, code: string): Promise<OtpCheckResult>;
}

/** The only code the console driver accepts. Exported so tests never hardcode it. */
export const CONSOLE_OTP_CODE = '000000';

/**
 * Logs instead of sending, and accepts one fixed code.
 *
 * It deliberately does NOT generate and store a real code. Twilio holds the code
 * on the live path, and adding a column that sometimes holds a live OTP would be
 * a security downgrade accepted for test convenience. Combined with
 * `storeOTP: 'hashed'` on the email half, no recoverable OTP for either channel
 * exists in our database.
 */
class ConsoleOtpSender implements OtpSender {
  async start(phone: string): Promise<{ ref: string }> {
    console.log(`[otp:console] → ${phone} · code ${CONSOLE_OTP_CODE}`);
    return { ref: `console:${phone}` };
  }

  async check(_phone: string, code: string): Promise<OtpCheckResult> {
    return code === CONSOLE_OTP_CODE ? 'approved' : 'rejected';
  }
}

class TwilioOtpSender implements OtpSender {
  // API key SID and secret as the positional pair, with the account SID in opts.
  // Verified against the installed SDK: TwilioSDK(sid?, token?, opts?) and
  // IClientOpts carries accountSid.
  private readonly client = twilio(
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_KEY_SECRET,
    { accountSid: process.env.TWILIO_ACCOUNT_SID },
  );
  private readonly service = process.env.TWILIO_VERIFY_SERVICE_SID!;

  async start(phone: string, ip?: string): Promise<{ ref: string }> {
    try {
      const verification = await this.client.verify.v2
        .services(this.service)
        .verifications.create({
          to: phone,
          channel: 'sms',
          // Server-side buckets, enforced at verification start so a rejected
          // attempt never becomes a billed SMS. The IP key is omitted rather
          // than fed a proxy address: a bucket keyed on a shared address is a
          // global bucket, and would lock out every user at once.
          rateLimits: { phone_number: phone, ...(ip ? { end_user_ip: ip } : {}) },
        });
      return { ref: verification.sid };
    } catch (error) {
      throw asProviderError(error);
    }
  }

  async check(phone: string, code: string): Promise<OtpCheckResult> {
    try {
      const check = await this.client.verify.v2
        .services(this.service)
        .verificationChecks.create({ to: phone, code });
      return check.status === 'approved' ? 'approved' : 'rejected';
    } catch (error) {
      const mapped = asProviderError(error);
      // 60202 max checks and 60203 max sends both mean "this session is spent".
      if (mapped.twilioCode === '60202' || mapped.twilioCode === '60203') return 'max_attempts';
      // 20404 is Twilio's not-found: the session expired out from under us.
      if (mapped.twilioCode === '20404') return 'expired';
      throw mapped;
    }
  }
}

function asProviderError(error: unknown): OtpProviderError {
  const code = (error as { code?: number | string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? 'Twilio Verify error';
  return new OtpProviderError(message, code === undefined ? undefined : String(code));
}

let instance: OtpSender | undefined;

/**
 * Both the driver flag AND every credential are required, mirroring mailSender().
 * The reason is stronger here than for mail: every send is $0.0798 of real money,
 * and the integration suite runs against the production database.
 */
export function otpSender(): OtpSender {
  instance ??=
    process.env.SMS_DRIVER === 'twilio' &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_API_KEY_SID &&
    process.env.TWILIO_API_KEY_SECRET &&
    process.env.TWILIO_VERIFY_SERVICE_SID
      ? new TwilioOtpSender()
      : new ConsoleOtpSender();
  return instance;
}

/** Test-only. The factory memoises, so a test changing SMS_DRIVER must clear it. */
export function __resetOtpSender(): void {
  instance = undefined;
}
