/**
 * The ONE place the app states how to reach Revime.
 *
 * ✅ `CF-D3` ANSWERED 2026-09-04 by the client (message 12, thread log
 * `docs/client-messages/2026-09-03-04-thread-frais-livraison-et-rgpd.md` §12). He named THREE addresses on
 * revime.fr and chose this one for the « Support Revime » card and for the privacy policy:
 *   - `support@revime.fr` - user support (repairs, payments, refunds, disputes, reports, technical problems)
 *     AND personal-data / RGPD requests. This is the constant below.
 *   - `contact@revime.fr` - general contact, information requests, professional contacts. Not shown in the app.
 *   - `admin@revime.fr` - 🛑 INTERNAL ADMINISTRATION ONLY (Stripe, Twilio, Vercel, Render, admin accounts,
 *     sensitive exchanges). His words: « ne doit pas être affichée publiquement ». It must NEVER appear in
 *     this app, in a client-facing document, or in any string a user can read.
 *
 * History: from slice 22 (2026-09-04, `CF-45`) until this edit the value was a bracketed placeholder token,
 * and no EAS build was allowed while it stood (the pre-build grep for that token over `apps/mobile` had to
 * return nothing but this file). This edit lifts that bar: the token is gone from the tree, so the grep now
 * returns nothing at all. The history and the client's exact words live in `CLIENT_FEEDBACK_V1.md`, row
 * `CF-D3`.
 *
 * Every consumer reads this constant - the sheet's fourth card (`ProtectionSheet.tsx`) and the privacy
 * policy's two sites (`privacy-policy.ts`) - so a change of address is ONE edit here. Kept as a plain string
 * rather than `string | null` on purpose: a nullable value would let the sheet render « Écrivez-nous à » with
 * nothing after it, or silently drop the card, and both are the « claim with no channel » shape this constant
 * exists to end. One address, one constant, one edit.
 */
export const SUPPORT_EMAIL = 'support@revime.fr';
