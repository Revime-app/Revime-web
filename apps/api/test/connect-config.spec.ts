import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isConnectEnabled } from '../src/connect/config.js';

const KEYS = [
  'CONNECT_ENABLED',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
] as const;

/** The full configuration that SHOULD report enabled, so each test removes one thing. */
function enable(): void {
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'https://api.example.test';
}

function clear(): void {
  for (const k of KEYS) delete process.env[k];
}

describe('isConnectEnabled', () => {
  // beforeEach as well as afterEach, and the beforeEach is the load-bearing one.
  // vitest.config.ts loads `.env` through `setupFiles: ['dotenv/config']`, so a
  // developer whose local .env enables Connect starts the FIRST test with all
  // five keys already set -- which made "FALSE with nothing set" pass in CI
  // (no .env there) and fail on the only machines that run it by hand.
  beforeEach(clear);
  afterEach(clear);

  it('is FALSE with nothing set, which is THE production configuration today', () => {
    expect(isConnectEnabled()).toBe(false);
  });

  it('is true with the flag and both required values', () => {
    enable();
    expect(isConnectEnabled()).toBe(true);
  });

  it.each(['1', 'yes', 'TRUE', '', 'false'])(
    'fails safe to off when the flag reads %j rather than the literal "true"',
    (value) => {
      enable();
      process.env.CONNECT_ENABLED = value;
      expect(isConnectEnabled()).toBe(false);
    },
  );

  it('is false without a webhook secret, because onboarding we cannot confirm is worse than none', () => {
    enable();
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    expect(isConnectEnabled()).toBe(false);
  });

  it('is false without PUBLIC_API_URL, because return and refresh URLs must be absolute', () => {
    enable();
    delete process.env.PUBLIC_API_URL;
    expect(isConnectEnabled()).toBe(false);
  });

  it('is false when the real driver is named with no secret key', () => {
    enable();
    process.env.STRIPE_DRIVER = 'stripe';
    expect(isConnectEnabled()).toBe(false);
  });

  it('is false when a secret key sits beside a non-Stripe driver, which is a contradiction', () => {
    enable();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(isConnectEnabled()).toBe(false);
  });
});
