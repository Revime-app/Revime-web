import type { PaymentSheet } from '@stripe/stripe-react-native';

const MERCHANT_COUNTRY_CODE = 'FR';

export type PaymentSheetParamsOptions = {
  clientSecret: string;
  accentColor: string;
  palette: {
    paper: string;
    line: string;
    ink: string;
    /** Bleu prusse `#010524`, the text colour the client asked for in the sheet (V8 B1). */
    navyDeep: string;
    muted: string;
    red: string;
  };
  radii: {
    field: number;
  };
  /**
   * REQUIRED, not optional. It decides `googlePay.testEnv`, and an optional flag would let a new
   * caller compile and silently get `false`: Google Pay in production mode against Stripe test
   * keys. `resolveCheckoutTestMode` is how the screen produces it.
   */
  isTestMode: boolean;
};

export function buildPaymentSheetParams(options: PaymentSheetParamsOptions) {
  // V8 B1 (FND8-010). ONE colour set, passed as BOTH `light` and `dark`, with every key the SDK
  // reads. On Android the sheet follows the PHONE's theme (the app's light pin never reaches
  // Android, FND8-011), and the SDK starts each mode from its own defaults and overrides only the
  // keys given. `componentText` (the typed card number, date, CVC, address) was the one key missing,
  // so in dark mode it stayed Stripe's dark default, white, on our white field: the client's B1.
  // The client's values: text #010524, white background, borders #DFE2E2 (= `line`, Platinum).
  const colors = {
    primary: options.accentColor,
    background: options.palette.paper,
    componentBackground: options.palette.paper,
    componentBorder: options.palette.line,
    componentDivider: options.palette.line,
    primaryText: options.palette.navyDeep,
    componentText: options.palette.navyDeep,
    secondaryText: options.palette.muted,
    placeholderText: options.palette.muted,
    icon: options.accentColor,
    error: options.palette.red,
  };
  const primaryButtonColors = {
    background: options.accentColor,
    text: options.palette.paper,
  };

  // `satisfies`, not a return type: the SDK's own `SetupParams` rejects a misspelled key here, while
  // the literal type is kept so callers and tests can read `googlePay.testEnv` without a cast.
  return {
    paymentIntentClientSecret: options.clientSecret,
    merchantDisplayName: 'Revime',
    applePay: {
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
    },
    googlePay: {
      merchantCountryCode: MERCHANT_COUNTRY_CODE,
      testEnv: options.isTestMode,
    },
    appearance: {
      colors: { light: colors, dark: colors },
      shapes: {
        borderRadius: options.radii.field,
      },
      primaryButton: {
        colors: { light: primaryButtonColors, dark: primaryButtonColors },
        shapes: {
          borderRadius: options.radii.field,
        },
      },
    },
    returnURL: 'revime://stripe-redirect',
  } satisfies PaymentSheet.SetupParams;
}

/**
 * CF6-07. Whether THIS checkout was made in Stripe test mode.
 *
 * The server's flag wins. Only an older API that sends none falls back to the publishable key the
 * server itself returned for this checkout, the very key `initStripe` is about to use, so the two
 * cannot disagree. It never reads a build-time `EXPO_PUBLIC_*` value: that is frozen in the binary
 * and would still say « test » after the server went live. Knowing nothing means false, the safe
 * direction for `googlePay.testEnv`.
 */
export function resolveCheckoutTestMode(session: {
  isTestMode?: boolean | null;
  publishableKey?: string | null;
}): boolean {
  return session.isTestMode ?? Boolean(session.publishableKey?.startsWith('pk_test_'));
}

/**
 * CF6-07. Whether the payment screen shows its « Mode test » banner.
 *
 * Both inputs are the SERVER's answers: `meFlag` from the session (`MeResponse.stripeTestMode`,
 * known before the first tap) and `checkoutFlag` from a checkout response (fresher, so it wins).
 * An older API sends neither, and then nothing is shown: a missing promise is harmless, a banner
 * promising « aucun débit réel » on a live server is not.
 */
export function shouldShowTestNotice(input: {
  meFlag: boolean | null | undefined;
  checkoutFlag: boolean | null | undefined;
}): boolean {
  return input.checkoutFlag ?? input.meFlag ?? false;
}
