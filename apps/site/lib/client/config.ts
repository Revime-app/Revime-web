/**
 * Demo mode shows the site with made-up data and never calls the API. It is for previews (a
 * Vercel preview link, screenshots). Production leaves NEXT_PUBLIC_DEMO_MODE unset.
 *
 * In demo mode the visitor starts signed out; « Se connecter » with any address signs him in for
 * the tab, so both sides of the site can be shown.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

const DEMO_KEY = 'revime-demo-signed-in';

export function demoSignedIn(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoSignedIn(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DEMO_KEY, '1');
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* private mode: the demo just stays signed out */
  }
}

/** Where sign-in lands when nothing asked for a page. */
export const HOME_PATH = '/';
