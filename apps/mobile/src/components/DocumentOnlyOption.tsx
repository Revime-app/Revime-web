import { View, Text } from 'react-native';
import { Button } from './Button';
import { useTheme } from '../theme';

type Props = {
  /**
   * The SERVER's answer (`IdentityStatusResponse.documentOnlyAvailable`), never a local guess.
   * `false` exactly when a selfie fraud signal is on the account.
   *
   * 🛑 `| null` MEANS « NOT KNOWN YET », AND IT IS A THIRD STATE RATHER THAN A NULLABLE BOOLEAN.
   * Added 2026-09-02. This prop was `boolean` and both call sites read the field through `?? false`,
   * so `false` conflated THREE things - the server said no, the query has not resolved, and the API
   * predates the field - and all three rendered « La vérification avec reconnaissance faciale est
   * nécessaire pour votre compte. », a positive claim about the account that we do not know. On
   * every cold load of Profil that sentence appeared directly beneath « Vérifiez votre identité … »:
   * two contradictory sentences in one Card. And while this branch is unpushed, the app is newer than
   * the deployed API, so the field arrives `undefined` and the refusal rendered PERMANENTLY for
   * every réparateur.
   *
   * `?? null` at entry is `apps/mobile/AGENTS.md`'s own rule - *give absence a single
   * representation, and make it `null`, never `undefined`* - and the fail-safe is unchanged: nothing
   * is OFFERED when availability is unknown. What goes is the false statement.
   */
  available: boolean | null;
  /**
   * `documentOnlyRecommended`. True only for the codes where dropping the selfie is genuinely
   * the remedy, so the same action is promoted from a quiet control to an explained panel.
   */
  prominent: boolean;
  loading: boolean;
  onPress: () => void;
};

/**
 * The non-biometric route's affordance. ONE ACTION AT TWO WEIGHTS, not two features.
 *
 * 🛑 IT GATES ITSELF, SO NEITHER CALL SITE CAN FORGET - and it renders THREE different things,
 * which the first version of this header got wrong by describing only two. Corrected 2026-09-02:
 *
 *   `available === null`  → **returns null.** Availability is not known yet (the query has not
 *                           resolved, or the deployed API predates the field). Nothing is offered
 *                           AND nothing is claimed.
 *   `available === false` → the RULE and no control. The server has said no, so stating it is
 *                           honest. No CTA and no « contactez-nous », because there is no support
 *                           channel and `CF-D3` is open about exactly that. `CF-31`'s garantie
 *                           block is the precedent: state the rule, ask for nothing, and let
 *                           French prose beat a link to a server that says no. The test is not
 *                           « is this the helpful next step » but « will the server this button
 *                           lands on say yes today ».
 *   `available === true`  → the control, quiet or prominent per `prominent`.
 *
 * Both routes grant the same `IDENTITY` level and the same badge, so this copy must never imply
 * the alternative is lesser.
 *
 * 🛑 TWO CALL SITES, TWO DIFFERENT BUDGETS, AND THE HEADER USED TO STATE ONLY ONE. Corrected
 * 2026-09-02. Both on a 375pt iPhone SE; `Card` has NO `borderWidth`, verified in `Card.tsx`, and
 * `Button` adds `paddingHorizontal: 20` each side.
 *
 * 🛑 AND `Button variant="secondary"` CARRIES `borderWidth: 1`, which costs the label 2pt under
 * RN's border-box default. The label budget is inner − 40 − 2, not inner − 40.
 *
 *   `app/identite/retour.tsx`   375 − 32 (screen `paddingHorizontal: spacing.lg`) − 32 (Card)
 *                               = 311pt inner → **269pt** for a secondary Button's label
 *   `app/(tabs)/profil.tsx`     375 − 40 (`CONTENT_PADDING_H = 20`) − 32 (Card)
 *                               = 303pt inner → **261pt** for a secondary Button's label
 *
 *   « Vérifier sans reconnaissance faciale »   15pt/600   257.0pt
 *                                 of 269pt on retour  → fits, 12.0pt / 4.5% spare
 *                                 of 261pt on profil  → fits, **4.0pt / 1.5%** spare
 *   « Vous pouvez vérifier votre identité sans reconnaissance faciale. »
 *                                             13.5pt/600  409.8pt   wraps to 2 lines
 *                                 rendered on retour only (profil passes `prominent={false}`),
 *                                 so measured against 311pt: 255.2 + 151.5
 *   « La vérification avec reconnaissance faciale est nécessaire pour votre compte. »
 *                                             13pt/400    455.2pt   wraps to 2 lines on BOTH,
 *                                 identically: 272.0 + 180.2, which fits 303pt and 311pt alike
 *
 * PIL `ImageFont.getlength` against the shipped TTFs at 4x, run from the REPO ROOT. Re-measured
 * 2026-09-02 with a `.notdef` control - U+2605, U+2192 and a CJK codepoint all return the same
 * 8.5pt advance at 15pt, so a figure containing any of them would be a lower bound. All three
 * strings above are Latin plus accents, so none is.
 *
 * 🛑 The two wrapping strings must NEVER take `numberOfLines={1}` - they are measured to wrap,
 * and truncating them would hide part of the rule. And **1.5% is the real margin on Profil**, so
 * lengthening the button label by even one word overflows there while still fitting on retour.
 */
/**
 * Disabled per client mandate: verification without facial recognition is disabled because
 * facial recognition is strictly mandatory for identity verification.
 */
export function DocumentOnlyOption(_props: Props) {
  return null;
}
