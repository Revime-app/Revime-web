import { euros } from './compare-criteria.js';
import type { DemandeDto } from './demande.schemas.js';

/**
 * `CF-53`. The text a réparateur sends when he shares a demande from its detail header.
 *
 * The item comes from mockup `02`, which draws a heart and a share glyph on the demande header.
 * The heart shipped as `CF-19`/`CF-27`; this is the share half, and the owner's decision of
 * 2026-09-02 was **a readable description with a deep link appended** rather than a public web
 * page. There is no public URL for a demande and building one is a product direction, not this
 * item - so the TEXT is the load-bearing half here and the link is a bonus for whoever has the
 * app. Weight the copy accordingly: it has to stand on its own with the link stripped out.
 *
 * ## 🛑 Why this lives in `packages/shared` and not beside the screen
 *
 * `apps/mobile` has **no test harness** - `tsc` is its only gate. Put this in the screen and
 * nothing in the repo can ever assert what it produces. Here it is reached by the api
 * workspace's `test:unit`, which is a real gate, following the precedent of `demandeEditPolicy`
 * and `repairStatus` - both of which are mobile presentation helpers tested from
 * `apps/api/test/` for exactly this reason. `apps/api/test/demande-share-text.spec.ts` is the
 * only automated coverage this feature has.
 *
 * ## 🛑 Why the URL is a PARAMETER
 *
 * This package is imported by `apps/api` as well as by the app, so it must stay
 * platform-neutral. The link is built with `Linking.createURL()` from `expo-linking` at the call
 * site - a native module - and importing that here would drag Expo into the API's module graph.
 * Passing the finished string in also keeps this function pure, which is what makes it testable.
 */

/**
 * 🛑 A NARROW `Pick`, NOT `DemandeDto`, AND THE NARROWNESS IS THE POINT.
 *
 * Four groups of field are excluded, and only the first is about privacy in the ordinary sense:
 *
 * - **`distanceKm` is VIEWER-RELATIVE.** The detail screen renders « 75011 Paris · 2,4 km », and
 *   2,4 km is the distance from *the sender*. Copied into a message it becomes a false statement
 *   about the recipient - the class `apps/mobile/AGENTS.md` bans outright, and the same trap the
 *   prototype's « 2x plus de missions » and « ★ 4.8 » fell into: copy that asserts a fact about
 *   the user or the world rather than labelling a control.
 * - **`author` / its `username`.** A user handle should not travel in outbound text the subject
 *   never saw. The screen already says « Coordonnées visibles après acceptation d'une offre. »;
 *   this must not undercut it.
 * - **`photoUrls`.** Signed and expire after one hour, so a shared URL is broken by the time most
 *   recipients open it.
 * - **`description`, `offerCount`, `status`.** `description` is unbounded and would bury the
 *   link; the other two are live numbers that go stale the instant the message is sent, and a
 *   static text cannot carry them honestly.
 *
 * Making them absent from the TYPE means a future edit cannot reach for one by accident - the
 * compiler asks the question instead of a reviewer having to remember it. This is `CF-23`'s
 * required-prop trick pointed at a function parameter.
 */
export type DemandeShareFields = Pick<
  DemandeDto,
  'title' | 'brand' | 'model' | 'category' | 'locationLabel' | 'mode' | 'budgetCents'
>;

/**
 * The pricing posture, and it is a VERBATIM mirror of the badge on
 * `apps/mobile/app/demande/[id]/index.tsx` and `DemandeCard.tsx`, including the U+2019
 * apostrophe.
 *
 * 🛑 « Recherche d'offres » and NOT « 0 € ». An OFFERS-mode demande has no price yet, which is an
 * invitation to quote; a zero reads to the recipient as the client's ceiling. Both halves of the
 * condition are load-bearing - a BUDGET demande with a null budget falls back rather than
 * rendering « Budget  € ».
 *
 * Note this is a THIRD copy of that expression, and that is knowingly accepted rather than
 * hidden: `DemandeCard.tsx` and `NearbyDemandeRow.tsx` already disagree slightly (the latter
 * ignores `mode` entirely). Consolidating all four is a pre-existing cleanup that does not belong
 * in this slice - but this copy is the one under test, so it is the one to consolidate ONTO.
 */
function pricingPosture(d: DemandeShareFields): string {
  return d.mode === 'BUDGET' && d.budgetCents !== null
    ? `Budget ${euros(d.budgetCents)}`
    : 'Recherche d’offres';
}

/**
 * Builds the share message. `url` is the deep link, appended last.
 *
 * Shape, one line each:
 *
 *     Remplacement écran iPhone 13
 *     Apple iPhone 13                 <- dropped entirely when brand and model are both null
 *     Smartphone · 75011 Paris
 *     Budget 80 €
 *                                     <- one blank line, so the link is not read as part of the
 *     Voir cette demande dans Revime :   description in a preview that truncates
 *     revime:///demande/<id>
 *
 * 🛑 The link belongs in `Share.share({ message })`, never in `url`. React Native's `url` field
 * is **iOS-only** and `title` is **Android-only** (verified against the current RN reference), so
 * a link passed as `url` silently vanishes on Android - leaving a description with nothing to
 * tap and no error anywhere.
 */
export function demandeShareText(d: DemandeShareFields, url: string): string {
  const device = [d.brand, d.model].filter(Boolean).join(' ');

  /**
   * Assembled as an array and filtered, rather than a template literal with conditional
   * interpolation. A template producing an empty device line leaves a doubled `\n` behind, which
   * renders as a stray blank line and is invisible in code review. `filter` makes the absent line
   * genuinely absent.
   */
  return [
    d.title,
    device === '' ? null : device,
    `${d.category.labelFr} · ${d.locationLabel}`,
    pricingPosture(d),
    '',
    'Voir cette demande dans Revime :',
    url,
  ]
    .filter((line) => line !== null)
    .join('\n');
}
