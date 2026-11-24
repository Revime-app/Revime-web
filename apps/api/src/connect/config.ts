/**
 * The single reader of the Connect flag, so the routes, the promotion and the app
 * can never disagree about whether payout onboarding is on.
 *
 * A THIRD flag rather than a fold into PAYMENTS_ENABLED, and the separation is the
 * point: that one waits on the checkout webhook secret and the statement
 * descriptor, this one waits on a CONNECT webhook endpoint that exists in neither
 * mode. One flag would force them together and the safe setting would become the
 * union of both blockers.
 *
 * Surfaced to the app through `MeResponse.connectEnabled`. Without it the app would
 * have to guess, and a « Configurer » button the server answers 422 to is exactly
 * the divergence this exists to prevent.
 */
export function isConnectEnabled(): boolean {
  // Compared against the literal 'true' so a stray '1', 'false', an empty string
  // or an unset variable all fail safe to OFF. An enabled-unless-disabled reading
  // would be the defect that starts creating real Stripe accounts in a
  // half-configured environment.
  if (process.env.CONNECT_ENABLED !== 'true') return false;

  // No webhook secret means no way to verify that onboarding really completed, and
  // the webhook is the ONLY thing that grants a verification level. A grant we
  // cannot confirm is worse than no grant.
  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) return false;

  // Stripe requires absolute return and refresh URLs, and deriving them from the
  // request host is wrong behind Render's proxy.
  if (!process.env.PUBLIC_API_URL) return false;

  // The real driver with no key would silently fall back to the fake gateway,
  // which would report a verified account while none exists.
  if (process.env.STRIPE_DRIVER === 'stripe' && !process.env.STRIPE_SECRET_KEY)
    return false;

  // Live credentials beside the fake gateway. P1's review found this hole after
  // the first version of the same guard shipped without it: it reported enabled
  // while nothing real happened.
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_DRIVER !== 'stripe')
    return false;

  return true;
}
