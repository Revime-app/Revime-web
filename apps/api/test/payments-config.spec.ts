import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  arePaymentsEnabled,
  assertPaymentAmountAllowed,
  isSafeTestAmountCents,
  isStripeLiveMode,
  isStripeTestMode,
  MAX_LIVE_TEST_AMOUNT_CENTS,
  STRIPE_MIN_EUR_CENTS,
  stripeKeyModesConflict,
} from '../src/payments/config.js';

const KEYS = [
  'PAYMENTS_ENABLED',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
  'STRIPE_LIVE_TEST_ONLY',
] as const;

describe('arePaymentsEnabled', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  /** The state of the live service today: nothing set. */
  it('is off when nothing is configured', () => {
    expect(arePaymentsEnabled()).toBe(false);
  });

  it('is on with the flag, a webhook secret and a public URL, using the fake driver', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    expect(arePaymentsEnabled()).toBe(true);
  });

  it.each(['1', 'TRUE', 'yes', 'false', ''])(
    'treats %o as off, not as on',
    (value) => {
      process.env.PAYMENTS_ENABLED = value;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
      process.env.PUBLIC_API_URL = 'http://localhost:3000';
      expect(arePaymentsEnabled()).toBe(false);
    },
  );

  it('is off without a webhook secret, because a charge we cannot confirm is worse than no charge', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    expect(arePaymentsEnabled()).toBe(false);
  });

  it('is off without PUBLIC_API_URL, because Stripe needs an absolute return URL', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    expect(arePaymentsEnabled()).toBe(false);
  });

  it('is off when the real driver is selected with no secret key', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    process.env.STRIPE_DRIVER = 'stripe';
    // Falling back to the fake here would tell a client his money moved when
    // nothing did. Refusing is the only safe answer.
    expect(arePaymentsEnabled()).toBe(false);
  });

  it('is on when the real driver has its key', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(arePaymentsEnabled()).toBe(true);
  });

  it('is off when a real secret key is present but the driver is not "stripe"', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    process.env.STRIPE_SECRET_KEY = 'sk_live_xyz';
    // No STRIPE_DRIVER set, so it defaults to the fake gateway - the contradiction.
    expect(arePaymentsEnabled()).toBe(false);
  });

  it('is on with the real driver and key explicitly set to stripe', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_abc';
    expect(arePaymentsEnabled()).toBe(true);
  });
});

describe('isStripeTestMode and isStripeLiveMode', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('detects test mode with fake driver', () => {
    process.env.STRIPE_DRIVER = 'fake';
    expect(isStripeTestMode()).toBe(true);
    expect(isStripeLiveMode()).toBe(false);
  });

  it('detects test mode with stripe driver and sk_test key', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_12345';
    expect(isStripeTestMode()).toBe(true);
    expect(isStripeLiveMode()).toBe(false);
  });

  it('detects live mode with stripe driver and sk_live key', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_67890';
    expect(isStripeTestMode()).toBe(false);
    expect(isStripeLiveMode()).toBe(true);
  });

  it('treats unset env as test mode with the fake driver (no key to read)', () => {
    expect(isStripeTestMode()).toBe(true);
    expect(isStripeLiveMode()).toBe(false);
  });

  it('detects a RESTRICTED test key (rk_test_) as test mode, render.yaml allows restricted keys', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'rk_test_12345';
    expect(isStripeTestMode()).toBe(true);
    expect(isStripeLiveMode()).toBe(false);
  });

  it('detects a RESTRICTED live key (rk_live_) as live, so the CF3-17 live-amount guard applies to it', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'rk_live_67890';
    expect(isStripeTestMode()).toBe(false);
    expect(isStripeLiveMode()).toBe(true);
  });

  it('is neither test nor live with the stripe driver and no key, and is not mistaken for test mode', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    expect(isStripeTestMode()).toBe(false);
    expect(isStripeLiveMode()).toBe(false);
  });
});

describe('stripeKeyModesConflict (PRE-4: the live switch is more than one variable)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.STRIPE_DRIVER = 'stripe';
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  // [secret key, publishable key, conflict]. `undefined` = the variable is not set.
  it.each([
    ['sk_test_a', undefined, false],
    ['sk_test_a', 'pk_test_a', false],
    ['rk_test_a', 'pk_test_a', false],
    ['sk_test_a', 'pk_live_a', true],
    ['sk_live_a', 'pk_live_a', false],
    ['rk_live_a', 'pk_live_a', false],
    ['sk_live_a', undefined, true],
    ['sk_live_a', '', true],
    ['sk_live_a', 'pk_test_a', true],
  ] as const)('%s with publishable %o -> conflict %s', (secret, publishable, conflict) => {
    process.env.STRIPE_SECRET_KEY = secret;
    if (publishable !== undefined) process.env.STRIPE_PUBLISHABLE_KEY = publishable;
    expect(stripeKeyModesConflict()).toBe(conflict);
  });

  it('is not a conflict when there is no recognisable secret key: that case is refused elsewhere', () => {
    expect(stripeKeyModesConflict()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'garbage';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_a';
    expect(stripeKeyModesConflict()).toBe(false);
  });

  it('is not a conflict with the fake driver, whatever the keys say', () => {
    process.env.STRIPE_DRIVER = 'fake';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_a';
    expect(stripeKeyModesConflict()).toBe(false);
    // The pair that WOULD conflict under the real driver: a test secret key beside a live publishable one.
    process.env.STRIPE_SECRET_KEY = 'sk_test_a';
    expect(stripeKeyModesConflict()).toBe(false);
  });

  it('reads the prefix, not a substring: a key that merely contains pk_live_ is not a live publishable key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_a';
    process.env.STRIPE_PUBLISHABLE_KEY = 'xpk_live_a';
    expect(stripeKeyModesConflict()).toBe(true);
    process.env.STRIPE_SECRET_KEY = 'sk_test_a';
    expect(stripeKeyModesConflict()).toBe(false);
  });

  describe('arePaymentsEnabled refuses a conflict', () => {
    beforeEach(() => {
      process.env.PAYMENTS_ENABLED = 'true';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
      process.env.PUBLIC_API_URL = 'http://localhost:3000';
    });

    it('is OFF when only STRIPE_SECRET_KEY was flipped to live, the exact step V6 13.68 describes', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_a';
      expect(arePaymentsEnabled()).toBe(false);
    });

    it('is OFF for a live secret key beside a test publishable key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_a';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_a';
      expect(arePaymentsEnabled()).toBe(false);
    });

    it('is OFF for a test secret key beside a live publishable key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_a';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_a';
      expect(arePaymentsEnabled()).toBe(false);
    });

    it('stays ON for the state of the live service today: a test key, publishable key set or not', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_a';
      expect(arePaymentsEnabled()).toBe(true);
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_a';
      expect(arePaymentsEnabled()).toBe(true);
    });

    it('is ON for a consistent live pair', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_a';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_a';
      expect(arePaymentsEnabled()).toBe(true);
    });
  });
});

describe('isSafeTestAmountCents and assertPaymentAmountAllowed (CF3-17)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('validates test amounts: must be >= 50 cents (Stripe min) and < 100 cents (1,00 EUR cap)', () => {
    expect(isSafeTestAmountCents(49)).toBe(false);
    expect(isSafeTestAmountCents(50)).toBe(true);
    expect(isSafeTestAmountCents(75)).toBe(true);
    expect(isSafeTestAmountCents(99)).toBe(true);
    expect(isSafeTestAmountCents(100)).toBe(false);
    expect(isSafeTestAmountCents(150)).toBe(false);
    expect(isSafeTestAmountCents(0.5)).toBe(false);
  });

  it('assertPaymentAmountAllowed allows any amount when guard is not enabled', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_12345';
    expect(() => assertPaymentAmountAllowed(5000)).not.toThrow();
  });

  it('assertPaymentAmountAllowed allows amounts under 1 EUR when live test guard is active', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_12345';
    process.env.STRIPE_LIVE_TEST_ONLY = 'true';
    expect(() => assertPaymentAmountAllowed(75)).not.toThrow();
  });

  it('assertPaymentAmountAllowed throws when amount >= 1 EUR under active live test guard', () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_12345';
    process.env.STRIPE_LIVE_TEST_ONLY = 'true';
    expect(() => assertPaymentAmountAllowed(100)).toThrow(/plafond de securite autorise/);
    expect(() => assertPaymentAmountAllowed(2500)).toThrow(/plafond de securite autorise/);
  });
});

