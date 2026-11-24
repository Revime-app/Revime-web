import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconBriefcase, IconChevronRight } from '../icons';
import { ratingLabel } from '@revime/shared';

/**
 * « Votre activité · ce mois » - the navy summary card on the réparateur's Accueil
 * (`repareme-web/src/screens/AccueilPro.tsx:72-88`).
 *
 * 🛑 ITS HEADLINE IS NOT THE PROTOTYPE'S. The prototype leads with revenue - « 1 240 € »
 * - and revenue is **0 € for every account in production**, because it needs a RELEASED
 * commande and `PAYMENTS_ENABLED` is absent on Render. Shipping that literally would put
 * a zero in the largest type on the screen, which reads as a broken app rather than a new
 * one. The owner's call on 2026-08-20 was to keep the card and its composition and lead
 * with a number that is true today: offers sent this month.
 *
 * The prototype's « +18 % » delta is dropped rather than faked, but the reason first written
 * here was too strong and is corrected: it said *nothing stores a previous month's figure, so
 * there is no comparison to make.* Nothing stores one, true - and `revenueDeltaPercent` in
 * `@revime/shared` derives it from the commande list anyway, which is what « Tableau de bord »
 * does. The delta is absent from THIS card because the card has no room for a third line, and
 * on the dashboard it is absent only while the previous month is zero.
 *
 * Tapping it opens « Tableau de bord », as `AccueilPro.tsx:76` does. It opened « Mes
 * propositions » until 2026-08-20, when the dashboard was built.
 *
 * When `PAYMENTS_ENABLED` is flipped on, the headline swaps to revenue and this card needs
 * no other change - the sub-line already carries the repair count.
 */

type Props = {
  /** Offers sent since the first of the current month. */
  offersThisMonth: number;
  /** Commandes not yet in a terminal step. */
  activeRepairs: number;
  /**
   * CF6-D2: null (no reviews) and 0 both OMIT the rating, bullet and star included, rather than
   * rendering « - ★ »: an unrated réparateur is an absence, and a 0 there would read as a
   * catastrophic rating. Only a positive rating shows the star suffix.
   */
  rating: number | null;
  /** True while either query is in flight, so the card shows « - » instead of a wrong 0. */
  isPending: boolean;
  /**
   * CF4-G. How many « À faire » actions wait on the Tableau de bord (`todoBadgeCount`). A red
   * pill when > 0; NOTHING when 0, null (loading / error) or absent - a badge that is really
   * "not loaded" would be a claim.
   */
  todoCount?: number | null;
  onPress: () => void;
};

export function RepairerActivityCard({
  offersThisMonth,
  activeRepairs,
  rating,
  isPending,
  todoCount = null,
  onPress,
}: Props) {
  const { palette, radii, spacing } = useTheme();

  const headline = isPending
    ? '-'
    : `${offersThisMonth} offre${offersThisMonth === 1 ? '' : 's'} envoyée${offersThisMonth === 1 ? '' : 's'}`;

  const repairs = `${activeRepairs} réparation${activeRepairs === 1 ? '' : 's'} en cours`;
  const ratingSuffix = rating != null && rating > 0 ? ` · ${ratingLabel(rating)} ★` : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Votre activité ce mois"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.navy,
          borderRadius: radii.card,
          borderCurve: 'continuous',
          marginTop: spacing.lg,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Votre activité · ce mois</Text>
          <Text style={styles.headline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {headline}
          </Text>
          <View style={styles.metaRow}>
            <IconBriefcase size={13} color="rgba(255,255,255,0.85)" strokeWidth={2.4} />
            <Text style={styles.meta} numberOfLines={1}>
              {isPending ? '-' : `${repairs}${ratingSuffix}`}
            </Text>
          </View>
        </View>
        {todoCount !== null && todoCount > 0 && (
          // The Messages-tab badge's shape (`app/(tabs)/_layout.tsx`), but RED rather than
          // `accent.accent`: in réparateur mode the accent IS navy, which would vanish on this
          // navy card. The border is the card's own navy for the same cut-out look.
          <View
            accessible
            accessibilityLabel={`${todoCount} action${todoCount === 1 ? '' : 's'} à faire`}
            style={[styles.pill, { backgroundColor: palette.red, borderColor: palette.navy }]}
          >
            <Text style={[styles.pillText, { color: palette.paper }]}>
              {todoCount > 99 ? '99+' : todoCount}
            </Text>
          </View>
        )}
        <IconChevronRight size={20} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  label: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.72)' },
  /** `.font-display` at 30/800 in the prototype; Google Sans Flex tops out at 700 here. */
  headline: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 26, color: '#ffffff', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.85)', flex: 1 },
  pill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 10.5, lineHeight: 13 },
});
