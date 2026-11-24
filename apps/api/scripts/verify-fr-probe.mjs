// apps/api/scripts/verify-fr-probe.mjs
//
// Proves that OUR OWN code delivers a Verify SMS to a French number, which is the
// one thing `CF-03` still owes. Run it, then read the code off the handset and run
// the `check` half.
//
// It imports the COMPILED `dist/sms/otp.service.js` deliberately. A hand-rolled
// `twilio` call would prove that Twilio works, not that Revime works, and
// PROJECT_ROADMAP.md keeps those two claims apart on purpose.
//
// It deliberately does NOT touch Render, `apps/api/.env` or the database. Nothing
// is persisted: this is a delivery probe, not a verification of any account. So
// `user.phone` is never claimed and no `VerificationAttempt` row is written.
//
// Usage, credentials inline so they never land on disk:
//
//   SMS_DRIVER=twilio \
//   TWILIO_ACCOUNT_SID=AC... \
//   TWILIO_API_KEY_SID=SK... \
//   TWILIO_API_KEY_SECRET=... \
//   TWILIO_VERIFY_SERVICE_SID=VA... \
//   node apps/api/scripts/verify-fr-probe.mjs start +33651990642
//
//   ...same env... node apps/api/scripts/verify-fr-probe.mjs check +33651990642 123456

import { otpSender, OtpProviderError } from '../dist/sms/otp.service.js';
import { frPhoneSchema } from '../../../packages/shared/dist/phone.schemas.js';

const REQUIRED = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_VERIFY_SERVICE_SID',
];

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * The load-bearing guard, and the reason this script is not three lines.
 *
 * `otpSender()` needs SMS_DRIVER=twilio AND all four credentials. If any one is
 * absent it returns `ConsoleOtpSender`, which logs a line, sends NO SMS and
 * answers `{ ref: 'console:<phone>' }` — a fake success that looks exactly like a
 * real one. The live database already holds one such row that was mistaken for a
 * French delivery proof for 17 days, so this asserts the driver by name rather
 * than trusting the environment.
 */
function assertTwilioDriver() {
  if (process.env.SMS_DRIVER !== 'twilio') {
    die(`SMS_DRIVER is ${JSON.stringify(process.env.SMS_DRIVER)}, not "twilio". The console driver sends nothing.`);
  }
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    die(`Missing credential(s): ${missing.join(', ')}. The factory would silently fall back to the console driver.`);
  }

  const sender = otpSender();
  const driver = sender.constructor.name;
  if (driver !== 'TwilioOtpSender') {
    die(`otpSender() returned ${driver}, not TwilioOtpSender. Nothing would be sent.`);
  }
  console.log(`✓ driver is ${driver}`);
  return sender;
}

function parsePhone(raw) {
  const parsed = frPhoneSchema.safeParse(raw ?? '');
  if (!parsed.success) die(`${JSON.stringify(raw)} is not a French mobile: ${parsed.error.issues[0].message}`);
  return parsed.data;
}

function reportProviderError(error) {
  if (error instanceof OtpProviderError) {
    console.error(`\n✗ Twilio refused. code=${error.twilioCode ?? '(none)'} message=${error.message}`);
    console.error(`  Look it up: https://www.twilio.com/docs/api/errors/${error.twilioCode ?? ''}`);
    console.error('  21608 = trial account, destination not a verified recipient.');
    console.error('  60605 = blocked by Verify geo permissions. 60410 = blocked by Fraud Guard.\n');
    process.exit(1);
  }
  throw error;
}

const [command, rawPhone, code] = process.argv.slice(2);

if (command !== 'start' && command !== 'check') {
  die('Usage: verify-fr-probe.mjs start <+33...>  |  verify-fr-probe.mjs check <+33...> <code>');
}

const sender = assertTwilioDriver();
const phone = parsePhone(rawPhone);
console.log(`✓ target normalises to ${phone}`);

if (command === 'start') {
  // No `ip` argument, on purpose. In production `req.ip` resolves to a Render
  // internal address, and feeding that to Twilio's `end_user_ip` bucket makes one
  // global bucket for every user. Omitting it keeps this probe out of that bucket
  // and keeps the result about DELIVERY only.
  try {
    const { ref } = await sender.start(phone);
    console.log(`\n✓ Twilio ACCEPTED the request. verification sid = ${ref}`);
    console.log('  An SMS is on its way. Read the code off the handset, then run:');
    console.log(`  node apps/api/scripts/verify-fr-probe.mjs check ${phone} <code>\n`);
  } catch (error) {
    reportProviderError(error);
  }
} else {
  if (!code) die('check needs the code from the SMS.');
  try {
    const result = await sender.check(phone, code);
    if (result === 'approved') {
      console.log('\n✓✓ APPROVED. A real SMS reached a real +33 number through our own code.');
      console.log('   That is the proof CF-03 has been waiting for.\n');
    } else {
      console.error(`\n✗ Twilio answered "${result}", not "approved".\n`);
      process.exit(1);
    }
  } catch (error) {
    reportProviderError(error);
  }
}
