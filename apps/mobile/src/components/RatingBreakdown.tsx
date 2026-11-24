import { View, Text } from 'react-native';
import type { ReviewDto } from '@revime/shared';
import { useTheme } from '../theme';

/**
 * The five-bar rating distribution - the prototype's `.star-bar` (`styles.css:1565-1567`).
 *
 * Extracted 2026-08-20 when the réparateur's own « Tableau de bord » became its second
 * consumer. It is shared rather than transcribed twice for the same reason the rating
 * aggregate is derived and never stored: two copies of the arithmetic can come to disagree,
 * and here they would disagree about a number the user is being asked to trust. See
 * `RepairerStats` in `review.schemas.ts`.
 *
 * 🛑 **Renders nothing on an empty list, and every caller must rely on that** rather than
 * guarding itself. `percentAt` divides by `list.length`, so an empty list would give five
 * `NaN%` widths. Returning null here puts the guard in the one place that owns the division,
 * which is also why the prototype's own `|| 1` denominator guard is not transcribed: with
 * the check here, the denominator cannot be zero.
 *
 * The public profile pairs this with a large average to its left, so it passes
 * `showCounts={false}`; the dashboard has no average beside it and shows the per-star counts
 * the prototype's `TableauDeBord` puts at the end of each row.
 */
export function RatingBreakdown({
  reviews,
  showCounts = false,
}: {
  reviews: readonly ReviewDto[];
  /** Print the number of reviews at each star, as the dashboard does. */
  showCounts?: boolean;
}) {
  const { palette, accent } = useTheme();

  if (reviews.length === 0) return null;

  return (
    <View style={{ flex: 1, gap: 4 }}>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const count = countAt(reviews, star);
        return (
          <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 11,
                color: palette.muted,
                width: 22,
              }}
            >
              {star}★
            </Text>
            <View
              style={{
                flex: 1,
                height: 6,
                borderRadius: 999,
                backgroundColor: palette.mist,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.round((count / reviews.length) * 100)}%`,
                  height: 6,
                  borderRadius: 999,
                  /* The prototype hardcodes `var(--red)` here even on réparateur screens,
                     where every other accent is navy. Following the accent instead is
                     deliberate: `[data-mode="pro"]` repaints accents navy and this app
                     honours that everywhere, so a fixed red bar would be the one place the
                     mode leaks. It also keeps this extraction behaviour-preserving for the
                     public profile, which already used the accent. */
                  backgroundColor: accent.accent,
                }}
              />
            </View>
            {showCounts && (
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_500Medium',
                  fontSize: 11,
                  color: palette.muted,
                  minWidth: 24,
                  textAlign: 'right',
                }}
              >
                {count}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function countAt(list: readonly ReviewDto[], star: number): number {
  return list.filter((rv) => rv.rating === star).length;
}
