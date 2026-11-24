/**
 * The Accueil headline's font size for a given content width, so
 * « Comparez, puis choisissez. » fits on ONE line and the headline is therefore exactly
 * two lines on every screen size.
 *
 * **Why a computed size rather than the prototype's flat 28.** The prototype breaks the
 * headline with an explicit `<br/>` and renders at 28px in a ~573px-wide web viewport,
 * where the second line fits easily. An iPhone 13 has 390pt of screen and 358pt of
 * content width after Accueil's padding, and that line does NOT fit at 28 - it wraps to a
 * third line. Reported from a real device on 2026-08-20.
 *
 * **No break placement avoids this.** Both candidate splits leave a ~26-character line
 * (« Comparez, puis choisissez. » or « Une réparation ? Comparez, »), so the copy cannot
 * be re-broken into two short lines and the size has to respond to width instead. The copy
 * is client-approved and is not being shortened to solve a layout problem.
 *
 * **The estimate.** Google Sans Flex SemiBold averages 0.4938em of advance per character
 * over this exact string, and the headline's `letterSpacing: -0.8` claws back 0.8pt per
 * character, so a line of `n` characters is roughly `n * (AVG_ADVANCE_EM * size - 0.8)`
 * wide. Solving for size at n = 26 gives the expression below.
 *
 * 🛑 **`AVG_ADVANCE_EM` IS FONT-SPECIFIC. Re-measure it if the typeface changes.** This
 * constant read 0.55 for Poppins SemiBold until the charte swap on 2026-08-20. Poppins'
 * true average over this string is 0.5253em, so 0.55 carried a deliberate ~4.7% safety
 * margin - the estimate over-states width, which under-sizes the text, which is the safe
 * direction. 0.52 is Google Sans Flex's measured 0.4938em carrying that same margin.
 *
 * Left at 0.55 the swap would not have crashed or wrapped; it would have quietly rendered
 * the headline 2pt smaller than it needed to on a 390pt screen, which no typecheck sees.
 * Measured with PIL's `ImageFont.getlength` against the shipped TTFs, not estimated.
 *
 * 🛑 **It is an ESTIMATE, not a measurement**, which is why the caller ALSO passes
 * `adjustsFontSizeToFit` and `numberOfLines={2}`. Each covers a different failure: this
 * function makes the text fit rather than truncate, `numberOfLines` guarantees no third
 * line at any width, and `adjustsFontSizeToFit` shrinks the rest of the way on iOS if a
 * particular glyph run runs wider than the 0.55em average, so the cap never has to
 * ellipsize. Relying on any one of the three alone leaves a real case broken.
 *
 * Lives in `src/lib` rather than being exported from the screen: a route file must export
 * only its component, and a pure helper here is also testable without importing React
 * Native, which is what let the width table below be checked at all.
 */
const HEADLINE_MAX = 28;
const HEADLINE_MIN = 22;
const LONGEST_LINE_CHARS = 26;
const AVG_ADVANCE_EM = 0.52;
const LETTER_SPACING = -0.8;

export function headlineFontSize(contentWidth: number): number {
  const perChar = contentWidth / LONGEST_LINE_CHARS;
  const size = (perChar - LETTER_SPACING) / AVG_ADVANCE_EM;
  return Math.max(HEADLINE_MIN, Math.min(HEADLINE_MAX, Math.floor(size)));
}

/**
 * The estimated rendered width of the longest line at a given size, exposed so the
 * fits-or-not check is the same arithmetic the sizing uses rather than a second copy.
 */
export function estimatedLongestLineWidth(size: number): number {
  return LONGEST_LINE_CHARS * (AVG_ADVANCE_EM * size + LETTER_SPACING);
}
