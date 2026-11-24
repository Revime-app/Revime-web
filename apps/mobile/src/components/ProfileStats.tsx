import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * The prototype's floating stats panel on the coloured hero (`styles.css:1233-1260`):
 * translucent white over the accent band, with hairline dividers between cells.
 *
 * 🛑 TWO CELLS FOR A CLIENT, THREE PLUS TWO FOR A RÉPARATEUR, and that asymmetry is the
 * honest answer rather than a layout compromise. The prototype shows a client
 * « Demandes / Note / Avis » with a 4.8 rating - but **clients are not rated in this
 * product**. Only réparateurs are: `rating`, `reviewCount` and `repairCount` live on
 * `RepairerProfileDto`, and there is no client equivalent anywhere in the schema. Rendering
 * a client rating would mean inventing the number, so the client panel carries the two
 * figures that are real (`Demandes`, `En cours`) and the réparateur panel carries five,
 * as two rows of 3 + 2 (CF4-10).
 *
 * `value` is a string so the caller decides how an absent number reads - a null rating
 * renders « - », while a `repairCount` of 0 renders « 0 », because zero repairs is a fact
 * and an unrated réparateur is an absence. That distinction is `RepairerProfileDto`'s own
 * (see its `rating` and `repairCount` comments) and this component must not flatten it.
 *
 * Two prop shapes, discriminated by which key is present: `stats` renders one row exactly
 * as before (the client panel's two cells); `rows` renders a column of rows, each one
 * today's flex row with vertical dividers between its own cells, and every row after the
 * first gets a top hairline - the same divider colour, turned horizontal - so a réparateur's
 * two rows read as one panel rather than two stacked ones.
 */
export type Stat = { value: string; label: string };

function StatsRow({ row, topDivider }: { row: Stat[]; topDivider: boolean }) {
  return (
    <View style={[styles.row, topDivider && styles.rowDivider]}>
      {row.map((s, i) => (
        <View
          key={s.label}
          style={[
            styles.cell,
            // `.profile-stats__cell + .profile-stats__cell { border-left: … }` - the divider
            // belongs to every cell but the first, so there is no trailing rule.
            i > 0 && styles.divider,
          ]}
        >
          <Text style={styles.num}>{s.value}</Text>
          <Text style={styles.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProfileStats(props: { stats: Stat[] } | { rows: Stat[][] }) {
  const rows = 'rows' in props ? props.rows : [props.stats];
  const nonEmpty = rows.filter((r) => r.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <View style={styles.panel}>
      {nonEmpty.map((row, i) => (
        <StatsRow key={row.map((s) => s.label).join('|')} row={row} topDivider={i > 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    // COLUMN, not row: the panel stacks `StatsRow`s, and each row stretches to the full
    // width so its `flex: 1` cells share it. As `row` (left over from before CF4-10, when
    // cells were direct children) the rows sat side by side at content width, every cell
    // collapsed to its padding and the figures were clipped away - the empty panel (CF4-45).
    flexDirection: 'column',
    marginTop: 18,
    // Translucent white over the band rather than a solid fill, so the accent reads through.
    // No `backdrop-filter` equivalent without a blur dependency, and at 14% opacity the
    // blur contributes almost nothing here.
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  // Top hairline for every row after the first - the panel's own vertical `divider` colour,
  // turned horizontal, so a multi-row réparateur panel reads as one bordered group.
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  cell: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  divider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.16)' },
  /**
   * NO `lineHeight` equal to the font size. The prototype's `line-height: 1` is safe in CSS,
   * where the glyph overflows its line box, but React Native CLIPS text to `lineHeight` - at
   * 20/20 the digits rendered visibly cropped top and bottom, which is the squashed « 0 »
   * reported from a device on 2026-08-20. Left unset so the platform uses the font's own
   * metrics; `alignItems: 'center'` on the cell does the vertical centring the tight line
   * height was doing.
   */
  num: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 20, color: '#ffffff' },
  label: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 10.5,
    marginTop: 4,
    color: 'rgba(255,255,255,0.82)',
  },
});
