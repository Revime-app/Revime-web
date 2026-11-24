import { View, StyleSheet, type DimensionValue } from 'react-native';
import { useTheme } from '../theme';

/**
 * `CF-55`. The confetti behind mockup `04` panel 4's « Félicitations ! ».
 *
 * 🛑 STATIC, AND THAT IS NOT A COMPROMISE MADE OUT OF LAZINESS. `react-native-reanimated` is
 * NOT installed, and adding it would break the installed dev client on the next reload and cost
 * a build - the `expo-blur` precedent in AGENTS.md. `@hugeicons/core-free-icons` has no
 * `ConfettiIcon` either; that was checked against its .d.ts with known-good controls. So the
 * options were hand-built Views or a new native dependency, and this is the non-native
 * equivalent the repo already reaches for in three other places.
 *
 * DETERMINISTIC rather than random: a fixed array renders identically every time, which means
 * it can be measured and reviewed. `Math.random()` here would make the screen unverifiable.
 *
 * COLOURS ARE EXISTING TOKENS ONLY. The mockup's confetti is multicoloured and the charte
 * declares unlisted colours « formellement proscrite », so this uses four existing tokens that
 * read as celebration without inventing one.
 *
 * 🛑 `palette.red` EXPLICITLY, NOT `accent.accent`, AND THE FOUR-TOKEN CLAIM USED TO BE FALSE.
 * Corrected 2026-09-01. This read `accent.accent`, and `packages/tokens`' `accents.pro` maps
 * `accent → palette.navy` - so in RÉPARATEUR MODE tone 0 and tone 1 were the SAME HUE and 8 of the
 * 16 pieces collapsed onto it, halving the celebration on a screen a réparateur is the only person
 * who ever sees. Naming the red directly keeps four distinct hues in BOTH modes. This is a
 * decorative flourish rather than a themed control, so it has no reason to follow the accent.
 */
const PIECES: { top: number; left: DimensionValue; rotate: string; tone: 0 | 1 | 2 | 3 }[] = [
  { top: 8, left: '12%', rotate: '18deg', tone: 0 },
  { top: 26, left: '78%', rotate: '-32deg', tone: 1 },
  { top: 44, left: '30%', rotate: '54deg', tone: 2 },
  { top: 60, left: '62%', rotate: '-12deg', tone: 3 },
  { top: 84, left: '8%', rotate: '40deg', tone: 1 },
  { top: 96, left: '88%', rotate: '22deg', tone: 0 },
  { top: 118, left: '46%', rotate: '-48deg', tone: 2 },
  { top: 132, left: '20%', rotate: '10deg', tone: 3 },
  { top: 150, left: '70%', rotate: '-24deg', tone: 0 },
  { top: 168, left: '36%', rotate: '62deg', tone: 1 },
  { top: 182, left: '84%', rotate: '-8deg', tone: 2 },
  { top: 200, left: '14%', rotate: '30deg', tone: 3 },
  { top: 216, left: '56%', rotate: '-40deg', tone: 1 },
  { top: 234, left: '26%', rotate: '16deg', tone: 0 },
  { top: 248, left: '74%', rotate: '-56deg', tone: 3 },
  { top: 264, left: '44%', rotate: '46deg', tone: 2 },
];

export function Confetti() {
  const { palette } = useTheme();
  // Four DISTINCT hues in both modes. See the header - `accent.accent` here was `palette.navy` in
  // réparateur mode, which made tones 0 and 1 identical.
  const tones = [palette.red, palette.navy, palette.greenDeep, palette.amber] as const;

  return (
    /* `pointerEvents: 'none'` is load-bearing: this layer sits over the screen and would
       otherwise swallow the « Commencer » tap. */
    <View style={styles.layer} pointerEvents="none">
      {PIECES.map((p, i) => (
        <View
          key={i}
          style={[
            styles.piece,
            {
              top: p.top,
              left: p.left,
              backgroundColor: tones[p.tone],
              transform: [{ rotate: p.rotate }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  piece: { position: 'absolute', width: 4, height: 9, borderRadius: 1 },
});
