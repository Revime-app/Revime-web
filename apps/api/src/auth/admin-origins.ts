/**
 * V7 A6 (U10, `DEC7-26`). The dashboard's origins, from `ADMIN_ORIGIN`.
 *
 * The dashboard moves to https://admin.revime.fr while https://repareme-admin.vercel.app keeps
 * answering. Its proxy forwards the browser's `Origin` to the API (`apps/admin/lib/proxy.ts`), so
 * Better Auth's origin check and CORS must accept every host the dashboard is served on, or sign-in
 * breaks on the one left out. `ADMIN_ORIGIN` is therefore a comma-separated list: all entries are
 * trusted, and the FIRST is the host written into e-mail links (invitations, super-admin alerts).
 * A single value behaves exactly as before. `scripts/seed-demo/phase1-http.mjs` repeats the
 * first-entry rule in plain JS.
 */
const LOCAL_ADMIN_ORIGIN = 'http://localhost:3001';

export function adminOrigins(raw: string | undefined = process.env.ADMIN_ORIGIN): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return list.length > 0 ? [...new Set(list)] : [LOCAL_ADMIN_ORIGIN];
}

export function adminLinkOrigin(raw: string | undefined = process.env.ADMIN_ORIGIN): string {
  return adminOrigins(raw)[0]!;
}
