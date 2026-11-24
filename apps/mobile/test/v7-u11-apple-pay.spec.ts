import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPLE_PAY_LINE,
  APPLE_PAY_MERCHANT_ID,
  applePayLine,
  merchantInBuild,
} from '../src/components/payment/apple-pay';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function filesUnder(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

describe('V7 U11 (A12): Apple Pay merchant', () => {
  it('names the merchant the client asked for', () => {
    expect(APPLE_PAY_MERCHANT_ID).toBe('merchant.fr.revime.app');
  });

  it('knows the build carries the merchant only when app.json says so', () => {
    expect(merchantInBuild({ applePayMerchantId: 'merchant.fr.revime.app' })).toBe(true);
    expect(merchantInBuild({ applePayMerchantId: 'merchant.fr.repareme.app' })).toBe(false);
    expect(merchantInBuild({})).toBe(false);
    expect(merchantInBuild(undefined)).toBe(false);
  });
});

describe('V7 U11 (A12): the payment screen line (DEC7-27 Q5)', () => {
  const ready = { os: 'ios', merchantInBuild: true, deviceSupported: true } as const;

  it('reads « Carte bancaire ou Apple Pay » on an iPhone that can pay with Apple Pay', () => {
    expect(APPLE_PAY_LINE).toBe('Carte bancaire ou Apple Pay');
    expect(applePayLine(ready)).toBe('Carte bancaire ou Apple Pay');
  });

  it('is absent on Android (Q9)', () => {
    expect(applePayLine({ ...ready, os: 'android' })).toBeNull();
  });

  it('is absent when the phone has no Apple Pay', () => {
    expect(applePayLine({ ...ready, deviceSupported: false })).toBeNull();
  });

  it('is absent in a build without the merchant, where the sheet cannot offer Apple Pay (Q4)', () => {
    expect(applePayLine({ ...ready, merchantInBuild: false })).toBeNull();
  });
});

describe('V7 U11 (A12): wiring', () => {
  it('StripeProvider names the merchant', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/<StripeProvider[\s\S]*?merchantIdentifier=\{APPLE_PAY_MERCHANT_ID\}[\s\S]*?>/);
  });

  it('initStripe on the payment screen names the same merchant', () => {
    const screen = read('app/demande/[id]/paiement.tsx');
    expect(screen).toMatch(/initStripe\(\{[\s\S]*?merchantIdentifier: APPLE_PAY_MERCHANT_ID,[\s\S]*?\}\)/);
  });

  it('the payment screen draws the line from the helper', () => {
    const screen = read('app/demande/[id]/paiement.tsx');
    expect(screen).toContain('applePayLine(');
    expect(screen).toContain('isPlatformPaySupported(');
  });

  it('app.json gives the Stripe plugin the merchant, which writes the entitlement (DEC7-27 Q4)', () => {
    const plugins = JSON.parse(read('app.json')).expo.plugins as unknown[];
    const stripe = plugins.find((p) => Array.isArray(p) && p[0] === '@stripe/stripe-react-native') as
      | [string, Record<string, unknown>]
      | undefined;
    expect(stripe?.[1]).toMatchObject({ merchantIdentifier: APPLE_PAY_MERCHANT_ID, enableGooglePay: true });
  });

  it('app.json tells the running app its build carries the merchant', () => {
    const extra = JSON.parse(read('app.json')).expo.extra as Record<string, unknown>;
    expect(merchantInBuild(extra)).toBe(true);
  });

  it('no source file names the pre-rename merchant any more', () => {
    const offenders = [...filesUnder('app'), ...filesUnder('src')].filter((rel) =>
      read(rel).includes('merchant.fr.repareme'),
    );
    expect(offenders).toEqual([]);
  });
});
