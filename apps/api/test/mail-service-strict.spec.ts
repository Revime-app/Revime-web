import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

import { __setMailSender, mailSender } from '../src/mail/mail.service.js';

/**
 * RU-28 / CMP-D4. The Resend SDK RETURNS an API refusal as `{ error }` and throws only on a network
 * failure, so a sender that only had a try/catch reported every refused email as sent. The annual DAC7
 * recap records « SENT » as a fact, so it asks for `strict` delivery.
 */
describe('mailSender (Resend driver)', () => {
  const mail = { to: 'r@example.com', subject: 'Sujet', text: 'Texte' };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.MAIL_DRIVER = 'resend';
    process.env.RESEND_API_KEY = 're_test';
    __setMailSender(undefined);
    send.mockReset();
  });

  afterEach(() => {
    delete process.env.MAIL_DRIVER;
    delete process.env.RESEND_API_KEY;
    __setMailSender(undefined);
    vi.restoreAllMocks();
  });

  it('resolves when the provider accepts the message', async () => {
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null });

    await expect(mailSender().send(mail, { strict: true })).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'r@example.com', subject: 'Sujet' }));
  });

  it('rejects in strict mode when the provider RETURNS a refusal', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 } });

    await expect(mailSender().send(mail, { strict: true })).rejects.toThrow('validation_error: Invalid `to` field');
  });

  it('rejects in strict mode on a network failure', async () => {
    send.mockRejectedValue(new Error('socket hang up'));

    await expect(mailSender().send(mail, { strict: true })).rejects.toThrow('socket hang up');
  });

  it('stays best effort without strict: a refusal or a network failure is logged, never thrown', async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', message: 'Slow down', statusCode: 429 } });
    await expect(mailSender().send(mail)).resolves.toBeUndefined();

    send.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(mailSender().send(mail)).resolves.toBeUndefined();

    // A refusal used to pass in silence; it is now at least in the log.
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
