import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconChevronRight } from '../icons';

/**
 * The prototype's `.result-row` (`styles.css:1046-1091`): a 44pt icon tile, a title with a
 * muted tag beneath it, and a disclosure chevron, separated by a hairline rather than
 * wrapped in a card.
 *
 * Replaces the stacked `Card`s Recherche used to render. Cards are the right container for
 * things that stand alone; a scan-and-pick list of 39 categories is a list, and the
 * prototype draws it as one. The tile also gives each row an anchor for the eye, which a
 * text-only card did not.
 *
 * `icon` is passed as an element rather than a component so the caller owns the
 * root-slug-to-icon mapping and this file stays presentational.
 */
type Props = {
  title: string;
  tag: string;
  icon: React.ReactNode;
  onPress: () => void;
  /** The last row omits its hairline, so the list does not end on a dangling rule. */
  last?: boolean;
  /**
   * A SECOND tag line, for a row carrying more facts than the prototype's single line holds.
   *
   * Added for the réparateur feed, which has four things a category row does not: distance,
   * budget, offer count and whether he has already quoted. The prototype's `.result-row__tag`
   * fits three, so the choice was a second line here or dropping real information. Optional,
   * so the client's category rows are byte-identical to before.
   */
  tag2?: string;
  /**
   * A node on the title's line, right-aligned before the chevron - the réparateur feed's
   * « Offre envoyée » badge.
   *
   * A node rather than a label so this file stays presentational and the caller keeps its own
   * `Badge` tone. Absent by default.
   */
  badge?: React.ReactNode;
};

export function ResultRow({ title, tag, icon, onPress, last = false, tag2, badge }: Props) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          // `.result-row:active { background: var(--mist) }`.
          backgroundColor: pressed ? palette.mist : 'transparent',
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: palette.line,
        },
      ]}
    >
      <View
        style={[
          styles.tile,
          { backgroundColor: palette.mist, borderCurve: 'continuous' },
        ]}
      >
        {icon}
      </View>
      <View style={styles.body}>
        {/* The badge shares the title's line, so a row with one is no taller than a row
            without. `flex: 1` on the title keeps a long one ellipsising rather than pushing
            the badge off the row. */}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.ink, flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        <Text style={[styles.tag, { color: palette.muted }]} numberOfLines={1}>
          {tag}
        </Text>
        {tag2 !== undefined && (
          <Text style={[styles.tag, { color: palette.muted }]} numberOfLines={1}>
            {tag2}
          </Text>
        )}
      </View>
      <IconChevronRight size={18} color={palette.faint} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `gap: 13px; padding: 13px 4px`.
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 4 },
  // `.result-row__chip`: 44x44, radius 12, mist.
  tile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // `.result-row__title`: 600 at 14.5px, ellipsised.
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14.5 },
  // `.result-row__tag`: 12px muted, 2px above.
  tag: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginTop: 2 },
});
