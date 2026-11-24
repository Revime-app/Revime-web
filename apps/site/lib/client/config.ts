/**
 * Demo mode shows the signed-in area with made-up data and never calls the API. It is for
 * previews (a Vercel preview link, screenshots) before the API trusts the site's origin.
 * Production leaves NEXT_PUBLIC_DEMO_MODE unset.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

/** Where the signed-in area lands after sign-in. */
export const HOME_PATH = '/accueil';
