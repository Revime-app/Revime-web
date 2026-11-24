import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** Marks a category that opens its subcategories rather than selecting. */
  chevron?: boolean;
  /**
   * 🆕 `CF-34`. Overrides what a screen reader announces. Omitted, RN reads the `label`, which is
   * right for a chip that SELECTS - « Toutes », « 25 km » - and wrong for one that REMOVES: the
   * annuaire's active-filter chips read « Autour de 69003 × », and « × » carries no meaning to a
   * listener. All FIVE of this app's other clearing controls are labelled (counted 2026-09-02:
   * `CategorySearch:98`, `DemandeFeed:224`, `RepairerDirectory:211`, `DirectoryFilterSheet:260`,
   * `mes-categories:159` - « Effacer la recherche » / « Effacer le code postal »), so this follows
   * the local convention rather than introducing one.
   *
   * OPTIONAL and defaulting to undefined on purpose: `Chip` has 22-plus usages and a derived
   * default would relabel screens nobody asked about.
   */
  accessibilityLabel?: string;
  /**
   * How an ACTIVE chip is painted. Inactive is always mist with a line border.
   *
   * - `soft` (default): `accentSoft` fill, accent label. This app's own long-standing look.
   * - `accent`: solid accent, white label - the prototype's `.chip--accent.chip--active`
   *   (`styles.css:1039`). Recherche's category filter.
   * - `ink`: solid ink, white label - the prototype's plain `.chip--active`
   *   (`styles.css:284`). Messages' Tous / Non lus / Lus filter.
   *
   * 🛑 THE PROTOTYPE USES TWO DIFFERENT ACTIVE FILLS ON PURPOSE, which is why this is an
   * enum and not a boolean: red marks a chip that narrows WHAT you are looking at, ink marks
   * one that switches WHICH SET you are looking at. Getting them the same way round as the
   * prototype is the point of the prop.
   *
   * All three are OPT-IN over `soft`, deliberately: `Chip` has 22 usages across six files
   * (publish wizard, offer form, Comparaison, Messages, demande feed, réparateur directory),
   * so changing the default would restyle screens nobody asked about. Each keeps `soft`
   * until it is reviewed against its own prototype screen.
   */
  variant?: 'soft' | 'accent' | 'ink';
};

export function Chip({
  label,
  active,
  onPress,
  chevron,
  variant = 'soft',
  accessibilityLabel,
}: Props) {
  const { accent, palette, radii } = useTheme();

  const fill = !active
    ? palette.mist
    : variant === 'accent'
      ? accent.accent
      : variant === 'ink'
        ? palette.ink
        : accent.accentSoft;

  // The border tracks the fill so a solid chip has no contrasting outline, matching
  // `border-color: var(--ink)` on `.chip--active`.
  const border = !active
    ? palette.line
    : variant === 'ink'
      ? palette.ink
      : accent.accent;

  const labelColor = !active
    ? palette.muted
    : variant === 'soft'
      ? accent.accent
      : palette.paper;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: Boolean(active) }}
      style={[
        styles.base,
        { borderRadius: radii.pill, backgroundColor: fill, borderWidth: 1.5, borderColor: border },
      ]}
    >
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: labelColor }}>
        {label}
        {chevron ? '  ›' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 9,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
