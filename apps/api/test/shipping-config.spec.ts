import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isShippingQuotesEnabled, shippingDriver, shippingLabelBucket } from '../src/shipping/config.js';

const KEYS = [
  'SHIPPING_DRIVER', 'BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY',
  'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET', 'STORAGE_DRIVER', 'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'SHIPPING_LABEL_BUCKET',
] as const;
const saved: Record<string, string | undefined> = {};

function fullyConfigured() {
  process.env.SHIPPING_DRIVER = 'boxtal';
  process.env.BOXTAL_V1_ACCESS_KEY = 'k1';
  process.env.BOXTAL_V1_SECRET_KEY = 's1';
  process.env.BOXTAL_V3_ACCESS_KEY = 'k3';
  process.env.BOXTAL_V3_SECRET_KEY = 's3';
  process.env.BOXTAL_WEBHOOK_SECRET = 'whsec';
  process.env.STORAGE_DRIVER = 'fake';
}

describe('shipping config', () => {
  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('an absent or unknown SHIPPING_DRIVER is manual, and manual never enables quoting', () => {
    expect(shippingDriver()).toBe('manual');
    process.env.SHIPPING_DRIVER = 'sendcloud';
    expect(shippingDriver()).toBe('manual');
    expect(isShippingQuotesEnabled()).toBe(false);
  });

  it('boxtal with every credential and configured storage is ON', () => {
    fullyConfigured();
    expect(shippingDriver()).toBe('boxtal');
    expect(isShippingQuotesEnabled()).toBe(true);
  });

  it('boxtal with ANY one of the five secrets missing is OFF - fail closed', () => {
    for (const k of ['BOXTAL_V1_ACCESS_KEY', 'BOXTAL_V1_SECRET_KEY', 'BOXTAL_V3_ACCESS_KEY', 'BOXTAL_V3_SECRET_KEY', 'BOXTAL_WEBHOOK_SECRET'] as const) {
      fullyConfigured();
      delete process.env[k];
      expect(isShippingQuotesEnabled(), `missing ${k}`).toBe(false);
    }
  });

  it('boxtal with storage unconfigured is OFF: a label with nowhere to go is not a feature', () => {
    fullyConfigured();
    delete process.env.STORAGE_DRIVER;
    expect(isShippingQuotesEnabled()).toBe(false);
  });

  it('fake is a driver for tests and does NOT enable quoting on its own', () => {
    process.env.SHIPPING_DRIVER = 'fake';
    expect(shippingDriver()).toBe('fake');
    // The routes gate on the driver being boxtal; the fake is selected by the factory only.
    expect(isShippingQuotesEnabled()).toBe(false);
  });

  it('the label bucket defaults to shipping-labels and can be overridden', () => {
    expect(shippingLabelBucket()).toBe('shipping-labels');
    process.env.SHIPPING_LABEL_BUCKET = 'labels-test';
    expect(shippingLabelBucket()).toBe('labels-test');
  });
});
