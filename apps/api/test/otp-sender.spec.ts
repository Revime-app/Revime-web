import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONSOLE_OTP_CODE, __resetOtpSender, otpSender } from '../src/sms/otp.service.js';

describe('otpSender driver selection', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    __resetOtpSender();
  });

  afterEach(() => {
    process.env = { ...saved };
    __resetOtpSender();
  });

  it('defaults to the console driver when SMS_DRIVER is unset', async () => {
    delete process.env.SMS_DRIVER;
    const sender = otpSender();
    const { ref } = await sender.start('+33612345678');

    expect(ref).toMatch(/^console:/);
    expect(await sender.check('+33612345678', CONSOLE_OTP_CODE)).toBe('approved');
    expect(await sender.check('+33612345678', '123456')).toBe('rejected');
  });

  it('stays on the console driver when SMS_DRIVER=twilio but credentials are absent', async () => {
    // Both conditions required, mirroring mailSender(). A driver flag alone must
    // never be enough to start spending money, because a test or staging
    // environment sets real-looking config far more often than real credentials.
    process.env.SMS_DRIVER = 'twilio';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_API_KEY_SECRET;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;

    const { ref } = await otpSender().start('+33612345678');
    expect(ref).toMatch(/^console:/);
  });

  it('stays on the console driver when only some credentials are present', async () => {
    // A half-configured environment is the realistic failure: someone sets the
    // account SID and forgets the key secret. Partial config must not select the
    // paying driver.
    process.env.SMS_DRIVER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    delete process.env.TWILIO_API_KEY_SECRET;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;

    const { ref } = await otpSender().start('+33612345678');
    expect(ref).toMatch(/^console:/);
  });
});
