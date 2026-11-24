import { describe, expect, it } from 'vitest';
import { palette } from '@revime/tokens';
import {
  buildPaymentSheetParams,
  resolveCheckoutTestMode,
  shouldShowTestNotice,
} from '../src/components/payment/payment-params';

describe('buildPaymentSheetParams (CF6-07)', () => {
  const base = {
    clientSecret: 'pi_test_123_secret_456',
    accentColor: '#1d4ed8',
    palette,
    radii: { field: 12 },
  };

  it('sets googlePay.testEnv from isTestMode alone, true or false', () => {
    expect(buildPaymentSheetParams({ ...base, isTestMode: true }).googlePay.testEnv).toBe(true);
    expect(buildPaymentSheetParams({ ...base, isTestMode: false }).googlePay.testEnv).toBe(false);
  });

  it('paints the primary button text with the palette paper, not a hard-coded white', () => {
    const params = buildPaymentSheetParams({ ...base, isTestMode: false });
    // V8 B1: the button colours are now passed per mode (`light` and `dark`), identical.
    expect(params.appearance.primaryButton.colors.light.text).toBe(palette.paper);
    expect(params.appearance.primaryButton.colors.dark.text).toBe(palette.paper);
  });

  it('asks for Apple Pay with the FR country code (asking is not enabling, see CF6-06)', () => {
    expect(buildPaymentSheetParams({ ...base, isTestMode: false }).applePay.merchantCountryCode).toBe('FR');
  });
});

describe('resolveCheckoutTestMode', () => {
  it('trusts the server flag in the checkout response when it is there', () => {
    expect(resolveCheckoutTestMode({ isTestMode: false, publishableKey: 'pk_test_abc' })).toBe(false);
    expect(resolveCheckoutTestMode({ isTestMode: true, publishableKey: 'pk_live_abc' })).toBe(true);
  });

  it('falls back to the publishable key the SERVER returned when an older API sends no flag', () => {
    expect(resolveCheckoutTestMode({ publishableKey: 'pk_test_abc' })).toBe(true);
    expect(resolveCheckoutTestMode({ isTestMode: undefined, publishableKey: 'pk_live_abc' })).toBe(false);
  });

  it('is false when it knows nothing, because that is the safe direction', () => {
    expect(resolveCheckoutTestMode({})).toBe(false);
    expect(resolveCheckoutTestMode({ isTestMode: null, publishableKey: null })).toBe(false);
  });
});

describe('shouldShowTestNotice', () => {
  it('shows the notice from the first render when the server says test mode in the session', () => {
    expect(shouldShowTestNotice({ meFlag: true, checkoutFlag: undefined })).toBe(true);
  });

  it('hides it when the server says live, whatever this build was compiled with', () => {
    expect(shouldShowTestNotice({ meFlag: false, checkoutFlag: undefined })).toBe(false);
  });

  it('lets the fresher checkout answer override the session flag in both directions', () => {
    expect(shouldShowTestNotice({ meFlag: true, checkoutFlag: false })).toBe(false);
    expect(shouldShowTestNotice({ meFlag: false, checkoutFlag: true })).toBe(true);
  });

  it('shows nothing when an older API sends neither flag: a missing promise is safe, a false one is not', () => {
    expect(shouldShowTestNotice({ meFlag: undefined, checkoutFlag: undefined })).toBe(false);
    expect(shouldShowTestNotice({ meFlag: null, checkoutFlag: null })).toBe(false);
  });
});
