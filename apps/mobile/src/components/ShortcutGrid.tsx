import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconChevronRight } from '../icons';
import { useTourTarget } from '../tour/use-tour';
import type { TourTargetId } from '../lib/tour-copy';

/**
 * The `RACCOURCIS` quick-action grid: a two-column grid of tiles, each an accent-tinted icon
 * square with a disclosure chevron, over a label and a short description.
 *
 * 🛑 THE CALLER PASSES ONLY TILES THAT RESOLVE, and this component takes any number rather than
 * assuming a fixed count. `Favoris` landed with `CF-18/19/20` on 2026-08-31 and is the client's
 * fourth tile; the réparateur grid deliberately has no Favoris tile and reaches that screen from
 * the feed header instead. `Paramètres` is now reachable (`CF-47`) and is included for both modes.
 *
 * An odd tile count flows 2 + 2 + 1 rather than stretching, which is why the layout is
 * `flexWrap` with a percentage basis rather than a fixed 2xN: the odd tile keeps its column
 * width, so the grid still reads as a grid.
 *
 * ---------------------------------------------------------------------------------------------
 * 🛑 `CF-11`, 2026-08-30: WHY THE CHEVRON IS BESIDE THE ICON AND NOT BESIDE THE LABEL, WHICH IS
 * NOT WHAT THE CLIENT'S MOCKUP DRAWS.
 *
 * Mockup `01` draws each tile horizontally - icon on the left, label and sub to its right, and a
 * chevron at the trailing edge. That arrangement cannot hold his own labels at two columns, and
 * this is measured rather than judged. Measured with PIL against the shipped
 * `GoogleSansFlex_700Bold.ttf`, at the 14pt this component uses:
 *
 *   « Mes offres reçues »  122.5pt      « Mes réparations »  112.8pt
 *
 * A 48%-basis tile on a 390pt screen is 168pt wide, and 16pt of padding each side leaves
 * **136pt**. Put a 40pt icon and a 16pt chevron on the label's row and the label is left with
 * about 62pt - « Mes offres reçues » truncates to « Mes off… ». Shrinking the icon and the type
 * does not rescue it: at 11.5pt bold the label still needs ~100pt against ~98pt available, and
 * 11.5pt is too small for a primary target.
 *
 * So the label keeps the tile's FULL width, which is the only arrangement that fits it, and the
 * chevron moves up beside the icon where it costs the label nothing. Every tile therefore gains
 * the disclosure affordance the mockup asks for, in the one position that does not truncate the
 * words it is disclosing. The narrowest device this must survive is a 375pt iPhone SE - 128.8pt
 * inner - where the widest label still fits with ~6pt to spare.
 *
 * The sub is `numberOfLines={2}` for the same reason and it is not defensive: « Informations
 * personnelles » measures **136.0pt** at 11.5pt regular, exactly the 390pt inner width and over
 * it on an SE. The mockup's own subs wrap to two lines, so this matches it rather than departing
 * from it. **If you add a tile, measure its label - do not read this comment and assume.**
 * ---------------------------------------------------------------------------------------------
 */
export type Shortcut = {
  label: string;
  sub: string;
  icon: React.ReactNode;
  onPress: () => void;
  /** V8 E2: the help bubble that spotlights this tile (« Mon profil »), if any. */
  tourTarget?: TourTargetId;
};

export function ShortcutGrid({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <View style={styles.grid}>
      {shortcuts.map((s) => (
        <ShortcutTile key={s.label} s={s} />
      ))}
    </View>
  );
}

/** One tile; its own component so a tile can carry a tour target (a hook) without a hook in a loop. */
function ShortcutTile({ s }: { s: Shortcut }) {
  const { palette, accent, radii } = useTheme();
  const tourTarget = useTourTarget(s.tourTarget ?? null);
  return (
        <Pressable
          {...tourTarget}
          accessibilityRole="button"
          onPress={s.onPress}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: palette.paper,
              borderColor: palette.line,
              borderRadius: radii.card,
              borderCurve: 'continuous',
              // `.qa-tile:active { transform: scale(0.97) }`.
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <View style={styles.topRow}>
            <View
              style={[
                styles.icon,
                { backgroundColor: accent.accentSoft, borderCurve: 'continuous' },
              ]}
            >
              {s.icon}
            </View>
            {/* A CHEVRON, not an arrow: `src/icons.ts` records that ChevronRight means « a
                screen lies behind this » where ArrowRight is « go do this ». A tile is
                navigation, so it is the chevron. Not focusable and not labelled - the
                Pressable already announces itself, and a second announcement per tile is
                noise to a screen reader. */}
            <IconChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
          </View>
          <Text style={[styles.label, { color: palette.ink }]} numberOfLines={1}>
            {s.label}
          </Text>
          <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={2}>
            {s.sub}
          </Text>
        </Pressable>
  );
}

const styles = StyleSheet.create({
  // `gap: 12` with a two-column basis. `48%` rather than `50%` leaves room for the gap
  // without needing to subtract it from a calc.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '48%',
    flexGrow: 0,
    padding: 16,
    borderWidth: 1,
    // `box-shadow: var(--shadow-sm)`, lighter than Card's - these sit in a grid, and Card's
    // 22pt blur on six tiles muddies the gaps between them.
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // The icon and the chevron share a row so the chevron takes no width from the label.
  // `marginBottom` moved here off the icon: it now spaces the whole row from the label,
  // and leaving it on the icon would have indented the chevron's baseline instead.
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14 },
  sub: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11.5, marginTop: 2 },
});
