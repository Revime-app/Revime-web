import { Resend } from 'resend';
import { isReviewEmail } from '../review-accounts/review-account.js';

export type Mail = { to: string; subject: string; text: string; html?: string };
export interface MailSender {
  /**
   * Best effort by default: a failing verification email must not fail account creation, so a
   * failure is logged and the promise resolves. `strict` is for the caller that records the send as
   * a fact (the DAC7 recap): the promise rejects when the provider refused the message.
   */
  send(mail: Mail, options?: { strict?: boolean }): Promise<void>;
}

class ConsoleMailSender implements MailSender {
  async send(mail: Mail): Promise<void> {
    console.log(`[mail:console] → ${mail.to} · ${mail.subject}\n${mail.text}${mail.html ? `\n[html length: ${mail.html.length}]` : ''}`);
  }
}

class ResendMailSender implements MailSender {
  private readonly client = new Resend(process.env.RESEND_API_KEY);
  async send(mail: Mail, options?: { strict?: boolean }): Promise<void> {
    try {
      // The SDK RETURNS an API refusal (bad recipient, rate limit, unverified domain) as
      // `{ error }` and throws only on a network failure, so the result has to be read.
      const { error } = await this.client.emails.send({
        from: process.env.MAIL_FROM || 'Revime <no-reply@revime.fr>',
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      });
      if (error) throw new Error(`${error.name}: ${error.message}`);
    } catch (error) {
      console.error(
        `[mail:resend] Failed to send email to ${mail.to} with subject "${mail.subject}"`,
        error,
      );
      if (options?.strict) throw error;
    }
  }
}

let instance: MailSender | undefined;

/**
 * PUB-33 (DECP-23): a store-review account is never e-mailed. Its addresses receive no mail, so a send
 * would only bounce and cost Resend sender reputation. Checked here, on the one path every mail takes,
 * around whichever sender is installed (a test's capturing sender included).
 */
const reviewGuarded: MailSender = {
  async send(mail, options) {
    if (isReviewEmail(mail.to)) return;
    return currentSender().send(mail, options);
  },
};

function currentSender(): MailSender {
  instance ??=
    process.env.MAIL_DRIVER === 'resend' && process.env.RESEND_API_KEY
      ? new ResendMailSender()
      : new ConsoleMailSender();
  return instance;
}

export function mailSender(): MailSender {
  return reviewGuarded;
}

/**
 * Test-only. Installs a capturing sender; pass `undefined` to restore the
 * factory's own selection.
 *
 * Needed because `emailOTP` runs with `storeOTP: 'hashed'`, so the code cannot be
 * read back out of the `verification` table - by design, since a test able to
 * recover it would be proving the database still held it. The plaintext OTP is
 * only ever available to the callback that legitimately receives it, and this
 * seam is how a test observes that callback without persisting anything.
 *
 * Mirrors `__resetOtpSender()` in sms/otp.service.ts.
 */
export function __setMailSender(sender: MailSender | undefined): void {
  instance = sender;
}
