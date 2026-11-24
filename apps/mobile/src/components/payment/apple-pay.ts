/**
 * V7 U11 (A12). The Apple Pay merchant, and the one line the payment screen draws about it.
 *
 * The merchant is the one the client asked for (`DEC7-27` Q7), created on his Apple account. Its
 * entitlement, `com.apple.developer.in-app-payments`, is written by the `@stripe/stripe-react-native`
 * plugin from `app.json`'s `merchantIdentifier`, and that line is added ONLY once both provisioning
 * profiles grant it (an entitlement the profile lacks fails code signing, `apps/mobile/AGENTS.md`).
 * So a build can exist without it, and then the Stripe sheet offers no Apple Pay whatever this
 * constant says: `merchantInBuild` reads `app.json`'s `extra.applePayMerchantId`, written in the same
 * commit as the plugin line, and the screen's line is drawn only when both agree.
 */
export const APPLE_PAY_MERCHANT_ID = 'merchant.fr.revime.app';

export const APPLE_PAY_LINE = 'Carte bancaire ou Apple Pay';

/** Whether THIS binary was built with the merchant (`Constants.expoConfig?.extra`). */
export function merchantInBuild(extra: Record<string, unknown> | null | undefined): boolean {
  return extra?.applePayMerchantId === APPLE_PAY_MERCHANT_ID;
}

/**
 * The line under « Payer X € en toute sécurité » (`DEC7-27` Q5): iOS only (Q9), only in a build that
 * carries the merchant, and only on a phone that can pay with Apple Pay (`isPlatformPaySupported`).
 */
export function applePayLine(input: {
  os: string;
  merchantInBuild: boolean;
  deviceSupported: boolean;
}): string | null {
  if (input.os !== 'ios' || !input.merchantInBuild || !input.deviceSupported) return null;
  return APPLE_PAY_LINE;
}
