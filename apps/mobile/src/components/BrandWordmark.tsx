import { Image, StyleSheet } from 'react-native';

const LOGO = require('../../assets/brand/revime-logo.png');

/**
 * The client's delivered lockup, `LOGO_RENDU_PNG/Fichier 42@4x-8.png`, at 3749x666 with
 * alpha and no transparent padding (`trim` returns the same box, so this is the ART's
 * ratio and not a canvas artefact).
 *
 * Written as the division rather than as 5.6291 so it re-derives from the file and cannot
 * drift if the asset is ever re-exported at another size.
 */
const LOGO_ASPECT = 3749 / 666;

/**
 * The brand lockup as an image, shared by every surface that shows it.
 *
 * **Why this component exists rather than an `<Image>` at each call site.** As of 2026-08-21
 * six surfaces show the wordmark - both home headers via `BrandHeader`, plus onboarding and
 * the three auth screens, which until now drew it as LIVE TEXT (« Revi » in ink + « me » in
 * red). The owner reported the mismatch from his phone on build 5. Two independent copies of
 * the sizing rule below had already been written in this repo and one of them was wrong on
 * first attempt, so the rule lives in exactly one place now.
 *
 * 🛑 **BOTH dimensions are set explicitly. Do NOT replace this with `aspectRatio`.**
 *
 * An `Image` whose `source` is a static `require()` is a Yoga node WITH a measure function,
 * because the bundler records the asset's intrinsic pixel size. React Native's `layout-props`
 * reference is explicit about what that changes: *"on a node with a measure function, aspect
 * ratio works as though the measure function measures the flex basis"*. So `aspectRatio` is
 * not the missing-dimension constraint it is on a plain `View` - the intrinsic measurement
 * participates and wins.
 *
 * This app has been bitten twice, from opposite directions, which is why it is a rule:
 * `BrandHeader` with `{ height: 24, aspectRatio }` rendered the logo at its full 3749x666 and
 * filled the screen - **the explicit height was discarded too**, which is the tell that this
 * is not a width-arithmetic mistake; and `app/(auth)/roles.tsx` records *"aspectRatio gave it
 * width 0"*. With both dimensions definite, `aspectRatio` would be ignored anyway (same
 * reference: *"if both width AND height are set, aspectRatio has no effect"*), so this is the
 * only form that works rather than a defensive extra.
 *
 * `resizeMode="contain"` is what makes rounding to whole points safe: the leftover fraction is
 * letterboxed, never stretched. A wordmark must never be cropped, so `contain` is correct here
 * - do NOT generalise it to user photographs, which want `cover`.
 *
 * 🛑 **`accessibilityLabel` is not decoration.** Replacing a `Text` with an `Image` silently
 * removes the only thing a screen reader had to announce, and an unlabelled `Image` is skipped
 * or read as a filename. This restores what the text gave for free.
 *
 * **The logo does NOT repaint by mode.** Its red half stays red in réparateur mode, where
 * `accent.accent` is navy and everything else follows. That is correct - a brand mark is not
 * themed - but this app repaints accents by mode nearly everywhere, so it is stated here rather
 * than left looking like an oversight.
 */
export function BrandWordmark({ height = 24 }: { height?: number }) {
  return (
    <Image
      source={LOGO}
      style={[styles.logo, { width: Math.round(height * LOGO_ASPECT), height }]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Revime"
    />
  );
}

const styles = StyleSheet.create({
  // Nothing size-related belongs here: both axes are computed per call site from `height`.
  logo: { flexGrow: 0, flexShrink: 0 },
});
