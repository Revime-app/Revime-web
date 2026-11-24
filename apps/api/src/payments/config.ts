/**
 * The single reader of the payments flag, so the gate, the routes and the app can
 * never disagree about whether payment is on.
 *
 * Surfaced to the app through `MeResponse.paymentsEnabled`. Without that, the app
 * would have to guess, and a « Choisir » button that the server answers 422 to is
 * exactly the divergence this exists to prevent - the lesson from
 * `VERIFICATION_GATE_ENABLED`.
 *
 * Compared against the literal `'true'`, so a stray `'1'`, `'false'`, an empty
 * string or an unset variable all fail safe to OFF. An enabled-unless-disabled
 * reading would be the defect that charges a card in a half-configured
 * environment.
 */
export function arePaymentsEnabled(): boolean {
  if (process.env.PAYMENTS_ENABLED !== 'true') return false;

  // No webhook secret means no way to verify that a payment really happened. A
  // charge we cannot confirm is worse than no charge.
  if (!process.env.STRIPE_WEBHOOK_SECRET) return false;

  // Stripe requires absolute success/cancel URLs, and deriving them from the
  // request host is wrong behind Render's proxy.
  if (!process.env.PUBLIC_API_URL) return false;

  // The real driver with no key would silently fall back to the fake gateway,
  // which would report success while no money moved. Refuse instead.
  if (process.env.STRIPE_DRIVER === 'stripe' && !process.env.STRIPE_SECRET_KEY)
    return false;

  // A real secret key alongside a non-Stripe driver is a contradiction: someone
  // configured live credentials and the fake gateway. Contradictions are OFF,
  // because the alternative is telling a client his payment succeeded when the
  // fake gateway simply bounced him.
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_DRIVER !== 'stripe')
    return false;

  // A secret key and a publishable key from different modes: the PaymentIntent is made in one mode
  // and the app tries to pay it with the other, or a live charge is made with no way to take it.
  if (stripeKeyModesConflict()) return false;

  return true;
}

/**
 * A gateway call that has not returned within this window has failed, not stalled. Read by
 * `PaymentsService` (reaping a commande that never got a Stripe id) and by
 * `QuoteRequestsService` (refusing to close a request while a checkout is still being created).
 */
export const GATEWAY_GRACE_MS = 2 * 60 * 1000;

/**
 * Minimum Stripe EUR transaction amount in cents (0,50 EUR).
 */
export const STRIPE_MIN_EUR_CENTS = 50;

/**
 * Maximum authorized amount in cents for live-mode test transactions (< 1,00 EUR).
 * CF3-17 safety guardrail to prevent high-value accidental charges during testing.
 */
export const MAX_LIVE_TEST_AMOUNT_CENTS = 100;

// Secret AND restricted keys: `render.yaml` allows a restricted key for the service, and a
// restricted LIVE key that read as neither test nor live would have skipped the CF3-17
// live-amount guard below.
const TEST_KEY = /^(sk|rk)_test_/;
const LIVE_KEY = /^(sk|rk)_live_/;
const PUBLISHABLE_LIVE_KEY = /^pk_live_/;

/**
 * Returns true if Stripe is running with test keys (sk_test_* / rk_test_*) or using the fake driver.
 * With the stripe driver and no recognisable key it returns false: a banner that promises « aucun
 * débit réel » must never appear on the strength of a missing key.
 */
export function isStripeTestMode(): boolean {
  if (process.env.STRIPE_DRIVER !== 'stripe') return true;
  return TEST_KEY.test(process.env.STRIPE_SECRET_KEY ?? '');
}

/**
 * Returns true if Stripe is configured with live production keys (sk_live_* / rk_live_*).
 */
export function isStripeLiveMode(): boolean {
  return process.env.STRIPE_DRIVER === 'stripe' && LIVE_KEY.test(process.env.STRIPE_SECRET_KEY ?? '');
}

/**
 * True when the secret key and the publishable key disagree about the mode. PRE-4: « the live switch »
 * is NOT one variable. The banner and `isTestMode` follow the secret key, but the app pays the
 * PaymentIntent with `STRIPE_PUBLISHABLE_KEY` (echoed on every checkout response), and when that is
 * unset the app falls back to the `pk_test_` baked into every EAS build. So a live secret key beside
 * a test or missing publishable key makes a live PaymentIntent the app cannot pay, with a banner
 * that already says « live ».
 *
 * A live secret key therefore REQUIRES a live publishable key. A test secret key only rejects a live
 * publishable key: an unset one is the service's state today and works, because the baked key is a
 * test key too. With the fake driver or no recognisable secret key there is nothing to compare.
 */
export function stripeKeyModesConflict(): boolean {
  if (process.env.STRIPE_DRIVER !== 'stripe') return false;
  const secret = process.env.STRIPE_SECRET_KEY ?? '';
  const publishableIsLive = PUBLISHABLE_LIVE_KEY.test(process.env.STRIPE_PUBLISHABLE_KEY ?? '');
  if (LIVE_KEY.test(secret)) return !publishableIsLive;
  if (TEST_KEY.test(secret)) return publishableIsLive;
  return false;
}

/**
 * Validates if a given amount in cents is safe for live-mode testing.
 * Must be at least the Stripe EUR minimum (50 cents) and strictly under 1,00 EUR (100 cents).
 */
export function isSafeTestAmountCents(amountCents: number): boolean {
  return (
    Number.isInteger(amountCents) &&
    amountCents >= STRIPE_MIN_EUR_CENTS &&
    amountCents < MAX_LIVE_TEST_AMOUNT_CENTS
  );
}

/**
 * Guardrail check for transaction amounts.
 * If STRIPE_LIVE_TEST_ONLY is enabled and Stripe is in live mode, prevents creating
 * transactions that exceed 1,00 EUR.
 */
export function assertPaymentAmountAllowed(amountCents: number): void {
  if (process.env.STRIPE_LIVE_TEST_ONLY === 'true' && isStripeLiveMode()) {
    if (amountCents >= MAX_LIVE_TEST_AMOUNT_CENTS) {
      throw new Error(
        'Le montant de test en mode reel depasse le plafond de securite autorise (doit etre strictement inferieur a 1,00 EUR).'
      );
    }
  }
}
